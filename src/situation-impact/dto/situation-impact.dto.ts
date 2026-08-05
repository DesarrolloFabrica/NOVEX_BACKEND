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

export class AffectedCoordinationResponseDto {
  id!: string;
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
  originCoordinationId!: string;
  originCoordinationCode!: string;
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
