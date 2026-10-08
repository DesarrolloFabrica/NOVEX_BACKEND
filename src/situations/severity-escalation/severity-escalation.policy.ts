import {
  SITUATION_SEVERITY_ORDER,
  SituationSeverity,
} from '../../common/enums/situation.enums';

/**
 * ESCALAMIENTO TEMPORAL DE SEVERIDAD — infraestructura sin política activa.
 *
 * Una política es una función PURA de (severidad reportada, `created_at`) que
 * devuelve el calendario COMPLETO de pasos del caso. Al no depender de
 * `due_at` ni de la severidad efectiva, no puede producir el bucle
 * severidad → plazo → severidad, y el calendario queda fijado al nacer.
 *
 * Estado de esta fase (deliberado):
 *   - `PRODUCTION_SEVERITY_ESCALATION_POLICIES` está VACÍO.
 *   - `ACTIVE_SEVERITY_ESCALATION_POLICY_CODE` es NULL: ningún caso nuevo
 *     recibe política, así que ninguno escala.
 * Los umbrales (k, tope, HIGH → CRITICAL) se decidirán con la calibración de
 * producción. Solo los tests registran una política QA explícita.
 */

export interface SeverityEscalationStep {
  /** Identidad estable del paso dentro de la política (`step-1`…). */
  ruleKey: string;
  toSeverity: SituationSeverity;
  /** Instante en que la regla dice que el nivel empieza a regir. */
  effectiveAt: Date;
}

export interface SeverityEscalationPolicy {
  /** Código versionado (≤ 40). Un código publicado nunca cambia de reglas. */
  code: string;
  schedule(input: {
    reportedSeverity: SituationSeverity;
    createdAt: Date;
  }): SeverityEscalationStep[];
}

/** Token de inyección del registro de políticas. */
export const SEVERITY_ESCALATION_POLICIES = Symbol(
  'SEVERITY_ESCALATION_POLICIES',
);

/** Registro productivo: vacío hasta aprobar una política calibrada. */
export const PRODUCTION_SEVERITY_ESCALATION_POLICIES: readonly SeverityEscalationPolicy[] =
  [];

/**
 * Política que se congela en cada caso NUEVO. NULL = ningún caso escala.
 * Cambiarlo es la decisión de producto pendiente, no un ajuste técnico.
 */
export const ACTIVE_SEVERITY_ESCALATION_POLICY_CODE: string | null = null;

export interface PlannedEscalation extends SeverityEscalationStep {
  fromSeverity: SituationSeverity;
}

export function severityRank(severity: SituationSeverity): number {
  return SITUATION_SEVERITY_ORDER.indexOf(severity);
}

/**
 * Pasos de la política que YA deberían regir y aún no están registrados.
 *
 *   - Horizonte: `min(now, closedAt)`. Nada rige después del cierre.
 *   - Los pasos se recorren en orden de `effectiveAt`; cada uno debe subir de
 *     nivel respecto del anterior. Una política que no cumple eso es un error
 *     de programación y se rechaza en vez de escribir un historial incoherente.
 *   - `existingRuleKeys` hace la operación idempotente: repetirla no duplica.
 */
export function planDueEscalations(input: {
  policy: SeverityEscalationPolicy;
  reportedSeverity: SituationSeverity;
  createdAt: Date;
  closedAt: Date | null;
  now: Date;
  existingRuleKeys: ReadonlySet<string>;
}): PlannedEscalation[] {
  const horizonMs = Math.min(
    input.now.getTime(),
    input.closedAt ? input.closedAt.getTime() : Number.POSITIVE_INFINITY,
  );

  const steps = [
    ...input.policy.schedule({
      reportedSeverity: input.reportedSeverity,
      createdAt: input.createdAt,
    }),
  ].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());

  const planned: PlannedEscalation[] = [];
  let level = input.reportedSeverity;
  let lastMs = input.createdAt.getTime();

  for (const step of steps) {
    const stepMs = step.effectiveAt.getTime();
    if (
      stepMs < lastMs ||
      severityRank(step.toSeverity) <= severityRank(level)
    ) {
      throw new Error(
        `Política de escalamiento inválida (${input.policy.code}/${step.ruleKey}): cada paso debe subir de nivel y no adelantarse al anterior.`,
      );
    }
    if (stepMs > horizonMs) {
      break;
    }
    if (!input.existingRuleKeys.has(step.ruleKey)) {
      planned.push({ ...step, fromSeverity: level });
    }
    level = step.toSeverity;
    lastMs = stepMs;
  }

  return planned;
}
