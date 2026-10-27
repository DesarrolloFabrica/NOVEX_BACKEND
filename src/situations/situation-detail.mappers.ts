import {
  SituationConsequenceResponseDto,
  SituationSeverityHistoryItemDto,
} from './dto/situation.dto';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import {
  severityAt,
  sortSeverityHistory,
} from './severity-escalation/severity-history';

export function toSeverityHistoryItems(
  rows: readonly SituationSeverityChange[],
): SituationSeverityHistoryItemDto[] {
  return sortSeverityHistory(rows).map((row) => ({
    id: row.id,
    from: row.previousSeverity,
    to: row.newSeverity,
    source: row.source,
    effectiveAt: row.effectiveAt,
    recordedAt: row.createdAt,
    policyCode: row.policyCode,
    ruleKey: row.ruleKey,
  }));
}

/** Orden de lectura: `occurredAt`, desempate `createdAt` e `id`. */
export function sortConsequences(
  rows: readonly SituationConsequence[],
): SituationConsequence[] {
  return [...rows].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * `severityAtOccurrence` se DERIVA del historial (último `effectiveAt <=
 * occurredAt`); nunca se persiste en la afectación.
 */
export function toConsequenceResponse(
  consequence: SituationConsequence,
  history: readonly SituationSeverityChange[],
): SituationConsequenceResponseDto {
  return {
    id: consequence.id,
    situationId: consequence.situationId,
    description: consequence.description,
    occurredAt: consequence.occurredAt,
    createdAt: consequence.createdAt,
    createdByUserId: consequence.createdByUserId,
    createdByUserName: consequence.createdByUser?.fullName ?? '',
    createdByRoleName: consequence.createdByUser?.role?.name ?? null,
    severityAtOccurrence: severityAt(history, consequence.occurredAt),
  };
}
