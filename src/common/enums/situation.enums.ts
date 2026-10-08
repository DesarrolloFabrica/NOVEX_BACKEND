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

/**
 * Orden operacional de la severidad. Lo usa el historial para comprobar que un
 * escalamiento siempre SUBE de nivel; coincide con el orden del enum en
 * PostgreSQL (`situations_severity_enum`).
 */
export const SITUATION_SEVERITY_ORDER: readonly SituationSeverity[] = [
  SituationSeverity.LOW,
  SituationSeverity.MEDIUM,
  SituationSeverity.HIGH,
  SituationSeverity.CRITICAL,
];

/**
 * Origen de un nivel de severidad en `situation_severity_changes`.
 *
 *   REPORTED   La evaluación de quien registró el problema. Una sola fila por
 *              situación, con `effective_at = created_at`.
 *   AUTO_TIME  Escalamiento automático por permanencia sin resolver, según una
 *              política versionada. Existe en el esquema aunque todavía no haya
 *              ninguna política activa.
 *
 * `MANUAL` no existe a propósito: no hay flujo de producto que cambie la
 * severidad a mano. Añadirlo será un `ALTER TYPE … ADD VALUE` cuando lo haya.
 */
export enum SituationSeverityChangeSource {
  REPORTED = 'REPORTED',
  AUTO_TIME = 'AUTO_TIME',
}
