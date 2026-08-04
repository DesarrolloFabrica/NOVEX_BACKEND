import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  logLifecycleFinish,
  logLifecycleStart,
} from '../../common/bootstrap-observability';
import { isCatalogSeedEnabled } from '../../configuration/catalog-seed.guard';
import { Permission } from '../entities/permission.entity';
import { CATALOG_PERMISSIONS } from './permissions.catalog.seed';

@Injectable()
export class PermissionCatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(PermissionCatalogSeedService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  async onModuleInit(): Promise<void> {
    logLifecycleStart('PermissionCatalogSeedService');
    if (!isCatalogSeedEnabled()) {
      logLifecycleFinish(
        'PermissionCatalogSeedService',
        'skipped: catalog seed disabled',
      );
      return;
    }

    try {
      for (const item of CATALOG_PERMISSIONS) {
        const existing = await this.permissionsRepository.findOne({
          where: { code: item.code },
        });

        if (existing) {
          await this.permissionsRepository.save({
            ...existing,
            name: item.name,
            module: item.module,
            description: item.description,
          });
          continue;
        }

        await this.permissionsRepository.save(
          this.permissionsRepository.create({
            code: item.code,
            name: item.name,
            module: item.module,
            description: item.description,
          }),
        );
      }

      this.logger.log(
        `Catálogo de permisos sincronizado: ${CATALOG_PERMISSIONS.length} permisos.`,
      );
      logLifecycleFinish('PermissionCatalogSeedService');
    } catch (error) {
      logLifecycleFinish('PermissionCatalogSeedService', 'failed');
      throw error;
    }
  }
}
