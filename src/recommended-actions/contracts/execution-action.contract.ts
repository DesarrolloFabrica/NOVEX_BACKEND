import { ActionPriority } from '../../intelligence/contracts/executive-intelligence-report.contract';
import { RecommendedActionExecutionStatus } from '../../common/enums/operational.enums';

/** Vista de lectura para el Centro de Ejecución Operativa. */
export interface ExecutionActionImpactView {
  benefitExpected: string;
  indicatorToImprove: string;
  estimatedTime: string;
  dependency: string;
  nextSuggestedAction: string;
}

export interface ExecutionActionTimelineItemView {
  type: string;
  at: string;
  description: string;
  byUserName: string | null;
}

export interface ExecutionActionView {
  id: string;
  action: string;
  reason: string;
  whyRecommended: string;
  priority: ActionPriority;
  recommendedTime: string;
  executionStatus: RecommendedActionExecutionStatus;
  statusNote: string | null;
  observation: string | null;
  suggestedAreaId: string | null;
  suggestedAreaCode: string | null;
  suggestedAreaName: string;
  eventId: string;
  eventTitle: string;
  sourceAreaId: string;
  sourceAreaName: string;
  interpretationId: string;
  generatedByAi: true;
  suggestedAt: string;
  riskIfNotExecuted: string;
  executiveSummary: string;
  expectedImpact: ExecutionActionImpactView;
  timeline: ExecutionActionTimelineItemView[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionActionsListResponse {
  items: ExecutionActionView[];
  total: number;
  page: number;
  limit: number;
  progress: {
    executed: number;
    total: number;
  };
}
