import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Situation } from '../situations/entities/situation.entity';
import type { KpiLearningCategoryCountRow } from './domain/kpi-learnings';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';

/**
 * Universo común: coordinación RESPONSABLE = $1 y closed_at ∈ [$2, $3).
 * Igual que «Solucionados» de Movimiento y que RESOLUCIÓN: no se filtra por
 * status, manda closed_at. La afectada nunca entra.
 */
const UNIVERSE = `
  s.coordination_id = $1
  AND s.closed_at IS NOT NULL
  AND s.closed_at >= $2::timestamptz
  AND s.closed_at < $3::timestamptz
`;

/** Aprendizaje válido: fila presente y texto no vacío (la base ya lo exige). */
const HAS_LEARNING = `r.situation_id IS NOT NULL AND btrim(r.learning) <> ''`;

export interface KpiLearningItemRow {
  situationId: string;
  title: string;
  reportKind: string;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  categorySelectable: boolean | null;
  closedAt: Date;
  resolvedAt: Date | null;
  recordedAt: Date;
  resolvedByName: string | null;
  learning: string;
}

export interface KpiLearningWindow {
  coordinationId: string;
  startIso: string;
  endExclusiveIso: string;
}

/**
 * APRENDIZAJES: dos lecturas set-based. El resumen agrega TODO el periodo en
 * una consulta (no depende de la paginación de las fichas); las fichas se
 * paginan en SQL con orden total.
 */
@Injectable()
export class OperationalKpiLearningsRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async countByCategory(
    window: KpiLearningWindow,
  ): Promise<KpiLearningCategoryCountRow[]> {
    const sql = `
      SELECT
        s.category_id AS "categoryId",
        c.code AS code,
        c.name AS name,
        c.is_selectable AS selectable,
        COUNT(*)::int AS closed,
        COUNT(*) FILTER (WHERE ${HAS_LEARNING})::int AS learnings
      FROM situations s
      LEFT JOIN situation_resolutions r ON r.situation_id = s.id
      LEFT JOIN incident_categories c ON c.id = s.category_id
      WHERE ${UNIVERSE}
      GROUP BY s.category_id, c.code, c.name, c.is_selectable
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<
        Omit<KpiLearningCategoryCountRow, 'closed' | 'learnings'> & {
          closed: string | number;
          learnings: string | number;
        }
      >
    >(sql, [window.coordinationId, window.startIso, window.endExclusiveIso]);
    return rows.map((row) => ({
      ...row,
      closed: Number(row.closed),
      learnings: Number(row.learnings),
    }));
  }

  async findItems(
    window: KpiLearningWindow,
    options: { categoryId: string | null; limit: number; offset: number },
  ): Promise<{ rows: KpiLearningItemRow[]; total: number }> {
    const params: unknown[] = [
      window.coordinationId,
      window.startIso,
      window.endExclusiveIso,
    ];
    let categoryFilter = '';
    if (options.categoryId === KPI_UNCATEGORIZED_CATEGORY_ID) {
      categoryFilter = 'AND s.category_id IS NULL';
    } else if (options.categoryId) {
      params.push(options.categoryId);
      categoryFilter = `AND s.category_id = $${params.length}`;
    }

    const from = `
      FROM situations s
      JOIN situation_resolutions r ON r.situation_id = s.id
      WHERE ${UNIVERSE}
        AND ${HAS_LEARNING}
        ${categoryFilter}
    `;

    const [countRow] = await this.situationsRepository.manager.query<
      Array<{ total: string | number }>
    >(`SELECT COUNT(*)::int AS total ${from}`, params);

    const pageParams = [...params, options.limit, options.offset];
    const limitAt = params.length + 1;
    const offsetAt = params.length + 2;
    const rows = await this.situationsRepository.manager.query<
      KpiLearningItemRow[]
    >(
      `
      SELECT
        s.id AS "situationId",
        s.title AS title,
        s.report_kind AS "reportKind",
        s.category_id AS "categoryId",
        c.code AS "categoryCode",
        c.name AS "categoryName",
        c.is_selectable AS "categorySelectable",
        s.closed_at AS "closedAt",
        s.resolved_at AS "resolvedAt",
        r.created_at AS "recordedAt",
        u.full_name AS "resolvedByName",
        r.learning AS learning
      FROM situations s
      JOIN situation_resolutions r ON r.situation_id = s.id
      LEFT JOIN incident_categories c ON c.id = s.category_id
      LEFT JOIN users u ON u.id = r.resolved_by_user_id
      WHERE ${UNIVERSE}
        AND ${HAS_LEARNING}
        ${categoryFilter}
      ORDER BY s.closed_at DESC, s.id DESC
      LIMIT $${limitAt} OFFSET $${offsetAt}
      `,
      pageParams,
    );

    return { rows, total: Number(countRow?.total ?? 0) };
  }
}
