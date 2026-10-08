import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import { KPI_HISTORY_TIMEZONE } from './domain/kpi-history-buckets';
import { activeAtCutCte, activeAtCutParams } from './domain/kpi-active-at-cut';

/** Tope del ranking ejecutivo de ANTIGÜEDAD (casos extremos, no una lista). */
export const KPI_AGING_TOP_LIMIT = 5;

/** Rangos de edad: 7 d = SLA MEDIUM, 14 d = SLA LOW; >14 d todo SLA vencido. */
export const KPI_AGING_BAND_KEYS = ['0-7', '8-14', '15-30', '31+'] as const;
export type KpiAgingBandKey = (typeof KPI_AGING_BAND_KEYS)[number];

export type KpiAgingSummaryRow = {
  activeCount: number;
  medianAgeDays: number | null;
  bands: Array<{ key: KpiAgingBandKey; count: number }>;
};

export type KpiAgingOldestRow = {
  id: string;
  title: string;
  createdAt: string;
  ageDays: number;
  severity: SituationSeverity;
  status: SituationStatus;
  reportKind: SituationReportKind;
  closedAt: string | null;
  dueAt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  affectedCoordinationName: string | null;
};

/* ─────────────────────────────────────────────────────────────────────
 * ANTIGÜEDAD (ESTADO · SNAPSHOT AT CUT · scope COORDINATION): problemas
 * ACTIVOS al corte T de la coordinación RESPONSABLE seleccionada, con la MISMA
 * población que Carga, Severidad y Atención (ver kpi-active-at-cut).
 * No filtra por status: el status es el ACTUAL y no reconstruye el pasado
 * (RESOLVED legado sin closed_at sigue activo, como en Carga).
 *
 * Edad = refDate − fecha local Bogotá de created_at, en días calendario
 * enteros (0 = registrado ese mismo día). Se mide desde el REGISTRO en NOVEX,
 * no desde occurred_at.
 *
 * Dos consultas set-based de coste constante: agregados (conteo, mediana,
 * rangos) y ranking (created_at ASC, id ASC, LIMIT 5).
 * ───────────────────────────────────────────────────────────────────── */
@Injectable()
export class OperationalKpiAgingRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  /** CTE de la población ACTIVE_AT_CUT compartida (ver kpi-active-at-cut). */
  private universe(): string {
    return activeAtCutCte(KPI_HISTORY_TIMEZONE);
  }

  private params(coordinationId: string, refDate: string): unknown[] {
    return activeAtCutParams(coordinationId, refDate);
  }

  async aggregateSummary(
    coordinationId: string,
    refDate: string,
  ): Promise<KpiAgingSummaryRow> {
    const sql = `
      ${this.universe()}
      SELECT
        COUNT(*)::int AS active_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY age_days) AS median_age_days,
        COUNT(*) FILTER (WHERE age_days <= 7)::int AS band_0_7,
        COUNT(*) FILTER (WHERE age_days BETWEEN 8 AND 14)::int AS band_8_14,
        COUNT(*) FILTER (WHERE age_days BETWEEN 15 AND 30)::int AS band_15_30,
        COUNT(*) FILTER (WHERE age_days >= 31)::int AS band_31
      FROM universe
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<{
        active_count: string | number;
        median_age_days: string | number | null;
        band_0_7: string | number;
        band_8_14: string | number;
        band_15_30: string | number;
        band_31: string | number;
      }>
    >(sql, this.params(coordinationId, refDate));
    const row = rows[0];
    const activeCount = Number(row?.active_count ?? 0);
    const median =
      row?.median_age_days === null || row?.median_age_days === undefined
        ? null
        : Number(row.median_age_days);
    return {
      activeCount,
      medianAgeDays:
        activeCount === 0 || median === null || !Number.isFinite(median)
          ? null
          : median,
      bands: [
        { key: '0-7', count: Number(row?.band_0_7 ?? 0) },
        { key: '8-14', count: Number(row?.band_8_14 ?? 0) },
        { key: '15-30', count: Number(row?.band_15_30 ?? 0) },
        { key: '31+', count: Number(row?.band_31 ?? 0) },
      ],
    };
  }

  async findOldest(
    coordinationId: string,
    refDate: string,
  ): Promise<KpiAgingOldestRow[]> {
    const sql = `
      ${this.universe()}
      SELECT
        u.id AS id,
        u.title AS title,
        u.created_at AS "createdAt",
        u.age_days::int AS "ageDays",
        u.severity AS severity,
        u.status AS status,
        u.report_kind AS "reportKind",
        u.closed_at AS "closedAt",
        u.due_at AS "dueAt",
        u.category_id AS "categoryId",
        c.name AS "categoryName",
        COALESCE(ac.short_name, ac.name) AS "affectedCoordinationName"
      FROM universe u
      LEFT JOIN incident_categories c ON c.id = u.category_id
      LEFT JOIN coordinations ac ON ac.id = u.affected_coordination_id
      ORDER BY u.created_at ASC, u.id ASC
      LIMIT ${KPI_AGING_TOP_LIMIT}
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<{
        id: string;
        title: string;
        createdAt: Date | string;
        ageDays: string | number;
        severity: SituationSeverity;
        status: SituationStatus;
        reportKind: SituationReportKind;
        closedAt: Date | string | null;
        dueAt: Date | string | null;
        categoryId: string | null;
        categoryName: string | null;
        affectedCoordinationName: string | null;
      }>
    >(sql, this.params(coordinationId, refDate));
    const iso = (value: Date | string) => new Date(value).toISOString();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: iso(row.createdAt),
      ageDays: Number(row.ageDays),
      severity: row.severity,
      status: row.status,
      reportKind: row.reportKind,
      closedAt: row.closedAt === null ? null : iso(row.closedAt),
      dueAt: row.dueAt === null ? null : iso(row.dueAt),
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      affectedCoordinationName: row.affectedCoordinationName,
    }));
  }
}
