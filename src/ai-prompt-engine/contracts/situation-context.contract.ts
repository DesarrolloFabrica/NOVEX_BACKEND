import type { SituationSeverity, SituationStatus } from '../../common/enums/situation.enums';
import type { EvidenceType } from '../../common/enums/situation-evidence.enums';
import type {
  RecommendationPriority,
  RecommendationStatus,
} from '../../common/enums/situation-recommendation.enums';
import type {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';
import type { TimelineEventType } from '../../common/enums/situation-timeline.enums';

export type { SituationSeverity, SituationStatus } from '../../common/enums/situation.enums';
export type { EvidenceType } from '../../common/enums/situation-evidence.enums';
export type { TimelineEventType } from '../../common/enums/situation-timeline.enums';
export type { RecommendationPriority, RecommendationStatus } from '../../common/enums/situation-recommendation.enums';
export type { ImpactLevel, OperationalSeverity } from '../../common/enums/situation-impact.enums';

export interface SituationContextSituation {
  id: string;
  title: string;
  description: string;
  severity: SituationSeverity;
  status: SituationStatus;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SituationContextUser {
  id: string;
  fullName: string;
  email: string;
  coordinationId: string | null;
}

export interface SituationContextCoordination {
  id: string;
  code: string;
  name: string;
  shortName: string;
}

export interface SituationContextCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface SituationContextEvidence {
  id: string;
  type: EvidenceType;
  title: string;
  description: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedByUserName: string;
  createdAt: string;
}

export interface SituationContextTimelineEntry {
  id: string;
  eventType: TimelineEventType;
  title: string;
  description: string;
  userName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SituationContextRecommendation {
  id: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  generatedBy: string;
  assignedUserName: string | null;
  dueAt: string | null;
  completedAt: string | null;
}

export interface SituationContextAffectedCoordination {
  coordinationCode: string;
  coordinationName: string;
  impactLevel: ImpactLevel;
  description: string;
}

export interface SituationContextImpactAssessment {
  id: string;
  operationalSeverity: OperationalSeverity;
  confidence: number;
  estimatedDurationMinutes: number;
  summary: string;
  reasoning: string;
  affectedCoordinations: SituationContextAffectedCoordination[];
  updatedAt: string;
}

export interface SituationContext {
  situationId: string;
  builtAt: string;
  situation: SituationContextSituation;
  createdBy: SituationContextUser;
  originCoordination: SituationContextCoordination;
  category: SituationContextCategory;
  evidences: SituationContextEvidence[];
  timeline: SituationContextTimelineEntry[];
  relatedCoordinations: SituationContextCoordination[];
  existingRecommendations: SituationContextRecommendation[];
  previousAssessment: SituationContextImpactAssessment | null;
}
