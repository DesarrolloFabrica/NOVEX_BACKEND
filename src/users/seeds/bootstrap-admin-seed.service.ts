import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStatus } from '../../common/enums/identity.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Role } from '../../roles/entities/role.entity';
import { UsersRepository } from '../repositories/users.repository';

const DEFAULT_ROLE_CODE = 'ADMIN';
const DEFAULT_COORDINATION_CODE = 'coord-general';

/**
 * Crea un usuario admin activo si BOOTSTRAP_ADMIN_EMAIL está definido.
 * No bloquea el lifecycle de Nest (otros seeds pueden terminar primero).
 */
@Injectable()
export class BootstrapAdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminSeedService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

  onApplicationBootstrap(): void {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) {
      return;
    }

    const fullName =
      process.env.BOOTSTRAP_ADMIN_FULL_NAME?.trim() || 'Administrador Novex';

    // Fire-and-forget: no bloquear OnApplicationBootstrap de otros módulos.
    void this.ensureWhenReady(email, fullName);
  }

  private async ensureWhenReady(
    email: string,
    fullName: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const role = await this.rolesRepository.findOne({
          where: { code: DEFAULT_ROLE_CODE },
        });
        const coordination = await this.coordinationsRepository.findOne({
          where: { code: DEFAULT_COORDINATION_CODE },
        });

        if (role && coordination) {
          await this.ensureAdminUser(email, fullName, role, coordination);
          return;
        }

        this.logger.warn(
          `Bootstrap admin: catálogo incompleto (intento ${attempt}/30). Esperando seeds...`,
        );
      } catch {
        this.logger.warn(
          `Bootstrap admin: error temporal en intento ${attempt}/30.`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.logger.error(
      'Bootstrap admin omitido: no aparecieron rol/coordinación a tiempo. Active CATALOG_SEED_ON_BOOT=true.',
    );
  }

  private async ensureAdminUser(
    email: string,
    fullName: string,
    role: Role,
    coordination: Coordination,
  ): Promise<void> {
    const existing = await this.findByEmail(email);
    if (existing) {
      this.logger.log(
        `Bootstrap admin ya existe: ${existing.email} | Rol: ${existing.role?.code ?? 'n/a'}`,
      );
      return;
    }

    try {
      const saved = await this.usersRepository.save(
        this.usersRepository.create({
          email,
          fullName,
          status: UserStatus.ACTIVE,
          roleId: role.id,
          coordinationId: coordination.id,
          googleSub: null,
          photoUrl: null,
          lastLoginAt: null,
        }),
      );

      this.logger.log(
        `Bootstrap admin creado: ${saved.email} | Rol: ${role.code} | Coordinación: ${coordination.code}`,
      );
    } catch (error) {
      const duplicateEmail =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505';

      if (!duplicateEmail) {
        throw error;
      }

      this.logger.log(`Bootstrap admin ya existía (unique): ${email}`);
    }
  }

  private findByEmail(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.coordination', 'coordination')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
  }
}
