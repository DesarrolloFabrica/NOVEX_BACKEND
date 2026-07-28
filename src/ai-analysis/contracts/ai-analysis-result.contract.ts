import type { RecommendationPriority } from '../../common/enums/situation-recommendation.enums';
import type {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';
import type {
  AIAnalysisSchemaVersion,
  ExecutivePriorityLevel,
  HypothesisLikelihood,
  MissingInformationPriority,
} from '../enums/ai-analysis.enums';

export interface ExecutiveSummary {
  headline: string;
  summary: string;
  keyPoints: string[];
}

export interface IncidentClassification {
  categoryCode: string;
  categoryName: string;
  operationalSeverity: OperationalSeverity;
  tags: string[];
}

export interface Hypothesis {
  statement: string;
  likelihood: HypothesisLikelihood;
  supportingEvidence: string[];
}

export interface RootCauseAnalysis {
  summary: string;
  hypotheses: Hypothesis[];
}

export interface AffectedCoordinationResult {
  coordinationCode: string;
  impactLevel: ImpactLevel;
  description: string;
}

export interface PropagationNode {
  coordinationCode: string;
  depth: number;
  impactLevel: ImpactLevel;
  description: string;
}

export interface ImpactAssessmentResult {
  operationalSeverity: OperationalSeverity;
  confidence: number;
  estimatedDurationMinutes: number;
  summary: string;
  reasoning: string;
  affectedCoordinations: AffectedCoordinationResult[];
  propagation: PropagationNode[];
}

export interface RecommendationResult {
  title: string;
  description: string;
  priority: RecommendationPriority;
}

export interface ImmediateRisk {
  title: string;
  description: string;
  severity: OperationalSeverity;
}

export interface FutureRisk {
  title: string;
  description: string;
  likelihood: HypothesisLikelihood;
  timeframe: string;
}

export interface MissingInformationItem {
  topic: string;
  question: string;
  priority: MissingInformationPriority;
}

export interface ExecutiveConclusion {
  conclusion: string;
  recommendedNextStep: string;
}

export interface ConfidenceFactor {
  name: string;
  score: number;
}

export interface ConfidenceAssessment {
  overall: number;
  factors: ConfidenceFactor[];
}

export interface ExecutiveDecision {
  decision: string;
  urgencyLevel: OperationalSeverity;
  recommendedActionTime: string;
  initialResponsible: string;
}

export interface ExecutivePriority {
  level: ExecutivePriorityLevel;
  justification: string;
}

export interface CriticalWindow {
  timeBeforeEscalation: string;
  explanation: string;
}

export interface RiskBreakdownComponent {
  name: string;
  score: number;
  explanation: string;
}

export interface RiskBreakdown {
  totalScore: number;
  components: RiskBreakdownComponent[];
}

export interface ProbableCause {
  hypothesis: string;
  probability: number;
  justification: string;
}

export interface PropagationChainStep {
  stage: string;
  description: string;
}

export interface OperationalPropagation {
  chain: PropagationChainStep[];
}

export interface DecisionMatrixItem {
  action: string;
  reason: string;
}

export interface DecisionMatrix {
  resolveNow: DecisionMatrixItem[];
  resolveToday: DecisionMatrixItem[];
  monitor: DecisionMatrixItem[];
  escalate: DecisionMatrixItem[];
}

export interface ConfidenceExplanation {
  supportingFactors: string[];
  reducingFactors: string[];
}

export interface AIAnalysisResult {
  schemaVersion: AIAnalysisSchemaVersion;
  analyzedAt: string;
  provider: string;
  executiveSummary: ExecutiveSummary;
  incidentClassification: IncidentClassification;
  rootCause: RootCauseAnalysis;
  impactAssessment: ImpactAssessmentResult;
  recommendations: RecommendationResult[];
  immediateRisks: ImmediateRisk[];
  futureRisks: FutureRisk[];
  missingInformation: MissingInformationItem[];
  executiveConclusion: ExecutiveConclusion;
  confidence: ConfidenceAssessment;
  executiveDecision?: ExecutiveDecision;
  executivePriority?: ExecutivePriority;
  criticalWindow?: CriticalWindow;
  riskBreakdown?: RiskBreakdown;
  probableCauses?: ProbableCause[];
  operationalPropagation?: OperationalPropagation;
  decisionMatrix?: DecisionMatrix;
  executiveNarrative?: string;
  confidenceExplanation?: ConfidenceExplanation;
}
