import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import {
  assertEstadoPeriodShape,
  bogotaDayEndExclusiveIso,
  buildEstadoFlowSlots,
  ESTADO_EVOLUTION_BUCKET,
  resolveEstadoDataWindow,
} from './domain/kpi-estado-evolution-buckets';
import { KPI_HISTORY_TIMEZONE } from './domain/kpi-history-buckets';
import {
  compareInternalProblems,
  slaAtCut,
} from './domain/kpi-internal-problems';
import { buildRecurrenceMatrix } from './domain/kpi-internal-recurrence';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import { OperationalKpiInternosQueryDto } from './dto/operational-kpi-internal-problems-query.dto';
import {
  OperationalKpiInternalProblemsResponseDto,
  OperationalKpiInternalRecurrenceResponseDto,
  OperationalKpiInternosPeriodDto,
} from './dto/operational-kpi-internal-problems.dto';
import { OperationalKpiInternalProblemsRepository } from './operational-kpi-internal-problems.repository';
import { OperationalKpiInternalRecurrenceRepository } from './operational-kpi-internal-recurrence.repository';

/**
 * INTERNOS del Director (scope coordinación), dos lecturas del MISMO
 * AnalysisPeriod:
 *
 *   recurrencia  → FLUJO: INTERNAL creados por categoría y bucket.
 *   afectaciones → FOTO AL CORTE: INTERNAL activos en T con sus agregados.
 */
@Injectable()
export class OperationalKpiInternalProblemsService {
  constructor(
    private readonly scopeService: OperationalScopeService,
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly repository: OperationalKpiInternalProblemsRepository,
    private readonly recurrenceRepository: OperationalKpiInternalRecurrenceRepository,
  ) {}

  async getInternalProblems(
    query: OperationalKpiInternosQueryDto,
    actor: AuthPayload,
    now: Date = new Date(),
  ): Promise<OperationalKpiInternalProblemsResponseDto> {
    const { coordination, period } = await this.resolve(
      query,
      actor,
      now,
      'internal-problems',
    );
    const { rows, truncated } = await this.repository.findRows({
      coordinationId: coordination.id,
      cutIso: period.cutAt,
      refDate: period.dataTo,
      isCurrent: period.isCurrent,
    });

    // El plazo se mide a min(ahora, T): en el periodo en curso T es el fin
    // de hoy y aún no ha llegado.
    const asOf = new Date(
      Math.min(now.getTime(), new Date(period.cutAt).getTime()),
    );
    const items = rows
      .map((row) => ({
        id: row.id,
        title: row.title,
        category:
          row.categoryId && row.categoryName
            ? {
                id: row.categoryId,
                code: row.categoryCode ?? '',
                name: row.categoryName,
              }
            : null,
        createdAt: row.createdAt,
        createdByName: row.createdByName,
        ageDays: row.ageDays,
        statusAtCut: row.statusAtCut,
        reportedSeverity: row.reportedSeverity,
        severityAtCut: row.severityAtCut,
        consequenceCountAtCut: row.consequenceCountAtCut,
        latestConsequence: row.latestConsequence,
        dueAt: row.dueAt,
        slaAtCut: slaAtCut({
          dueAt: row.dueAt,
          reportedSeverity: row.reportedSeverity,
          asOf,
        }),
        historyReliable: row.historyReliable,
        consequenceTimeline: row.consequenceTimeline,
      }))
      .sort(compareInternalProblems);

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      timezone: KPI_HISTORY_TIMEZONE,
      period,
      total: items.length,
      truncated,
      items,
    };
  }

  async getInternalRecurrence(
    query: OperationalKpiInternosQueryDto,
    actor: AuthPayload,
    now: Date = new Date(),
  ): Promise<OperationalKpiInternalRecurrenceResponseDto> {
    const { coordination, period, today } = await this.resolve(
      query,
      actor,
      now,
      'internal-recurrence',
    );
    // Misma geometría que el Flujo de ESTADO (Carga / Movimiento).
    const slots = buildEstadoFlowSlots(
      query.kind,
      query.from,
      period.calendarEnd,
      period.dataTo,
      today,
    );
    const rows = await this.recurrenceRepository.countByBucketAndCategory(
      coordination.id,
      slots,
    );
    const matrix = buildRecurrenceMatrix(slots, rows);

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      timezone: KPI_HISTORY_TIMEZONE,
      period,
      bucket: ESTADO_EVOLUTION_BUCKET[query.kind],
      buckets: slots.map((slot, i) => ({
        start: slot.bucket.start,
        end: slot.dataEnd ?? slot.bucket.end,
        calendarStart: slot.bucket.calendarStart ?? slot.bucket.start,
        calendarEnd: slot.bucket.calendarEnd ?? slot.bucket.end,
        dataEnd: slot.dataEnd,
        label: slot.bucket.label,
        current: slot.current,
        future: slot.future,
        total: matrix.bucketTotals.at(i) ?? null,
      })),
      eligibleBuckets: matrix.eligibleBuckets,
      total: matrix.total,
      categories: matrix.categories,
    };
  }

  /** Permiso, scope, coordinación y periodo: iguales a /state. */
  private async resolve(
    query: OperationalKpiInternosQueryDto,
    actor: AuthPayload,
    now: Date,
    route: string,
  ): Promise<{
    coordination: Coordination;
    period: OperationalKpiInternosPeriodDto;
    today: string;
  }> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    if (query.scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        `scope=direction aún no está disponible en /operational-kpis/${route}.`,
      );
    }
    if (!query.coordinationId) {
      throw new BadRequestException('scope=coordination exige coordinationId.');
    }
    const coordination = await this.coordinationsRepository.findActiveById(
      query.coordinationId,
    );
    if (!coordination) {
      throw new NotFoundException(
        `Coordinación no encontrada: ${query.coordinationId}`,
      );
    }

    const today = bogotaTodayYmd(now);
    const calendarEnd = query.calendarEnd ?? query.to;
    assertEstadoPeriodShape(
      query.kind,
      query.from,
      query.to,
      calendarEnd,
      today,
    );
    const window = resolveEstadoDataWindow(
      query.from,
      query.to,
      calendarEnd,
      today,
    );
    return {
      coordination,
      today,
      period: {
        kind: query.kind,
        from: query.from,
        to: window.dataTo,
        calendarEnd,
        dataTo: window.dataTo,
        isCurrent: window.isCurrent,
        isPartial: window.isPartial,
        cutAt: bogotaDayEndExclusiveIso(window.dataTo),
      },
    };
  }
}

function bogotaTodayYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
