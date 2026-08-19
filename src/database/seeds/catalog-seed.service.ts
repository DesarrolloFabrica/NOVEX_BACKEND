import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  logLifecycleError,
  logLifecycleFinish,
  logLifecycleStart,
} from '../../common/bootstrap-observability';
import { isCatalogSeedEnabled } from '../../configuration/catalog-seed.guard';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';
import {
  CATALOG_INCIDENT_CATEGORIES,
  CATALOG_OPERATIONAL_AREAS,
  DEMO_SEED_SOURCE,
} from './catalogs.seed';

@Injectable()
export class CatalogSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    @InjectRepository(OperationalArea)
    private readonly areasRepository: Repository<OperationalArea>,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    @InjectRepository(OperationalEvent)
    private readonly eventsRepository: Repository<OperationalEvent>,
  ) {}

  onApplicationBootstrap(): void {
    logLifecycleStart('CatalogSeedService');
    if (!isCatalogSeedEnabled()) {
      logLifecycleFinish(
        'CatalogSeedService',
        'skipped: catalog seed disabled',
      );
      return;
    }

    void this.runCatalogSeed()
      .then(() => {
        logLifecycleFinish('CatalogSeedService');
      })
      .catch((error: unknown) => {
        logLifecycleError('CatalogSeedService', error);
        this.logger.error(
          'Seed de catálogo operacional falló en arranque.',
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private async runCatalogSeed(): Promise<void> {
    await this.purgeDemoOperationalData();
    await this.seedOperationalAreas();
    await this.seedIncidentCategories();
  }

  /**
   * Elimina situaciones demo persistidas en arranques anteriores.
   * Las eliminaciones en cascada vacían interpretaciones, acciones y timeline.
   */
  private async purgeDemoOperationalData(): Promise<void> {
    const result = await this.eventsRepository
      .createQueryBuilder()
      .delete()
      .where('is_mock = :isMock', { isMock: true })
      .orWhere('source = :source', { source: DEMO_SEED_SOURCE })
      .execute();

    const removed = result.affected ?? 0;
    if (removed > 0) {
      this.logger.log(
        `Datos operacionales demo eliminados al arrancar: ${removed} situacion(es).`,
      );
    }
  }

  private async seedOperationalAreas(): Promise<void> {
    for (const item of CATALOG_OPERATIONAL_AREAS) {
      const existing = await this.areasRepository.findOne({
        where: { code: item.code },
      });

      if (existing) {
        await this.areasRepository.save({
          ...existing,
          name: item.name,
          description: item.description,
          isGlobal: item.isGlobal ?? false,
        });
        continue;
      }

      await this.areasRepository.save(
        this.areasRepository.create({
          code: item.code,
          name: item.name,
          description: item.description,
          isGlobal: item.isGlobal ?? false,
        }),
      );
    }
  }

  private async seedIncidentCategories(): Promise<void> {
    for (const item of CATALOG_INCIDENT_CATEGORIES) {
      const existing = await this.categoriesRepository.findOne({
        where: { code: item.code },
      });

      if (existing) {
        await this.categoriesRepository.save({
          ...existing,
          name: item.name,
          description: item.description,
          isSelectable: item.isSelectable ?? true,
          icon: item.icon,
        });
        continue;
      }

      await this.categoriesRepository.save(
        this.categoriesRepository.create({
          code: item.code,
          name: item.name,
          description: item.description,
          isSelectable: item.isSelectable ?? true,
          icon: item.icon,
        }),
      );
    }
  }
}
