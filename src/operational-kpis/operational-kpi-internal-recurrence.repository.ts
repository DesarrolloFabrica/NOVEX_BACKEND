import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import type { EstadoFlowSlot } from './domain/kpi-estado-evolution-buckets';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
} from './domain/kpi-history-buckets';
import type { KpiRecurrenceCountRow } from './domain/kpi-internal-recurrence';

/* ─────────────────────────────────────────────────────────────────────
 * INTERNOS · RECURRENCIA. UNA consulta: buckets no futuros (VALUES) ×
 * INTERNAL creados de la coordinación responsable, agrupados por categoría.
 * Mismo patrón que aggregateEventMetric (Movimiento). Sin INTER.
 * ───────────────────────────────────────────────────────────────────── */
@Injectable()
export class OperationalKpiInternalRecurrenceRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async countByBucketAndCategory(
    coordinationId: string,
    slots: readonly EstadoFlowSlot[],
  ): Promise<KpiRecurrenceCountRow[]> {
    const observed = slots.filter(
      (slot): slot is EstadoFlowSlot & { dataEnd: string } =>
        slot.dataEnd !== null,
    );
    if (observed.length === 0) return [];

    const tuples: string[] = [];
    const params: unknown[] = [];
    observed.forEach((slot, i) => {
      const n = i * 3;
      tuples.push(
        `($${n + 1}::timestamptz, $${n + 2}::timestamptz, $${n + 3}::text)`,
      );
      params.push(
        bogotaDayStartIso(slot.bucket.start),
        bogotaDayEndExclusiveIso(slot.dataEnd),
        slot.dataEnd,
      );
    });
    const owner = params.length + 1;
    const internal = params.length + 2;

    const sql = `
      SELECT
        b.key AS key,
        s.category_id AS "categoryId",
        c.code AS code,
        c.name AS name,
        c.is_selectable AS selectable,
        COUNT(*)::int AS count
      FROM (VALUES ${tuples.join(', ')}) AS b(start_at, end_exclusive, key)
      JOIN situations s
        ON s.coordination_id = $${owner}
       AND s.report_kind = $${internal}
       AND s.created_at >= b.start_at
       AND s.created_at < b.end_exclusive
      LEFT JOIN incident_categories c ON c.id = s.category_id
      GROUP BY b.key, s.category_id, c.code, c.name, c.is_selectable
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<{
        key: string;
        categoryId: string | null;
        code: string | null;
        name: string | null;
        selectable: boolean | null;
        count: string | number;
      }>
    >(sql, [...params, coordinationId, SituationReportKind.INTERNAL]);
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }
}
