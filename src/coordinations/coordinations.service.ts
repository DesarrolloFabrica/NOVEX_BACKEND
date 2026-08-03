import { Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { SituationsRepository } from '../situations/repositories/situations.repository';
import {
  CoordinationGraphResponseDto,
  CoordinationNetworkStatusDto,
  CoordinationResponseDto,
  ListCoordinationsQueryDto,
} from './dto/coordination.dto';
import { Coordination } from './entities/coordination.entity';
import { CoordinationDependenciesRepository } from './repositories/coordination-dependencies.repository';
import { CoordinationsRepository } from './repositories/coordinations.repository';

const SEVERITY_SCORE: Record<SituationSeverity, number> = {
  [SituationSeverity.LOW]: 25,
  [SituationSeverity.MEDIUM]: 50,
  [SituationSeverity.HIGH]: 75,
  [SituationSeverity.CRITICAL]: 92,
};

@Injectable()
export class CoordinationsService {
  constructor(
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly dependenciesRepository: CoordinationDependenciesRepository,
    private readonly situationsRepository: SituationsRepository,
    private readonly scopeService: OperationalScopeService,
  ) {}

  async list(
    query: ListCoordinationsQueryDto,
    actor: AuthPayload,
  ): Promise<CoordinationResponseDto[]> {
    const items = await this.coordinationsRepository.findCatalog(
      query.includeInactive ?? false,
    );
    const scopedItems = query.catalog
      ? items
      : this.scopeService.filterCoordinationsByScope(actor, items);
    return scopedItems.map((item) => this.toResponse(item));
  }

  async getById(
    id: string,
    actor: AuthPayload,
  ): Promise<CoordinationResponseDto> {
    this.scopeService.assertCoordinationInScope(actor, id);

    const coordination = await this.coordinationsRepository.findOne({
      where: { id },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${id}`);
    }
    return this.toResponse(coordination);
  }

  async getGraph(actor: AuthPayload): Promise<CoordinationGraphResponseDto> {
    const [coordinations, dependencies] = await Promise.all([
      this.coordinationsRepository.findCatalog(false),
      this.dependenciesRepository.findCatalog(),
    ]);

    const scopedCoordinations = this.scopeService.filterCoordinationsByScope(
      actor,
      coordinations,
    );
    const scopedIds = new Set(scopedCoordinations.map((item) => item.id));

    return {
      coordinations: scopedCoordinations.map((item) => this.toResponse(item)),
      dependencies: dependencies
        .filter(
          (dependency) =>
            scopedIds.has(dependency.sourceCoordinationId) &&
            scopedIds.has(dependency.targetCoordinationId),
        )
        .map((dependency) => ({
          id: dependency.id,
          sourceCoordinationId: dependency.sourceCoordinationId,
          targetCoordinationId: dependency.targetCoordinationId,
          dependencyWeight: dependency.dependencyWeight,
          dependencyType: dependency.dependencyType,
          bidirectional: dependency.bidirectional,
        })),
    };
  }

  async getNetworkStatus(
    actor: AuthPayload,
  ): Promise<CoordinationNetworkStatusDto> {
    const coordinations = this.scopeService.filterCoordinationsByScope(
      actor,
      await this.coordinationsRepository.findCatalog(false),
    );
    const scopedCoordinationIds = new Set(coordinations.map((item) => item.id));

    const activeSituations = (
      await this.situationsRepository.find({
        where: {
          status: In([SituationStatus.OPEN, SituationStatus.IN_PROGRESS]),
        },
        select: ['id', 'coordinationId', 'severity', 'status'],
      })
    ).filter((situation) => scopedCoordinationIds.has(situation.coordinationId));

    const scores = activeSituations.map(
      (situation) => SEVERITY_SCORE[situation.severity] ?? 0,
    );
    const globalRiskScore =
      scores.length === 0
        ? 0
        : Math.round(
            scores.reduce((total, score) => total + score, 0) / scores.length,
          );

    const hasCritical = activeSituations.some(
      (situation) => situation.severity === SituationSeverity.CRITICAL,
    );
    const hasAttention = activeSituations.some(
      (situation) =>
        situation.severity === SituationSeverity.HIGH ||
        situation.severity === SituationSeverity.MEDIUM,
    );
    const networkStatus = hasCritical
      ? 'critical'
      : hasAttention
        ? 'attention'
        : 'stable';

    const disruptedCoordinationIds = new Set(
      activeSituations
        .filter(
          (situation) =>
            situation.severity === SituationSeverity.HIGH ||
            situation.severity === SituationSeverity.CRITICAL,
        )
        .map((situation) => situation.coordinationId),
    );
    const synchronizedCoordinationsCount = coordinations.filter(
      (coordination) => !disruptedCoordinationIds.has(coordination.id),
    ).length;

    return {
      networkStatus,
      globalRiskScore,
      activeIncidentsCount: activeSituations.length,
      coordinationsCount: coordinations.length,
      synchronizedCoordinationsCount,
      lastSynchronizedAt: new Date().toISOString(),
    };
  }

  private toResponse(coordination: Coordination): CoordinationResponseDto {
    return {
      id: coordination.id,
      code: coordination.code,
      name: coordination.name,
      shortName: coordination.shortName,
      description: coordination.description,
      color: coordination.color,
      icon: coordination.icon,
      imageAsset: coordination.imageAsset,
      displayOrder: coordination.displayOrder,
      isActive: coordination.isActive,
      createdAt: coordination.createdAt,
      updatedAt: coordination.updatedAt,
    };
  }
}
