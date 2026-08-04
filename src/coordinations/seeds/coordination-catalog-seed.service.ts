import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoordinationDependency } from '../entities/coordination-dependency.entity';
import { Coordination } from '../entities/coordination.entity';
import {
  CATALOG_COORDINATION_DEPENDENCIES,
  CATALOG_COORDINATIONS,
  IMPACT_AREA_COORDINATION_CODE,
} from './coordinations.catalog.seed';
import { isCatalogSeedEnabled } from '../../configuration/catalog-seed.guard';

@Injectable()
export class CoordinationCatalogSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoordinationCatalogSeedService.name);

  constructor(
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
    @InjectRepository(CoordinationDependency)
    private readonly dependenciesRepository: Repository<CoordinationDependency>,
  ) {}

  onApplicationBootstrap(): void {
    if (!isCatalogSeedEnabled()) {
      return;
    }

    void this.runCoordinationCatalogSeed().catch((error: unknown) => {
      this.logger.error(
        'Seed de coordinaciones falló en arranque.',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private async runCoordinationCatalogSeed(): Promise<void> {
    const coordinationsByCode = await this.seedCoordinations();
    await this.seedDependencies(coordinationsByCode);
  }

  private async seedCoordinations(): Promise<Map<string, Coordination>> {
    for (const item of CATALOG_COORDINATIONS) {
      const existing = await this.coordinationsRepository.findOne({
        where: { code: item.code },
      });

      if (existing) {
        await this.coordinationsRepository.save({
          ...existing,
          name: item.name,
          shortName: item.shortName,
          description: item.description,
          color: item.color,
          icon: item.icon,
          imageAsset: item.imageAsset,
          displayOrder: item.displayOrder,
          isActive: item.isActive,
        });
        continue;
      }

      await this.coordinationsRepository.save(
        this.coordinationsRepository.create({
          code: item.code,
          name: item.name,
          shortName: item.shortName,
          description: item.description,
          color: item.color,
          icon: item.icon,
          imageAsset: item.imageAsset,
          displayOrder: item.displayOrder,
          isActive: item.isActive,
        }),
      );
    }

    const coordinations = await this.coordinationsRepository.find();
    return new Map(
      coordinations.map((coordination) => [coordination.code, coordination]),
    );
  }

  private async seedDependencies(
    coordinationsByCode: Map<string, Coordination>,
  ): Promise<void> {
    const seen = new Set<string>();

    for (const item of CATALOG_COORDINATION_DEPENDENCIES) {
      const sourceCode = IMPACT_AREA_COORDINATION_CODE[item.sourceImpactAreaId];
      const targetCode = IMPACT_AREA_COORDINATION_CODE[item.targetImpactAreaId];

      if (!sourceCode || !targetCode) {
        throw new Error(
          `Dependencia sin mapeo de coordinación: ${item.sourceImpactAreaId} -> ${item.targetImpactAreaId}`,
        );
      }

      if (sourceCode === targetCode) {
        continue;
      }

      const edgeKey = `${sourceCode}::${targetCode}`;
      if (seen.has(edgeKey)) {
        continue;
      }
      seen.add(edgeKey);

      const sourceCoordination = coordinationsByCode.get(sourceCode);
      const targetCoordination = coordinationsByCode.get(targetCode);
      if (!sourceCoordination || !targetCoordination) {
        throw new Error(
          `Coordinación no encontrada para dependencia: ${sourceCode} -> ${targetCode}`,
        );
      }

      const existing = await this.dependenciesRepository.findOne({
        where: {
          sourceCoordinationId: sourceCoordination.id,
          targetCoordinationId: targetCoordination.id,
        },
      });

      if (existing) {
        await this.dependenciesRepository.save({
          ...existing,
          dependencyWeight: item.dependencyWeight,
          dependencyType: item.dependencyType,
          bidirectional: item.bidirectional,
        });
        continue;
      }

      await this.dependenciesRepository.save(
        this.dependenciesRepository.create({
          sourceCoordinationId: sourceCoordination.id,
          targetCoordinationId: targetCoordination.id,
          dependencyWeight: item.dependencyWeight,
          dependencyType: item.dependencyType,
          bidirectional: item.bidirectional,
        }),
      );
    }

    this.logger.log(
      `Catálogo de coordinaciones sincronizado: ${coordinationsByCode.size} coordinaciones, ${seen.size} dependencias.`,
    );
  }
}
