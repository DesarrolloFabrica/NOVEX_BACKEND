import { Injectable, Logger } from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { SituationSeverity } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import {
  CoordinationIntegritySnapshot,
  OperationalIntegrityStatus,
  evaluateCoordinationIntegrity,
} from './domain/coordination-integrity';
import {
  evaluateAnalystRegistryIntegrity,
  evaluateOperationalDirectionIntegrity,
} from './domain/operational-direction-integrity';
import {
  AnalystRegistryOverviewDto,
  CoordinationOverviewDto,
  OperationalOverviewDto,
} from './dto/operational-overview.dto';
import {
  ActiveSeverityRow,
  AffectedCoordinationRow,
  OperationalOverviewRepository,
} from './repositories/operational-overview.repository';

/** Clave del grupo sin coordinación dueña: Registro de analista. */
const ANALYST_REGISTRY_KEY = '__analyst_registry__';

function emptySnapshot(): CoordinationIntegritySnapshot {
  return {
    activeProblemsCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    affectedCoordinationCount: 0,
  };
}

/**
 * LEVEL 0 de la experiencia de cartas: estado de la Dirección de Operaciones,
 * resumen de las coordinaciones visibles y Registro de analista, en una sola
 * operación lógica.
 *
 * No usa `operational_events`, ni el dashboard legacy, ni IA, ni riskScore, ni
 * SLA. La política de integridad vive en `domain/` y aquí solo se compone.
 */
@Injectable()
export class OperationalOverviewService {
  private readonly logger = new Logger(OperationalOverviewService.name);

  constructor(
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly overviewRepository: OperationalOverviewRepository,
    private readonly scopeService: OperationalScopeService,
  ) {}

  async getOverview(actor: AuthPayload): Promise<OperationalOverviewDto> {
    this.scopeService.assertPermission(actor, 'SITUATIONS_VIEW');

    const generatedAt = new Date().toISOString();

    const coordinations = this.scopeService.filterCoordinationsByScope(
      actor,
      await this.coordinationsRepository.findCatalog(false),
    );

    const [severityRows, affectedRows] = await Promise.all([
      this.overviewRepository.aggregateActiveSituationsBySeverity(),
      this.overviewRepository.aggregateAffectedCoordinations(),
    ]);

    const snapshots = this.buildSnapshots(severityRows, affectedRows);

    const coordinationDtos = coordinations.map((coordination) =>
      this.toCoordinationDto(coordination, snapshots.get(coordination.id)),
    );

    const analystRegistry = this.toAnalystRegistryDto(
      // Los casos sin coordinación dueña son lectura institucional: un actor
      // limitado a su área no los recibe, igual que en getNetworkStatus.
      this.scopeService.isCoordinationScoped(actor)
        ? undefined
        : snapshots.get(ANALYST_REGISTRY_KEY),
    );

    const direction = evaluateOperationalDirectionIntegrity({
      coordinationStatuses: coordinationDtos.map((item) => item.status),
      analystRegistryStatus: analystRegistry.status,
    });

    return {
      directionStatus: direction.status,
      generatedAt,
      totals: direction.totals,
      coordinations: coordinationDtos,
      analystRegistry,
    };
  }

  /**
   * Fusiona las dos agregaciones en un snapshot por dueño. Ambas provienen del
   * mismo filtro de estados activos, así que la invariante de severidades
   * (suma === activos) se cumple por construcción.
   */
  private buildSnapshots(
    severityRows: readonly ActiveSeverityRow[],
    affectedRows: readonly AffectedCoordinationRow[],
  ): Map<string, CoordinationIntegritySnapshot> {
    const snapshots = new Map<string, CoordinationIntegritySnapshot>();

    const keyOf = (coordinationId: string | null): string =>
      coordinationId ?? ANALYST_REGISTRY_KEY;

    const ensure = (key: string): CoordinationIntegritySnapshot => {
      const existing = snapshots.get(key);
      if (existing) return existing;
      const created = emptySnapshot();
      snapshots.set(key, created);
      return created;
    };

    for (const row of severityRows) {
      const snapshot = ensure(keyOf(row.coordinationId));
      snapshot.activeProblemsCount += row.total;

      switch (row.severity) {
        case SituationSeverity.CRITICAL:
          snapshot.criticalCount += row.total;
          break;
        case SituationSeverity.HIGH:
          snapshot.highCount += row.total;
          break;
        case SituationSeverity.MEDIUM:
          snapshot.mediumCount += row.total;
          break;
        case SituationSeverity.LOW:
          snapshot.lowCount += row.total;
          break;
      }
    }

    for (const row of affectedRows) {
      ensure(keyOf(row.coordinationId)).affectedCoordinationCount = row.total;
    }

    return snapshots;
  }

  private toCoordinationDto(
    coordination: Coordination,
    snapshot: CoordinationIntegritySnapshot | undefined,
  ): CoordinationOverviewDto {
    const resolved = snapshot ?? emptySnapshot();
    const evaluation = evaluateCoordinationIntegrity(resolved);
    this.logInconsistency(
      `coordination ${coordination.code}`,
      evaluation.status,
      evaluation.violations,
    );

    return {
      id: coordination.id,
      code: coordination.code,
      name: coordination.name,
      shortName: coordination.shortName,
      color: coordination.color,
      displayOrder: coordination.displayOrder,
      status: evaluation.status,
      activeProblemsCount: resolved.activeProblemsCount,
      criticalCount: resolved.criticalCount,
      affectedCoordinationCount: resolved.affectedCoordinationCount,
    };
  }

  private toAnalystRegistryDto(
    snapshot: CoordinationIntegritySnapshot | undefined,
  ): AnalystRegistryOverviewDto {
    const resolved = snapshot ?? emptySnapshot();
    const evaluation = evaluateAnalystRegistryIntegrity(resolved);
    this.logInconsistency(
      'analyst registry',
      evaluation.status,
      evaluation.violations,
    );

    return {
      status: evaluation.status,
      activeProblemsCount: resolved.activeProblemsCount,
      criticalCount: resolved.criticalCount,
      affectedCoordinationCount: resolved.affectedCoordinationCount,
    };
  }

  /**
   * Una fuente incoherente se degrada a DESCONOCIDO y se registra, en vez de
   * tumbar el overview completo: las demás conservan su estado.
   */
  private logInconsistency(
    source: string,
    status: OperationalIntegrityStatus,
    violations: readonly { field: string; issue: string }[],
  ): void {
    if (violations.length === 0) return;

    this.logger.warn(
      `Snapshot operacional inconsistente en ${source}: ${violations
        .map((violation) => `${violation.field}=${violation.issue}`)
        .join(', ')}. Se reporta ${status}.`,
    );
  }
}
