import { SituationReportKind } from '../../common/enums/situation.enums';
import type { KpiLearningCategory } from '../domain/kpi-learnings';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';
import type { OperationalKpiInternosPeriodDto } from './operational-kpi-internal-problems.dto';

/** APRENDIZAJES · indicadores y distribución del periodo COMPLETO. */
export interface OperationalKpiLearningsResponseDto {
  scope: { type: OperationalKpiScopeType; coordinationId: string };
  timezone: string;
  period: OperationalKpiInternosPeriodDto;
  /** Problemas de la coordinación responsable cerrados en el periodo. */
  closedCount: number;
  /** De ellos, los que tienen aprendizaje registrado (texto no vacío). */
  learningCount: number;
  /** Cierres sin aprendizaje (históricos previos a la tabla, sobre todo). */
  withoutLearningCount: number;
  /** learningCount / closedCount × 100, entero; null sin cierres. */
  coverage: number | null;
  categories: KpiLearningCategory[];
}

/** Ficha: un problema cerrado con su aprendizaje (extracto). */
export interface OperationalKpiLearningItemDto {
  situationId: string;
  title: string;
  reportKind: SituationReportKind;
  category: { id: string; code: string; name: string; selectable: boolean };
  /** Cierre: define el periodo y el orden. */
  closedAt: string;
  /** `situations.resolved_at` (puede preceder a closedAt en filas legadas). */
  resolvedAt: string | null;
  /** Alta de la fila de aprendizaje (`situation_resolutions.created_at`). */
  recordedAt: string;
  resolvedByName: string | null;
  learningExcerpt: string;
  learningTruncated: boolean;
  learningLength: number;
}

export interface OperationalKpiLearningItemsResponseDto {
  scope: { type: OperationalKpiScopeType; coordinationId: string };
  period: OperationalKpiInternosPeriodDto;
  /** Categoría aplicada (null = todas). */
  categoryId: string | null;
  /** Total de fichas del filtro en el periodo (no solo esta página). */
  total: number;
  page: number;
  limit: number;
  /** closedAt ↓ · situationId ↓ (orden total: paginación sin duplicados). */
  items: OperationalKpiLearningItemDto[];
}
