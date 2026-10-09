import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import {
  assertEstadoPeriodShape,
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
  resolveEstadoDataWindow,
} from './domain/kpi-estado-evolution-buckets';
import { KPI_HISTORY_TIMEZONE } from './domain/kpi-history-buckets';
import {
  buildLearningsSummary,
  KPI_LEARNINGS_PAGE_DEFAULT,
  learningExcerpt,
} from './domain/kpi-learnings';
import {
  KPI_UNCATEGORIZED_CATEGORY_CODE,
  KPI_UNCATEGORIZED_CATEGORY_ID,
  KPI_UNCATEGORIZED_CATEGORY_NAME,
} from './domain/kpi-uncategorized-category';
import type { OperationalKpiInternosPeriodDto } from './dto/operational-kpi-internal-problems.dto';
import {
  OperationalKpiLearningItemsQueryDto,
  OperationalKpiLearningsQueryDto,
} from './dto/operational-kpi-learnings-query.dto';
import {
  OperationalKpiLearningItemDto,
  OperationalKpiLearningItemsResponseDto,
  OperationalKpiLearningsResponseDto,
} from './dto/operational-kpi-learnings.dto';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import {
  KpiLearningItemRow,
  KpiLearningWindow,
  OperationalKpiLearningsRepository,
} from './operational-kpi-learnings.repository';

/**
 * APRENDIZAJES del Director (scope coordinación) sobre el AnalysisPeriod.
 *
 *   resumen → indicadores + distribución por categoría del periodo COMPLETO.
 *   fichas  → aprendizajes individuales, paginados (closedAt ↓).
 *
 * Solo LECTURA de lo que escribió `POST /situations/:id/resolution`. Nada de
 * aquí procede de la IA.
 */
@Injectable()
export class OperationalKpiLearningsService {
  constructor(
    private readonly scopeService: OperationalScopeService,
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly repository: OperationalKpiLearningsRepository,
  ) {}

  async getLearnings(
    query: OperationalKpiLearningsQueryDto,
    actor: AuthPayload,
    now: Date = new Date(),
  ): Promise<OperationalKpiLearningsResponseDto> {
    const { coordination, period, window } = await this.resolve(
      query,
      actor,
      now,
    );
    const summary = buildLearningsSummary(
      await this.repository.countByCategory(window),
    );
    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      timezone: KPI_HISTORY_TIMEZONE,
      period,
      closedCount: summary.closedCount,
      learningCount: summary.learningCount,
      withoutLearningCount: summary.closedCount - summary.learningCount,
      coverage: summary.coverage,
      categories: summary.categories,
    };
  }

  async getLearningItems(
    query: OperationalKpiLearningItemsQueryDto,
    actor: AuthPayload,
    now: Date = new Date(),
  ): Promise<OperationalKpiLearningItemsResponseDto> {
    const { coordination, period, window } = await this.resolve(
      query,
      actor,
      now,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? KPI_LEARNINGS_PAGE_DEFAULT;
    const categoryId = query.categoryId ?? null;
    const { rows, total } = await this.repository.findItems(window, {
      categoryId,
      limit,
      offset: (page - 1) * limit,
    });
    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      period,
      categoryId,
      total,
      page,
      limit,
      items: rows.map(toLearningItem),
    };
  }

  /** Permiso, scope, coordinación y periodo: iguales a INTERNOS y /state. */
  private async resolve(
    query: OperationalKpiLearningsQueryDto,
    actor: AuthPayload,
    now: Date,
  ): Promise<{
    coordination: Coordination;
    period: OperationalKpiInternosPeriodDto;
    window: KpiLearningWindow;
  }> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    if (query.scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        'scope=direction no está disponible en /operational-kpis/learnings.',
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
    const dataWindow = resolveEstadoDataWindow(
      query.from,
      query.to,
      calendarEnd,
      today,
    );
    const cutAt = bogotaDayEndExclusiveIso(dataWindow.dataTo);
    return {
      coordination,
      period: {
        kind: query.kind,
        from: query.from,
        to: dataWindow.dataTo,
        calendarEnd,
        dataTo: dataWindow.dataTo,
        isCurrent: dataWindow.isCurrent,
        isPartial: dataWindow.isPartial,
        cutAt,
      },
      window: {
        coordinationId: coordination.id,
        startIso: bogotaDayStartIso(query.from),
        endExclusiveIso: cutAt,
      },
    };
  }
}

function toLearningItem(
  row: KpiLearningItemRow,
): OperationalKpiLearningItemDto {
  const { excerpt, truncated } = learningExcerpt(row.learning);
  const uncategorized = row.categoryId === null;
  return {
    situationId: row.situationId,
    title: row.title,
    // Los históricos sin report_kind viajan como INTERNAL (igual que el listado).
    reportKind:
      row.reportKind === String(SituationReportKind.INTER_COORDINATION)
        ? SituationReportKind.INTER_COORDINATION
        : SituationReportKind.INTERNAL,
    category: {
      id: uncategorized ? KPI_UNCATEGORIZED_CATEGORY_ID : row.categoryId!,
      code: uncategorized
        ? KPI_UNCATEGORIZED_CATEGORY_CODE
        : (row.categoryCode ?? ''),
      name: uncategorized
        ? KPI_UNCATEGORIZED_CATEGORY_NAME
        : (row.categoryName ?? KPI_UNCATEGORIZED_CATEGORY_NAME),
      selectable: uncategorized ? false : row.categorySelectable !== false,
    },
    closedAt: toIso(row.closedAt),
    resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
    recordedAt: toIso(row.recordedAt),
    resolvedByName: row.resolvedByName ?? null,
    learningExcerpt: excerpt,
    learningTruncated: truncated,
    learningLength: row.learning.trim().length,
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function bogotaTodayYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
