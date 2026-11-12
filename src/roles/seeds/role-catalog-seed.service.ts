import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  logLifecycleFinish,
  logLifecycleStart,
} from '../../common/bootstrap-observability';
import { isCatalogSeedEnabled } from '../../configuration/catalog-seed.guard';
import { Role } from '../entities/role.entity';
import { CATALOG_ROLES } from './roles.catalog.seed';
import { AuditResourceType } from '../../audit/audit-action.enum';
import {
  ROLE_DEFINITION_ACTIONS,
  findAdminManagedIds,
} from '../../audit/admin-managed';

@Injectable()
export class RoleCatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(RoleCatalogSeedService.name);

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async onModuleInit(): Promise<void> {
    logLifecycleStart('RoleCatalogSeedService');
    if (!isCatalogSeedEnabled()) {
      logLifecycleFinish(
        'RoleCatalogSeedService',
        'skipped: catalog seed disabled',
      );
      return;
    }

    try {
      // Roles editados desde la Consola: el catálogo no los resincroniza.
      const adminManaged = await findAdminManagedIds(
        this.rolesRepository.manager,
        AuditResourceType.ROLE,
        ROLE_DEFINITION_ACTIONS,
      );
      for (const item of CATALOG_ROLES) {
        const existing = await this.rolesRepository.findOne({
          where: { code: item.code },
        });

        if (existing && adminManaged.has(existing.id)) {
          continue;
        }

        if (existing) {
          await this.rolesRepository.save({
            ...existing,
            name: item.name,
            description: item.description,
            isSystem: item.isSystem,
            isActive: item.isActive,
          });
          continue;
        }

        await this.rolesRepository.save(
          this.rolesRepository.create({
            code: item.code,
            name: item.name,
            description: item.description,
            isSystem: item.isSystem,
            isActive: item.isActive,
          }),
        );
      }

      this.logger.log(
        `Catálogo de roles sincronizado: ${CATALOG_ROLES.length} roles.`,
      );
      logLifecycleFinish('RoleCatalogSeedService');
    } catch (error) {
      logLifecycleFinish('RoleCatalogSeedService', 'failed');
      throw error;
    }
  }
}
