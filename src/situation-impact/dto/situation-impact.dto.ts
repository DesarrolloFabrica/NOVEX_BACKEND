import {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';

export interface AffectedCoordinationInput {
  coordinationId: string;
  impactLevel: ImpactLevel;
  description: string;
}

export interface SaveImpactAssessmentInput {
  situationId: string;
  operationalSeverity: OperationalSeverity;
  confidence: number;
  estimatedDurationMinutes: number;
  summary: string;
  reasoning: string;
  affectedCoordinations: AffectedCoordinationInput[];
}

/**
 * Naturaleza de las coordinaciones que propone el análisis IA (Fase 01B.2).
 * Son SUGERENCIAS: no alimentan la integridad, las vidas ni ningún indicador,
 * y no cambian coordinación, estado ni severidad del caso. Solo cuentan como
 * propagación las relaciones confirmadas por un usuario autorizado.
 */
export const AI_SUGGESTION_ORIGIN = 'AI_SUGGESTION' as const;
export type AffectedCoordinationOrigin = typeof AI_SUGGESTION_ORIGIN;

export class AffectedCoordinationResponseDto {
  id!: string;
  /** Siempre `AI_SUGGESTION`: propuesta del análisis, no un hecho confirmado. */
  origin!: AffectedCoordinationOrigin;
  isSuggestion!: true;
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  impactLevel!: ImpactLevel;
  description!: string;
}

export class SituationImpactAssessmentResponseDto {
  id!: string;
  situationId!: string;
  operationalSeverity!: OperationalSeverity;
  confidence!: number;
  estimatedDurationMinutes!: number;
  summary!: string;
  reasoning!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class SituationAffectedCoordinationsResponseDto {
  situationId!: string;
  impactAssessmentId!: string | null;
  /** Toda la lista son sugerencias del análisis IA (ver AI_SUGGESTION_ORIGIN). */
  origin!: AffectedCoordinationOrigin;
  countsForIntegrity!: false;
  items!: AffectedCoordinationResponseDto[];
  total!: number;
}

export type ImpactCoordinationSource = 'declared' | 'simulated' | 'none';

export class ImpactCoordinationCandidateDto {
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  coordinationShortName!: string;
  impactLevel!: ImpactLevel | null;
  description!: string | null;
  source!: ImpactCoordinationSource;
}

export class SituationImpactContextResponseDto {
  situationId!: string;
  originCoordinationId!: string | null;
  originCoordinationCode!: string | null;
  hasDeclaredRelated!: boolean;
  canSimulate!: boolean;
  simulationAvailable!: boolean;
  declaredRelated!: ImpactCoordinationCandidateDto[];
  message!: string | null;
}

export class SituationImpactSimulationResponseDto {
  situationId!: string;
  generatedAt!: string;
  horizonMinutes!: number;
  source!: 'ai_assessment' | 'none';
  canSimulate!: boolean;
  hasDeclaredRelated!: boolean;
  potentialCoordinations!: ImpactCoordinationCandidateDto[];
  message!: string | null;
}
