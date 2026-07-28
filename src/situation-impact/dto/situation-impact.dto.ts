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
