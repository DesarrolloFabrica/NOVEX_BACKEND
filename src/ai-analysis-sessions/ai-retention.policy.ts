/**
 * Política de retención del historial IA (Fase 01B.2) — DISEÑO, sin ejecución.
 *
 * Qué se conserva y por qué:
 *   - `situation_analysis_sessions` (versión, proveedor, modelo, plantilla,
 *     resultado, métricas): trazabilidad institucional del análisis. Se
 *     conserva mientras exista la situación.
 *   - `prompt_snapshot`: material de auditoría técnica, solo legible por ADMIN.
 *     Desde context-min-v1 no contiene correos, ids ni nombres de personas,
 *     pero los snapshots ANTERIORES a esta fase sí pueden contenerlos.
 *
 * Configuración (variables de entorno; vacías = retención indefinida):
 *   AI_PROMPT_SNAPSHOT_RETENTION_DAYS  Días tras los cuales un snapshot sería
 *                                      elegible para vaciarse (nunca la sesión).
 *   AI_SESSION_RETENTION_DAYS          Días tras los cuales una sesión de un
 *                                      caso CERRADO o ANULADO sería elegible.
 *   Mínimo aceptado: 30 días. Valores inválidos = retención indefinida.
 *
 * Esta política SOLO calcula elegibilidad. Ningún proceso del backend borra ni
 * vacía datos: aplicar la retención sobre el historial existente exige una
 * migración específica, revisada y autorizada (no eliminar datos históricos ni
 * prompts existentes sin autorización). Ver docs/seguridad-y-permisos.md.
 */
export const MIN_RETENTION_DAYS = 30;

export interface AiRetentionPolicy {
  /** null = indefinida. */
  promptSnapshotDays: number | null;
  /** null = indefinida. */
  sessionDays: number | null;
  /** Siempre false en esta fase: no existe ejecución automática. */
  enforcementEnabled: false;
}

function parseDays(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const days = Number(raw.trim());
  return Number.isSafeInteger(days) && days >= MIN_RETENTION_DAYS ? days : null;
}

export function resolveAiRetentionPolicy(
  env: Record<string, string | undefined> = process.env,
): AiRetentionPolicy {
  return {
    promptSnapshotDays: parseDays(env.AI_PROMPT_SNAPSHOT_RETENTION_DAYS),
    sessionDays: parseDays(env.AI_SESSION_RETENTION_DAYS),
    enforcementEnabled: false,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** ¿El snapshot superó la retención configurada? Indefinida = nunca. */
export function isPromptSnapshotBeyondRetention(
  createdAt: Date,
  policy: AiRetentionPolicy,
  now: Date = new Date(),
): boolean {
  if (policy.promptSnapshotDays === null) return false;
  return (
    now.getTime() - createdAt.getTime() > policy.promptSnapshotDays * DAY_MS
  );
}

/**
 * ¿La sesión superó la retención? Solo para casos que ya no admiten análisis
 * (CLOSED o CANCELLED), contado desde su cierre o anulación.
 */
export function isSessionBeyondRetention(
  frozenAt: Date | null,
  policy: AiRetentionPolicy,
  now: Date = new Date(),
): boolean {
  if (policy.sessionDays === null || frozenAt === null) return false;
  return now.getTime() - frozenAt.getTime() > policy.sessionDays * DAY_MS;
}
