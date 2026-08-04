import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  logLifecycleError,
  logLifecycleFinish,
  logLifecycleStart,
} from '../../common/bootstrap-observability';
import { UserStatus } from '../../common/enums/identity.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Role } from '../../roles/entities/role.entity';
import { UsersRepository } from '../repositories/users.repository';

const DEVELOPMENT_USER_EMAIL = 'zuany_acuna@cun.edu.co';
const DEVELOPMENT_USER_FULL_NAME = 'Zuany Acuña';
const DEVELOPMENT_USER_ROLE_CODE = 'ADMIN';
const DEVELOPMENT_USER_COORDINATION_CODE = 'coord-general';

@Injectable()
export class DevelopmentUserSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevelopmentUserSeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

  onApplicationBootstrap(): void {
    logLifecycleStart('DevelopmentUserSeedService');
    if (this.configService.get<string>('nodeEnv') !== 'development') {
      logLifecycleFinish(
        'DevelopmentUserSeedService',
        'skipped: not development',
      );
      return;
    }

    void this.seedDevelopmentUser()
      .then(() => {
        logLifecycleFinish('DevelopmentUserSeedService');
      })
      .catch((error: unknown) => {
        logLifecycleError('DevelopmentUserSeedService', error);
        this.logger.error(
          'Seed de usuario de desarrollo falló.',
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private async seedDevelopmentUser(): Promise<void> {
    const normalizedEmail = DEVELOPMENT_USER_EMAIL.trim().toLowerCase();

    const existing = await this.findDevelopmentUser(normalizedEmail);
    if (existing) {
      const roleCode = existing.role?.code ?? 'desconocido';
      const coordinationCode = existing.coordination?.code ?? 'desconocido';
      this.logger.log(
        `Usuario de desarrollo reutilizado: ${existing.email} | Rol: ${roleCode} | Coordinación: ${coordinationCode}`,
      );
      return;
    }

    const role = await this.rolesRepository.findOne({
      where: { code: DEVELOPMENT_USER_ROLE_CODE },
    });
    if (!role) {
      this.logger.error(
        `No se pudo crear el usuario de desarrollo: rol ${DEVELOPMENT_USER_ROLE_CODE} no encontrado.`,
      );
      return;
    }

    const coordination = await this.waitForCoordination(
      DEVELOPMENT_USER_COORDINATION_CODE,
    );
    if (!coordination) {
      this.logger.error(
        `No se pudo crear el usuario de desarrollo: coordinación ${DEVELOPMENT_USER_COORDINATION_CODE} no encontrada.`,
      );
      return;
    }

    try {
      const saved = await this.usersRepository.save(
        this.usersRepository.create({
          email: normalizedEmail,
          fullName: DEVELOPMENT_USER_FULL_NAME,
          status: UserStatus.ACTIVE,
          roleId: role.id,
          coordinationId: coordination.id,
          googleSub: null,
          photoUrl: null,
          lastLoginAt: null,
        }),
      );

      this.logger.log(
        `Usuario de desarrollo creado: ${saved.email} | Rol: ${role.code} | Coordinación: ${coordination.code}`,
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

      const reused = await this.findDevelopmentUser(normalizedEmail);
      if (!reused) {
        throw error;
      }

      const roleCode = reused.role?.code ?? 'desconocido';
      const coordinationCode = reused.coordination?.code ?? 'desconocido';
      this.logger.log(
        `Usuario de desarrollo reutilizado: ${reused.email} | Rol: ${roleCode} | Coordinación: ${coordinationCode}`,
      );
    }
  }

  private async waitForCoordination(
    code: string,
    attempts = 20,
    delayMs = 100,
  ): Promise<Coordination | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const coordination = await this.coordinationsRepository.findOne({
        where: { code },
      });
      if (coordination) {
        return coordination;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  }

  private async findDevelopmentUser(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.coordination', 'coordination')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
  }
}
