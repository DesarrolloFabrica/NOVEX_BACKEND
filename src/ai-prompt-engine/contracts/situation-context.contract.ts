import type {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
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

export type {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
export type { EvidenceType } from '../../common/enums/situation-evidence.enums';
export type { TimelineEventType } from '../../common/enums/situation-timeline.enums';
export type {
  RecommendationPriority,
  RecommendationStatus,
} from '../../common/enums/situation-recommendation.enums';
export type {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';

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

/**
 * Origen institucional del reporte (Fase 01B.2, política context-min-v1).
 * Sin id, nombre ni correo de la persona: solo la coordinación desde la que
 * reportó, por código.
 */
export interface SituationContextReporter {
  coordinationCode: string | null;
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

/** Solo evidencias ACTIVAS; sin nombre de archivo ni autor. */
export interface SituationContextEvidence {
  type: EvidenceType;
  title: string;
  description: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
}

/** Sin autor ni metadatos técnicos (tokens de reclamo, ids de sesión). */
export interface SituationContextTimelineEntry {
  eventType: TimelineEventType;
  title: string;
  description: string;
  createdAt: string;
}

/** Sin persona asignada: solo si hay responsable. */
export interface SituationContextRecommendation {
  title: string;
  description: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  generatedBy: string;
  hasAssignee: boolean;
  dueAt: string | null;
  completedAt: string | null;
}

export interface SituationContextAffectedCoordination {
  coordinationCode: string;
  coordinationName: string;
  impactLevel: ImpactLevel;
  description: string;
}

/** Análisis IA previo: sugerencia, no hecho confirmado. */
export interface SituationContextImpactAssessment {
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
  reporter: SituationContextReporter;
  /** Nula en casos registrados por analistas, que no representan un área. */
  originCoordination: SituationContextCoordination | null;
  /** Catálogo cerrado de coordinaciones activas visibles en Red de Impacto. */
  availableCoordinations: SituationContextCoordination[];
  /**
   * Categoría persistida en el expediente (elección del usuario).
   * Nula en dependencias INTER_COORDINATION, donde la categoría no aplica.
   */
  category: SituationContextCategory | null;
  /** Categorías seleccionables para incidentClassification.categoryCode. */
  availableCategories: SituationContextCategory[];
  evidences: SituationContextEvidence[];
  timeline: SituationContextTimelineEntry[];
  /**
   * Relaciones CONFIRMADAS: declaradas por el usuario al reportar (o, en
   * registros legados, en la percepción inicial del relato). Las sugerencias
   * del análisis previo viven solo en previousAssessment.
   */
  relatedCoordinations: SituationContextCoordination[];
  existingRecommendations: SituationContextRecommendation[];
  previousAssessment: SituationContextImpactAssessment | null;
}
