import { OperationalIntegrityStatus } from '../../operational-overview/domain/coordination-integrity';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export class OperationalKpiScopeDto {
  type!: OperationalKpiScopeType;
  coordinationId?: string;
}

export class OperationalKpiUniverseDto {
  /** Catálogo activo de backend. No es la mesa de producto. */
  type!: 'active-catalog';
  coordinationCount!: number;
}

export class OperationalKpiMetricVersionsDto {
  integrity!: string;
  lifePoints!: string;
}

export class OperationalKpiStatusCountsDto {
  open!: number;
  inProgress!: number;
}

export class OperationalKpiSeverityCountsDto {
  critical!: number;
  high!: number;
  medium!: number;
  low!: number;
}

export class OperationalKpiDependenciesDto {
  incoming!: number;
  outgoing!: number;
}

export class OperationalKpiProblemCountsDto {
  activeCount!: number;
  status!: OperationalKpiStatusCountsDto;
  severity!: OperationalKpiSeverityCountsDto;
}

export class OperationalKpiCoordinationIdentityDto {
  id!: string;
  code!: string;
  name!: string;
  shortName!: string;
}

export class OperationalKpiCoordinationSnapshotDto {
  coordination!: OperationalKpiCoordinationIdentityDto;
  problems!: OperationalKpiProblemCountsDto;
  dependencies!: OperationalKpiDependenciesDto;
  integrityStatus!: OperationalIntegrityStatus;
  lifePoints!: number | null;
}

export class OperationalKpiCoordinationStatusTotalsDto {
  critical!: number;
  alert!: number;
  stable!: number;
  unknown!: number;
}

/**
 * Situaciones sin dueña. No es coordinación; no entra en problems de Dirección.
 */
export class OperationalKpiAnalystRegistryDto {
  integrityStatus!: OperationalIntegrityStatus;
  problems!: OperationalKpiProblemCountsDto;
}

export class OperationalKpiDirectionSnapshotDto {
  directionStatus!: OperationalIntegrityStatus;
  problems!: OperationalKpiProblemCountsDto;
  dependencies!: OperationalKpiDependenciesDto;
  coordinationStatusTotals!: OperationalKpiCoordinationStatusTotalsDto;
  analystRegistry!: OperationalKpiAnalystRegistryDto;
  /**
   * Filas del catálogo activo. No incluye el registro de analista.
   * Misma semántica que scope=coordination por ítem.
   */
  coordinations!: OperationalKpiCoordinationSnapshotDto[];
}

export class OperationalKpiResponseDto {
  scope!: OperationalKpiScopeDto;
  generatedAt!: string;
  universe!: OperationalKpiUniverseDto;
  metricVersions!: OperationalKpiMetricVersionsDto;
  coordination?: OperationalKpiCoordinationSnapshotDto;
  direction?: OperationalKpiDirectionSnapshotDto;
}

/**
 * Comparador: mismos items que `scope=coordination`, en el orden pedido.
 * Sin winner, score ni ranking compuesto.
 */
export class OperationalKpiCompareResponseDto {
  generatedAt!: string;
  universe!: OperationalKpiUniverseDto;
  metricVersions!: OperationalKpiMetricVersionsDto;
  items!: OperationalKpiCoordinationSnapshotDto[];
}
