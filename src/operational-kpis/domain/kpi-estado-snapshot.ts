import type { OperationalKpiStateSnapshotDto } from '../dto/operational-kpi-state.dto';
import type { KpiSnapshotCompositionRow } from '../operational-kpi-snapshot.repository';

/**
 * Sección `snapshot` de ESTADO (SNAPSHOT AT CUT).
 *
 * Severidad: valor ACTUAL de cada problema (no hay historial fiable).
 * Atención: status ACTUAL. Auditoría (fase de coherencia temporal): el status
 * al corte NO se reconstruye desde la timeline porque no todas las rutas la
 * escriben (seeds y datos legados cambian status sin STATUS_CHANGED, y el
 * subscriber omite los cambios de status) → opción B: misma población del
 * corte, clasificada por su status de hoy, con `closedAfterCut` explícito.
 * En el corte de HOY ambas lecturas son exactas.
 */
export function buildEstadoSnapshot(input: {
  at: string;
  isNow: boolean;
  composition: KpiSnapshotCompositionRow;
}): OperationalKpiStateSnapshotDto {
  const { at, isNow, composition } = input;
  return {
    semantics: 'active-at-cut',
    at,
    isNow,
    activeCount: composition.activeCount,
    severity: { ...composition.severity },
    attention: { ...composition.attention },
    reliability: {
      severity: isNow ? 'exact' : 'current-value',
      attention: isNow ? 'exact' : 'current-value',
    },
  };
}
