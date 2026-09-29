export enum SituationSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum SituationStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

/**
 * Tipo de registro. Independiente de la categoría de incidente.
 *
 *   INTERNAL             Ocurre en la coordinación responsable.
 *   INTER_COORDINATION   Una coordinación afectada espera una entrega de otra
 *                        (la responsable). Un solo caso, un solo cierre.
 */
export enum SituationReportKind {
  INTERNAL = 'INTERNAL',
  INTER_COORDINATION = 'INTER_COORDINATION',
}
