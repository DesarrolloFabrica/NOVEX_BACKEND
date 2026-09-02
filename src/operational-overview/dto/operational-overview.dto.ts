import { OperationalIntegrityStatus } from '../domain/coordination-integrity';

/**
 * Contrato HTTP de LEVEL 0. Espejo exacto del contrato congelado en el
 * frontend (`modules/operational-cards/types/operational-overview.contract`).
 *
 * Deliberadamente fuera de este DTO:
 * - arte (iconAsset, islandAsset): lo resuelve el frontend;
 * - desglose highCount / mediumCount / lowCount: existe internamente para
 *   calcular la integridad, pero no sale por HTTP;
 * - triggeredCriticalRules, violations, unknownCoordinationsCount: metadata
 *   interna del dominio;
 * - SLA, overdueCount y riskScore: no determinan la integridad.
 */

/** `id` es el UUID y `code` el código institucional. No se invierten. */
export class CoordinationOverviewDto {
  id!: string;
  code!: string;
  name!: string;
  shortName!: string;
  /** Color de identidad. No comunica estado operacional. */
  color!: string;
  displayOrder!: number;
  status!: OperationalIntegrityStatus;
  activeProblemsCount!: number;
  criticalCount!: number;
  affectedCoordinationCount!: number;
}

/**
 * Situaciones registradas por un ANALISTA, sin coordinación dueña. Fuente
 * operacional adicional: no es carta, no suma en `totals` y no aumenta el
 * total de coordinaciones.
 */
export class AnalystRegistryOverviewDto {
  status!: OperationalIntegrityStatus;
  activeProblemsCount!: number;
  criticalCount!: number;
  affectedCoordinationCount!: number;
}

/** Reparto de COORDINACIONES por estado. Las desconocidas no entran. */
export class OperationalOverviewTotalsDto {
  critical!: number;
  alert!: number;
  stable!: number;
}

export class OperationalOverviewDto {
  directionStatus!: OperationalIntegrityStatus;
  /** ISO 8601, generado una sola vez por request. */
  generatedAt!: string;
  totals!: OperationalOverviewTotalsDto;
  coordinations!: CoordinationOverviewDto[];
  analystRegistry!: AnalystRegistryOverviewDto;
}
