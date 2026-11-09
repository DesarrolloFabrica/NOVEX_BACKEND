import { SituationStatus } from '../../common/enums/situation.enums';

/**
 * Fase 01B.1 · SITUACIONES ANULADAS FUERA DE LOS KPIs.
 *
 * Una situación anulada fue un reporte erróneo o duplicado: no debe contar en
 * carga, antigüedad, composición, movimiento, recurrencia, relaciones,
 * resolución ni aprendizajes, en NINGÚN periodo (tampoco hacia atrás: nunca
 * debió existir como problema operativo). Se cuentan aparte como «anuladas».
 *
 * Los KPIs filtran por fechas (`created_at` / `closed_at`), no por estado, así
 * que sin este predicado una anulada (sin `closed_at`) contaría como activa
 * para siempre. Valor literal del enum: no proviene de entrada del usuario.
 */
export function kpiNotCancelledSql(alias = 's'): string {
  return `${alias}.status <> '${SituationStatus.CANCELLED}'`;
}
