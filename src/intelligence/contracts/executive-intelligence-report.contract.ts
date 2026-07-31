import { RiskLevel } from '../../common/enums/operational.enums';

/**
 * CONTRATO DEFINITIVO DE INTELIGENCIA OPERACIONAL — novex.intelligence.v2
 *
 * Este contrato es la respuesta completa del Asistente Ejecutivo Operacional.
 * Todo proveedor de IA (Gemini real o mock) debe producir exactamente esta
 * estructura. Ninguna capa superior (DTOs, entidades, frontend) debe cambiar
 * cuando se reemplace el proveedor.
 */

export const INTELLIGENCE_CONTRACT_VERSION = 'novex.intelligence.v2';

/**
 * Versiones legacy aceptadas en lectura tras el rebrand Omega → Cunmark → NOVEX.
 * Necesarias para reportes históricos en DB. Ver docs/LEGACY-OMEGA.md. No renombrar.
 */
export const LEGACY_INTELLIGENCE_CONTRACT_VERSIONS = [
  'cunmark.intelligence.v2',
  'omega.intelligence.v2',
] as const;

export type IntelligenceContractVersion =
  | typeof INTELLIGENCE_CONTRACT_VERSION
  | (typeof LEGACY_INTELLIGENCE_CONTRACT_VERSIONS)[number];

export function isSupportedIntelligenceContractVersion(
  version: string | undefined | null,
): version is IntelligenceContractVersion {
  if (!version) return false;
  if (version === INTELLIGENCE_CONTRACT_VERSION) return true;
  return (LEGACY_INTELLIGENCE_CONTRACT_VERSIONS as readonly string[]).includes(
    version,
  );
}

export type CertaintyLevel = 'low' | 'medium' | 'high';
export type ActionPriority = 'immediate' | 'high' | 'medium' | 'scheduled';
export type IndicatorTrend = 'up' | 'down' | 'stable';
export type ExecutiveUrgency = 'immediate' | 'high' | 'medium' | 'low';

/** 1. ¿Qué ocurrió? */
export interface IncidentSummary {
  executiveTitle: string;
  executiveSummary: string;
}

/** 2. ¿Qué tan grave es? — con nivel de certeza explicado. */
export interface RiskAssessment {
  riskScore: number;
  riskLevel: RiskLevel;
  severity: number;
  certainty: {
    level: CertaintyLevel;
    /** 0..100 para lectura ejecutiva directa. */
    percentage: number;
    explanation: string;
  };
}

/** 4. ¿A quién afecta? */
export interface ImpactAnalysis {
  internalImpactPercentage: number;
  externalImpactPercentage: number;
  studentImpactPercentage: number;
  affectedProcesses: string[];
  /** null cuando la IA no puede inferirlo del contexto (no inventa). */
  estimatedAffectedStudents: number | null;
  estimatedAffectedAreas: number;
}

/** Área afectada con nivel y motivo. */
export interface AffectedAreaAssessment {
  name: string;
  affectationLevel: RiskLevel;
  reason: string;
}

/** ¿Por qué ocurrió? — solo sobre el contexto recibido. */
export interface RootCauseAnalysis {
  detectedCauses: string[];
  hypotheses: string[];
  dependencies: string[];
}

/** 6. ¿Qué debería hacerse ahora? */
export interface RecommendedAction {
  priority: ActionPriority;
  action: string;
  reason: string;
  suggestedArea: string;
  recommendedTime: string;
}

/** 8. Indicadores operacionales sugeridos. */
export interface ExecutiveIndicator {
  name: string;
  explanation: string;
  unit: string;
  suggestedValue: number;
  trend: IndicatorTrend;
}

/** 9. Hito de seguimiento sugerido. */
export interface TimelineSuggestion {
  horizon: string;
  checkpoint: string;
}

/** 10. Conclusión final dirigida al Director. */
export interface ExecutiveConclusion {
  gravity: string;
  urgency: ExecutiveUrgency;
  recommendation: string;
}

/** Respuesta definitiva del Asistente Ejecutivo Operacional. */
export interface ExecutiveIntelligenceReport {
  contractVersion: IntelligenceContractVersion;
  incidentSummary: IncidentSummary;
  riskAssessment: RiskAssessment;
  impactAnalysis: ImpactAnalysis;
  affectedAreas: AffectedAreaAssessment[];
  rootCause: RootCauseAnalysis;
  /** 5. ¿Por qué la IA llegó a esa conclusión? */
  decisionFactors: string[];
  recommendedActions: RecommendedAction[];
  /** 7. ¿Qué pasa si nadie actúa? */
  operationalConsequences: string[];
  operationalIndicators: ExecutiveIndicator[];
  timelineSuggestions: TimelineSuggestion[];
  executiveConclusion: ExecutiveConclusion;
  /** Vacíos de información declarados explícitamente por la IA. */
  dataGaps: string[];
}
