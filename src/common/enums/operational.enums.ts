/**
 * Enums del dominio operacional — alineados al frontend Cunmark
 */

export enum OperationalEventStatus {
  OPEN = 'open',
  MONITORING = 'monitoring',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
}

export enum RiskLevel {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum OperationalEnvironmentStatus {
  PENDING = 'pending',
  HEALTHY = 'healthy',
  ATTENTION = 'attention',
  CRITICAL = 'critical',
}

export enum OperationalTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DETERIORATING = 'deteriorating',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export enum TimelineEntryType {
  EVENT_REGISTERED = 'event_registered',
  INTERPRETATION_GENERATED = 'interpretation_generated',
  STATUS_CHANGE = 'status_change',
  NOTE = 'note',
}

/**
 * Estado de ejecución de una acción recomendada por la IA.
 * Contrato definitivo de producción para el Centro de Ejecución Operativa.
 */
export enum RecommendedActionExecutionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  EXECUTED = 'executed',
  NOT_EXECUTABLE = 'not_executable',
}

export enum IndicatorDirection {
  HIGHER_IS_WORSE = 'higher_is_worse',
  HIGHER_IS_BETTER = 'higher_is_better',
}

export enum IndicatorSource {
  ENGINE = 'engine',
  AI_SUGGESTED = 'ai_suggested',
}
