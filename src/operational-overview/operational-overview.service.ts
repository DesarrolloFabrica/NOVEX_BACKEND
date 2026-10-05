import { Injectable, Logger } from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import {
  ANALYST_REGISTRY_KEY,
  buildCoordinationLifeSnapshots,
  emptyCoordinationLifeSnapshot,
} from './domain/build-coordination-snapshots';
import {
  OperationalIntegrityStatus,
  evaluateCoordinationIntegrity,
} from './domain/coordination-integrity';
import {
  CoordinationLifeSnapshot,
  evaluateCoordinationLifePoints,
} from './domain/coordination-life-points';
import {
  evaluateAnalystRegistryIntegrity,
  evaluateOperationalDirectionIntegrity,
} from './domain/operational-direction-integrity';
import {
  AnalystRegistryOverviewDto,
  CoordinationOverviewDto,
  OperationalOverviewDto,
} from './dto/operational-overview.dto';
import { OperationalOverviewRepository } from './repositories/operational-overview.repository';

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

    /*
     * TABLERO COMPLETO PARA TODOS LOS ROLES OPERATIVOS.
     *
     * Este recurso es el estado AGREGADO de la Dirección: es lo que dibuja la
     * mesa de cartas y lo que mira el personaje. Un coordinador necesita ver
     * las quince coordinaciones para poder elegir en cuál reporta —una
     * capacidad que la fase 1 le concedió— y para leer el estado institucional
     * del que su área forma parte.
     *
     * Lo que se abre aquí es EXCLUSIVAMENTE el agregado por área: estado,
     * conteos y áreas afectadas. NO se abre la lectura de los problemas de
     * otras coordinaciones: `SituationsService.list` sigue aplicando
     * `resolveSituationListCoordinationId`, así que un coordinador que pulse la
     * carta de otra área ve el recuento pero no la lista, y la interfaz debe
     * declarar ese alcance en lugar de presentar una lista parcial como
     * completa.
     */
    const coordinations = await this.coordinationsRepository.findCatalog(false);

    const [severityRows, affectedRows, incomingRows] = await Promise.all([
      this.overviewRepository.aggregateActiveSituationsBySeverity(),
      this.overviewRepository.aggregateAffectedCoordinations(),
      this.overviewRepository.aggregateIncomingDependencies(),
    ]);

    const snapshots = buildCoordinationLifeSnapshots(
      severityRows,
      affectedRows,
      incomingRows,
    );

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

  private toCoordinationDto(
    coordination: Coordination,
    snapshot: CoordinationLifeSnapshot | undefined,
  ): CoordinationOverviewDto {
    const resolved = snapshot ?? emptyCoordinationLifeSnapshot();
    const evaluation = evaluateCoordinationIntegrity(resolved);
    this.logInconsistency(
      `coordination ${coordination.code}`,
      evaluation.status,
      evaluation.violations,
    );

    // Misma fuente, regla distinta. Si la integridad ya registró el snapshot
    // como inconsistente no se repite el aviso; solo se avisa de lo que es
    // exclusivo de las vidas (el desglose entrante).
    const life = evaluateCoordinationLifePoints(resolved);
    if (life.violations.length > 0 && evaluation.violations.length === 0) {
      this.logger.warn(
        `Vidas no calculables en coordination ${coordination.code}: ${life.violations
          .map((violation) => `${violation.field}=${violation.issue}`)
          .join(', ')}. Se reporta lifePoints=null.`,
      );
    }

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
      incomingDependencyCount: resolved.incomingDependencyCount,
      lifePoints: life.lifePoints,
    };
  }

  private toAnalystRegistryDto(
    snapshot: CoordinationLifeSnapshot | undefined,
  ): AnalystRegistryOverviewDto {
    const resolved = snapshot ?? emptyCoordinationLifeSnapshot();
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
