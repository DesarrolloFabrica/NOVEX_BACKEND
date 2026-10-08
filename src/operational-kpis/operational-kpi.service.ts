import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import {
  SituationReportKind,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import {
  ANALYST_REGISTRY_KEY,
  buildCoordinationLifeSnapshots,
  emptyCoordinationLifeSnapshot,
  snapshotKeyOf,
} from '../operational-overview/domain/build-coordination-snapshots';
import {
  COORDINATION_INTEGRITY_POLICY_CODE,
  OperationalIntegrityStatus,
  evaluateCoordinationIntegrity,
} from '../operational-overview/domain/coordination-integrity';
import {
  COORDINATION_LIFE_POINTS_POLICY_CODE,
  CoordinationLifeSnapshot,
  evaluateCoordinationLifePoints,
} from '../operational-overview/domain/coordination-life-points';
import {
  evaluateAnalystRegistryIntegrity,
  evaluateOperationalDirectionIntegrity,
} from '../operational-overview/domain/operational-direction-integrity';
import {
  ActiveStatusRow,
  OperationalAggregationScope,
  OperationalOverviewRepository,
  OutgoingDependencyRow,
} from '../operational-overview/repositories/operational-overview.repository';
import { OperationalKpiCompareQueryDto } from './dto/operational-kpi-compare-query.dto';
import {
  OperationalKpiQueryDto,
  OperationalKpiScopeType,
} from './dto/operational-kpi-query.dto';
import {
  OperationalKpiAnalystRegistryDto,
  OperationalKpiCompareResponseDto,
  OperationalKpiCoordinationSnapshotDto,
  OperationalKpiDirectionSnapshotDto,
  OperationalKpiProblemCountsDto,
  OperationalKpiResponseDto,
} from './dto/operational-kpi.dto';
import { OPERATIONAL_KPI_QUERY_BUDGET } from './operational-kpi.constants';
import { OperationalKpiAgingRepository } from './operational-kpi-aging.repository';
import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';
import { OperationalKpiResolutionRepository } from './operational-kpi-resolution.repository';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiPeriodRepository } from './operational-kpi-period.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import {
  OperationalKpiHistoryRepository,
  type KpiHistorySeriesFilter,
} from './operational-kpi-history.repository';
import {
  OperationalKpiDependencySide,
  OperationalKpiHistoryMetric,
  OperationalKpiHistoryQueryDto,
} from './dto/operational-kpi-history-query.dto';
import { OperationalKpiPeriodQueryDto } from './dto/operational-kpi-period-query.dto';
import { OperationalKpiPeriodResponseDto } from './dto/operational-kpi-period.dto';
import { OperationalKpiRelationsQueryDto } from './dto/operational-kpi-relations-query.dto';
import { OperationalKpiRelationsResponseDto } from './dto/operational-kpi-relations.dto';
import {
  OperationalKpiHistoryPeriodDto,
  OperationalKpiHistoryResponseDto,
} from './dto/operational-kpi-history.dto';
import {
  OperationalKpiBreakdownDimension,
  OperationalKpiBreakdownQueryDto,
} from './dto/operational-kpi-breakdown-query.dto';
import { OperationalKpiBreakdownResponseDto } from './dto/operational-kpi-breakdown.dto';
import { OperationalKpiStateQueryDto } from './dto/operational-kpi-state-query.dto';
import { OperationalKpiStateResponseDto } from './dto/operational-kpi-state.dto';
import { buildCurrentAnalysisPeriod } from './domain/kpi-analysis-period';
import {
  assertEstadoPeriodShape,
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
  buildEstadoEvolutionBuckets,
  buildEstadoFlowSlots,
  ESTADO_EVOLUTION_BUCKET,
  resolveEstadoDataWindow,
  type EstadoPeriodKind,
} from './domain/kpi-estado-evolution-buckets';
import {
  buildKpiHistoryBuckets,
  KPI_HISTORY_TIMEZONE,
  parseYmd,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import { isUncategorizedCategoryId } from './domain/kpi-uncategorized-category';
import { buildEstadoAging } from './domain/kpi-estado-aging';
import { buildEstadoSnapshot } from './domain/kpi-estado-snapshot';
import { buildEstadoResolution } from './domain/kpi-estado-resolution';

export { OPERATIONAL_KPI_QUERY_BUDGET };

interface ResolvedKpiScope {
  type: OperationalKpiScopeType;
  coordinationId?: string;
}

interface StatusCounts {
  open: number;
  inProgress: number;
}

@Injectable()
export class OperationalKpiService {
  constructor(
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly overviewRepository: OperationalOverviewRepository,
    private readonly scopeService: OperationalScopeService,
    private readonly historyRepository: OperationalKpiHistoryRepository,
    private readonly breakdownRepository: OperationalKpiBreakdownRepository,
    private readonly periodRepository: OperationalKpiPeriodRepository,
    private readonly relationsRepository: OperationalKpiRelationsRepository,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    private readonly agingRepository: OperationalKpiAgingRepository,
    private readonly snapshotRepository: OperationalKpiSnapshotRepository,
    private readonly resolutionRepository: OperationalKpiResolutionRepository,
  ) {}

  async getSnapshot(
    query: OperationalKpiQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    const scope = this.resolveScope(query);
    const generatedAt = new Date().toISOString();
    const metricVersions = {
      integrity: COORDINATION_INTEGRITY_POLICY_CODE,
      lifePoints: COORDINATION_LIFE_POINTS_POLICY_CODE,
    };

    if (scope.type === OperationalKpiScopeType.COORDINATION) {
      const coordinationId = scope.coordinationId!;
      const filter = this.aggregationScope([coordinationId]);
      const [coordination, catalog, maps] = await Promise.all([
        this.coordinationsRepository.findActiveById(coordinationId),
        this.coordinationsRepository.findCatalog(false),
        this.loadAggregationMaps(filter),
      ]);

      if (!coordination) {
        throw new NotFoundException(
          `Coordinación no encontrada: ${coordinationId}`,
        );
      }

      return {
        scope: {
          type: OperationalKpiScopeType.COORDINATION,
          coordinationId: coordination.id,
        },
        generatedAt,
        universe: {
          type: 'active-catalog',
          coordinationCount: catalog.length,
        },
        metricVersions,
        coordination: this.toCoordinationSnapshot(
          coordination,
          maps.snapshots.get(coordination.id),
          maps.statusByOwner.get(coordination.id),
          maps.outgoingByOwner.get(coordination.id) ?? 0,
        ),
      };
    }

    const [coordinations, maps] = await Promise.all([
      this.coordinationsRepository.findCatalog(false),
      this.loadAggregationMaps(),
    ]);
    const direction = this.toDirectionSnapshot(
      coordinations,
      maps.snapshots,
      maps.statusByOwner,
      maps.outgoingByOwner,
    );

    return {
      scope: { type: OperationalKpiScopeType.DIRECTION },
      generatedAt,
      universe: {
        type: 'active-catalog',
        coordinationCount: coordinations.length,
      },
      metricVersions,
      direction,
    };
  }

  /**
   * Serie temporal de una coordinación.
   * Reloj: created_at / closed_at. Zona: America/Bogota.
   * Backlog no filtra por status: RESOLVED sin closed_at sigue contando.
   * Con categoryId: solo INTERNAL de esa categoría (categoría actual).
   */
  async getHistory(
    query: OperationalKpiHistoryQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiHistoryResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');

    if (query.scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        'scope=direction aún no está disponible en /operational-kpis/history.',
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

    const seriesFilter = await this.resolveHistorySeriesFilter(
      query,
      coordination.id,
    );

    const temporal = this.resolveHistoryBuckets(query);
    const buckets = temporal.buckets;

    const counts =
      query.metric === OperationalKpiHistoryMetric.BACKLOG
        ? await this.historyRepository.aggregateBacklog(
            coordination.id,
            buckets,
            seriesFilter,
          )
        : await this.historyRepository.aggregateEventMetric(
            coordination.id,
            query.metric,
            buckets,
            seriesFilter,
          );

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      metric: query.metric,
      ...(temporal.period
        ? { period: temporal.period }
        : { granularity: query.granularity }),
      range: { from: query.from, to: temporal.period?.dataTo ?? query.to },
      timezone: KPI_HISTORY_TIMEZONE,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      series: buckets.map((bucket) => ({
        start: bucket.start,
        end: bucket.end,
        label: bucket.label,
        value: counts.get(bucket.end) ?? 0,
      })),
    };
  }

  /**
   * Distribución INTERNAL por categoría en un periodo.
   * Backlog: snapshot al fin de `to` con la categoría actual
   * (sin historial de ediciones de category_id).
   */
  async getBreakdown(
    query: OperationalKpiBreakdownQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiBreakdownResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');

    if (query.scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        'scope=direction aún no está disponible en /operational-kpis/breakdown.',
      );
    }
    if (!query.coordinationId) {
      throw new BadRequestException('scope=coordination exige coordinationId.');
    }
    if (query.dimension !== OperationalKpiBreakdownDimension.CATEGORY) {
      throw new BadRequestException(
        'Solo dimension=category está disponible en esta fase.',
      );
    }

    parseYmd(query.from);
    parseYmd(query.to);
    if (query.from > query.to) {
      throw new BadRequestException('from no puede ser posterior a to.');
    }

    const coordination = await this.coordinationsRepository.findActiveById(
      query.coordinationId,
    );
    if (!coordination) {
      throw new NotFoundException(
        `Coordinación no encontrada: ${query.coordinationId}`,
      );
    }

    const rows = await this.breakdownRepository.aggregateByCategory(
      coordination.id,
      query.metric,
      query.from,
      query.to,
    );

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      dimension: OperationalKpiBreakdownDimension.CATEGORY,
      metric: query.metric,
      range: { from: query.from, to: query.to },
      timezone: KPI_HISTORY_TIMEZONE,
      items: rows.map((row) => ({
        category: {
          id: row.categoryId,
          code: row.code,
          name: row.name,
          selectable: row.selectable,
        },
        value: row.value,
      })),
    };
  }

  /**
   * Composición de ESTADO para un rango explícito (from/to)
   * o, en legacy, el periodo actual vía granularity.
   * No recalcula integrityStatus histórico.
   */
  async getPeriod(
    query: OperationalKpiPeriodQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiPeriodResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    const coordination = await this.requireCoordinationScope(
      query.scope,
      query.coordinationId,
      'period',
    );

    let from: string;
    let to: string;
    let calendarEnd: string;
    let label: string;
    let incomplete: boolean;
    let granularityLabel: string;

    if (query.from && query.to) {
      parseYmd(query.from);
      parseYmd(query.to);
      if (query.from > query.to) {
        throw new BadRequestException('from no puede ser posterior a to.');
      }
      const today = this.bogotaTodayYmd();
      const window = resolveEstadoDataWindow(
        query.from,
        query.to,
        query.to,
        today,
      );
      from = query.from;
      to = window.dataTo;
      calendarEnd = query.to;
      incomplete = window.isPartial;
      label = `${from} – ${calendarEnd}`;
      granularityLabel = 'custom';
    } else if (query.granularity) {
      const period = buildCurrentAnalysisPeriod(query.granularity);
      from = period.from;
      to = period.to;
      calendarEnd = period.calendarEnd;
      label = period.label;
      incomplete = period.incomplete;
      granularityLabel = query.granularity;
    } else {
      throw new BadRequestException(
        'Exige from+to, o granularity (legacy) para el periodo actual.',
      );
    }

    const [composition, commitments, dependencies] = await Promise.all([
      this.periodRepository.aggregateComposition(
        coordination.id,
        bogotaDayStartIso(from),
        bogotaDayEndExclusiveIso(to),
      ),
      this.relationsRepository.aggregateCommitments(
        coordination.id,
        OperationalKpiHistoryMetric.CREATED,
        from,
        to,
      ),
      this.relationsRepository.aggregateDependencies(
        coordination.id,
        OperationalKpiHistoryMetric.CREATED,
        from,
        to,
      ),
    ]);

    const sum = (rows: Array<{ value: number }>) =>
      rows.reduce((acc, row) => acc + row.value, 0);

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      granularity: granularityLabel,
      period: {
        from,
        to,
        calendarEnd,
        label,
        incomplete,
      },
      timezone: KPI_HISTORY_TIMEZONE,
      severity: composition.severity,
      attention: composition.attention,
      relations: {
        dependencies: sum(dependencies),
        commitments: sum(commitments),
      },
      registeredCount: composition.registeredCount,
      severitySemantics: 'current-severity-of-period-registrations',
    };
  }

  /**
   * Fotografía unificada de ESTADO: composición + evolución en un request.
   * Integrity badge permanece live fuera de este contrato.
   */
  async getState(
    query: OperationalKpiStateQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiStateResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    const coordination = await this.requireCoordinationScope(
      query.scope,
      query.coordinationId,
      'state',
    );

    const today = this.bogotaTodayYmd();
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
    const dataFrom = query.from;
    const dataTo = window.dataTo;
    const kind = query.kind as EstadoPeriodKind;

    const buckets = buildEstadoEvolutionBuckets(kind, dataFrom, dataTo);
    const flowSlots = buildEstadoFlowSlots(
      kind,
      dataFrom,
      calendarEnd,
      dataTo,
      today,
    );
    const evolutionBucket = ESTADO_EVOLUTION_BUCKET[kind];

    const [
      commitments,
      dependencies,
      backlog,
      created,
      closed,
      activeByKind,
      activeByCategory,
      activeByCoordination,
      agingSummary,
      agingOldest,
      snapshotComposition,
      resolutionByBucket,
      resolutionSummary,
    ] = await Promise.all([
      this.relationsRepository.aggregateCommitments(
        coordination.id,
        OperationalKpiHistoryMetric.CREATED,
        dataFrom,
        dataTo,
      ),
      this.relationsRepository.aggregateDependencies(
        coordination.id,
        OperationalKpiHistoryMetric.CREATED,
        dataFrom,
        dataTo,
      ),
      this.historyRepository.aggregateBacklog(coordination.id, buckets),
      this.historyRepository.aggregateEventMetric(
        coordination.id,
        OperationalKpiHistoryMetric.CREATED,
        buckets,
      ),
      this.historyRepository.aggregateEventMetric(
        coordination.id,
        OperationalKpiHistoryMetric.CLOSED,
        buckets,
      ),
      // Carga activa (stock): 3 agregaciones para todos los buckets.
      this.historyRepository.aggregateActiveByKind(coordination.id, buckets),
      this.historyRepository.aggregateActiveInternalByCategory(
        coordination.id,
        buckets,
      ),
      this.historyRepository.aggregateActiveExternalByCoordination(
        coordination.id,
        buckets,
      ),
      // Antigüedad: mismo corte que activeAtPeriodEnd (fin exclusivo de dataTo).
      // Antigüedad, Severidad y Atención: misma población ACTIVE_AT_CUT y mismo corte.
      this.agingRepository.aggregateSummary(coordination.id, dataTo),
      this.agingRepository.findOldest(coordination.id, dataTo),
      this.snapshotRepository.aggregateComposition(coordination.id, dataTo),
      // Resolución: mismo universo y mismos buckets que «Solucionados» (closed).
      this.resolutionRepository.aggregateByBucket(coordination.id, buckets),
      this.resolutionRepository.aggregateSummary(
        coordination.id,
        dataFrom,
        dataTo,
      ),
    ]);

    const byName = (
      a: { count: number; name: string },
      b: { count: number; name: string },
    ) => b.count - a.count || a.name.localeCompare(b.name, 'es');
    const categoriesAt = (key: string) =>
      activeByCategory
        .filter((row) => row.key === key)
        .map((row) => ({
          categoryId: row.categoryId,
          categoryCode: row.categoryCode,
          categoryName: row.categoryName,
          selectable: row.selectable,
          count: row.count,
        }))
        .sort((a, b) =>
          byName(
            { count: a.count, name: a.categoryName },
            { count: b.count, name: b.categoryName },
          ),
        );
    const coordinationsAt = (key: string) =>
      activeByCoordination
        .filter((row) => row.key === key)
        .map((row) => ({
          coordinationId: row.coordinationId,
          coordinationCode: row.coordinationCode,
          coordinationName: row.coordinationName,
          count: row.count,
        }))
        .sort((a, b) =>
          byName(
            { count: a.count, name: a.coordinationName },
            { count: b.count, name: b.coordinationName },
          ),
        );

    const sum = (rows: Array<{ value: number }>) =>
      rows.reduce((acc, row) => acc + row.value, 0);

    const toSeries = (counts: Map<string, number>) =>
      buckets.map((bucket) => ({
        start: bucket.start,
        end: bucket.end,
        label: bucket.label,
        value: counts.get(bucket.end) ?? 0,
      }));

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      timezone: KPI_HISTORY_TIMEZONE,
      period: {
        kind: query.kind,
        from: query.from,
        to: dataTo,
        calendarEnd,
        label: `${query.from} – ${calendarEnd}`,
        isCurrent: window.isCurrent,
        isPartial: window.isPartial,
        dataTo,
      },
      relations: {
        dependencies: sum(dependencies),
        commitments: sum(commitments),
      },
      evolution: {
        bucket: evolutionBucket,
        backlog: toSeries(backlog),
        created: toSeries(created),
        closed: toSeries(closed),
        buckets: flowSlots.map((slot) => ({
          start: slot.bucket.start,
          end: slot.bucket.end,
          dataEnd: slot.dataEnd,
          calendarStart: slot.bucket.calendarStart ?? slot.bucket.start,
          calendarEnd: slot.bucket.calendarEnd ?? slot.bucket.end,
          label: slot.bucket.label,
          current: slot.current,
          future: slot.future,
          created: slot.dataEnd ? (created.get(slot.dataEnd) ?? 0) : null,
          closed: slot.dataEnd ? (closed.get(slot.dataEnd) ?? 0) : null,
          backlog: slot.dataEnd ? (backlog.get(slot.dataEnd) ?? 0) : null,
          active: slot.dataEnd
            ? (() => {
                const kinds = activeByKind.get(slot.dataEnd) ?? {
                  internal: 0,
                  external: 0,
                };
                return {
                  total: kinds.internal + kinds.external,
                  internal: kinds.internal,
                  external: kinds.external,
                  internalBreakdown: categoriesAt(slot.dataEnd),
                  externalBreakdown: coordinationsAt(slot.dataEnd),
                };
              })()
            : null,
          // Mismo universo que closed: coordination_id = X, cualquier tipo.
          solved: slot.dataEnd
            ? { total: closed.get(slot.dataEnd) ?? 0 }
            : null,
        })),
      },
      // Mismo corte que el último bucket de backlog (fin de dataTo): sin query extra.
      activeAtPeriodEnd: {
        count: backlog.get(dataTo) ?? 0,
        at: dataTo,
        isNow: window.isCurrent,
      },
      aging: buildEstadoAging({
        at: dataTo,
        isNow: window.isCurrent,
        summary: agingSummary,
        oldest: agingOldest,
      }),
      snapshot: buildEstadoSnapshot({
        at: dataTo,
        isNow: window.isCurrent,
        composition: snapshotComposition,
      }),
      resolution: buildEstadoResolution({
        slots: flowSlots,
        byBucket: resolutionByBucket,
        summary: resolutionSummary,
      }),
    };
  }

  private async requireCoordinationScope(
    scope: OperationalKpiScopeType,
    coordinationId: string | undefined,
    route: string,
  ): Promise<Coordination> {
    if (scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        `scope=direction aún no está disponible en /operational-kpis/${route}.`,
      );
    }
    if (!coordinationId) {
      throw new BadRequestException('scope=coordination exige coordinationId.');
    }
    const coordination =
      await this.coordinationsRepository.findActiveById(coordinationId);
    if (!coordination) {
      throw new NotFoundException(
        `Coordinación no encontrada: ${coordinationId}`,
      );
    }
    return coordination;
  }

  private bogotaTodayYmd(now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: KPI_HISTORY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  async getRelations(
    query: OperationalKpiRelationsQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiRelationsResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');

    if (query.scope !== OperationalKpiScopeType.COORDINATION) {
      throw new BadRequestException(
        'scope=direction aún no está disponible en /operational-kpis/relations.',
      );
    }
    if (!query.coordinationId) {
      throw new BadRequestException('scope=coordination exige coordinationId.');
    }
    parseYmd(query.from);
    parseYmd(query.to);
    if (query.from > query.to) {
      throw new BadRequestException('from no puede ser posterior a to.');
    }

    const coordination = await this.coordinationsRepository.findActiveById(
      query.coordinationId,
    );
    if (!coordination) {
      throw new NotFoundException(
        `Coordinación no encontrada: ${query.coordinationId}`,
      );
    }

    const [commitments, dependencies] = await Promise.all([
      this.relationsRepository.aggregateCommitments(
        coordination.id,
        query.metric,
        query.from,
        query.to,
      ),
      this.relationsRepository.aggregateDependencies(
        coordination.id,
        query.metric,
        query.from,
        query.to,
      ),
    ]);

    return {
      scope: {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: coordination.id,
      },
      metric: query.metric,
      range: { from: query.from, to: query.to },
      timezone: KPI_HISTORY_TIMEZONE,
      commitments: commitments.map((row) => ({
        coordination: {
          id: row.coordinationId,
          code: row.code,
          name: row.name,
          shortName: row.shortName,
        },
        value: row.value,
      })),
      dependencies: dependencies.map((row) => ({
        coordination: {
          id: row.coordinationId,
          code: row.code,
          name: row.name,
          shortName: row.shortName,
        },
        value: row.value,
      })),
    };
  }

  /**
   * Buckets de /history. Con `kind` reutiliza exactamente el contrato
   * temporal de /state (validación de geometría + buckets automáticos).
   */
  private resolveHistoryBuckets(query: OperationalKpiHistoryQueryDto): {
    buckets: KpiHistoryBucket[];
    period?: OperationalKpiHistoryPeriodDto;
  } {
    if (query.kind && query.granularity) {
      throw new BadRequestException(
        'Usa kind (periodo de análisis) o granularity (legacy), no ambos.',
      );
    }
    if (query.kind) {
      const today = this.bogotaTodayYmd();
      const calendarEnd = query.calendarEnd ?? query.to;
      assertEstadoPeriodShape(
        query.kind,
        query.from,
        query.to,
        calendarEnd,
        today,
      );
      const { dataTo } = resolveEstadoDataWindow(
        query.from,
        query.to,
        calendarEnd,
        today,
      );
      return {
        buckets: buildEstadoEvolutionBuckets(query.kind, query.from, dataTo),
        period: {
          kind: query.kind,
          from: query.from,
          dataTo,
          calendarEnd,
          bucket: ESTADO_EVOLUTION_BUCKET[query.kind],
        },
      };
    }
    if (!query.granularity) {
      throw new BadRequestException('Exige kind o granularity.');
    }
    if (query.calendarEnd) {
      throw new BadRequestException('calendarEnd solo aplica con kind.');
    }
    return {
      buckets: buildKpiHistoryBuckets(query.granularity, query.from, query.to),
    };
  }

  private async resolveHistorySeriesFilter(
    query: OperationalKpiHistoryQueryDto,
    ownerCoordinationId: string,
  ): Promise<KpiHistorySeriesFilter> {
    if (query.partnerCoordinationId) {
      if (!query.dependencySide) {
        throw new BadRequestException(
          'partnerCoordinationId exige dependencySide.',
        );
      }
      if (query.categoryId) {
        throw new BadRequestException(
          'categoryId y partnerCoordinationId no se combinan.',
        );
      }
      if (query.partnerCoordinationId === ownerCoordinationId) {
        throw new BadRequestException(
          'partnerCoordinationId no puede ser la misma coordinación.',
        );
      }
      const partner = await this.coordinationsRepository.findActiveById(
        query.partnerCoordinationId,
      );
      if (!partner) {
        throw new NotFoundException(
          `Coordinación partner no encontrada: ${query.partnerCoordinationId}`,
        );
      }
      return {
        partner: {
          ownerCoordinationId,
          partnerCoordinationId: partner.id,
          side:
            query.dependencySide === OperationalKpiDependencySide.COMMITMENT
              ? 'commitment'
              : 'dependency',
        },
      };
    }

    if (!query.categoryId) {
      return {};
    }
    if (isUncategorizedCategoryId(query.categoryId)) {
      return {
        reportKind: SituationReportKind.INTERNAL,
        categoryId: null,
      };
    }
    const category = await this.categoriesRepository.findOne({
      where: { id: query.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría no encontrada: ${query.categoryId}`,
      );
    }
    return {
      reportKind: SituationReportKind.INTERNAL,
      categoryId: category.id,
    };
  }

  /**
   * Compara N coordinaciones activas en un round-trip.
   * El orden de `items` replica el de `coordinationIds`.
   * No hay winner/score: solo valores objetivos.
   *
   * Acceso futuro: un actor coordination-scoped con KPIS_VIEW no debería
   * comparar fuera de su área. Hoy no se filtra por roleCode.
   */
  async compare(
    query: OperationalKpiCompareQueryDto,
    actor: AuthPayload,
  ): Promise<OperationalKpiCompareResponseDto> {
    this.scopeService.assertPermission(actor, 'KPIS_VIEW');
    const ids = query.coordinationIds;
    const filter = this.aggregationScope(ids);
    const generatedAt = new Date().toISOString();

    const [catalog, found, maps] = await Promise.all([
      this.coordinationsRepository.findCatalog(false),
      this.coordinationsRepository.findActiveByIds(ids),
      this.loadAggregationMaps(filter),
    ]);

    const foundById = new Map(found.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !foundById.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Coordinación no encontrada: ${missing.join(', ')}`,
      );
    }

    const items = ids.map((id) => {
      const coordination = foundById.get(id)!;
      return this.toCoordinationSnapshot(
        coordination,
        maps.snapshots.get(id),
        maps.statusByOwner.get(id),
        maps.outgoingByOwner.get(id) ?? 0,
      );
    });

    return {
      generatedAt,
      universe: {
        type: 'active-catalog',
        coordinationCount: catalog.length,
      },
      metricVersions: {
        integrity: COORDINATION_INTEGRITY_POLICY_CODE,
        lifePoints: COORDINATION_LIFE_POINTS_POLICY_CODE,
      },
      items,
    };
  }

  /**
   * Combinaciones inválidas: 400, no se ignoran.
   * group/compare no están en el enum: ValidationPipe ya responde 400.
   */
  resolveScope(query: OperationalKpiQueryDto): ResolvedKpiScope {
    if (query.scope === OperationalKpiScopeType.DIRECTION) {
      if (query.coordinationId) {
        throw new BadRequestException(
          'scope=direction no admite coordinationId.',
        );
      }
      return { type: OperationalKpiScopeType.DIRECTION };
    }

    if (query.scope === OperationalKpiScopeType.COORDINATION) {
      if (!query.coordinationId) {
        throw new BadRequestException(
          'scope=coordination exige coordinationId.',
        );
      }
      return {
        type: OperationalKpiScopeType.COORDINATION,
        coordinationId: query.coordinationId,
      };
    }

    throw new BadRequestException('scope no soportado.');
  }

  private aggregationScope(
    ids: readonly string[],
  ): OperationalAggregationScope {
    return {
      ownerCoordinationIds: ids,
      affectedCoordinationIds: ids,
    };
  }

  private async loadAggregationMaps(scope?: OperationalAggregationScope) {
    const [severityRows, affectedRows, incomingRows, statusRows, outgoingRows] =
      await Promise.all([
        this.overviewRepository.aggregateActiveSituationsBySeverity(scope),
        this.overviewRepository.aggregateAffectedCoordinations(scope),
        this.overviewRepository.aggregateIncomingDependencies(scope),
        this.overviewRepository.aggregateActiveSituationsByStatus(scope),
        this.overviewRepository.aggregateOutgoingDependencies(scope),
      ]);

    return {
      snapshots: buildCoordinationLifeSnapshots(
        severityRows,
        affectedRows,
        incomingRows,
      ),
      statusByOwner: this.indexStatusCounts(statusRows),
      outgoingByOwner: this.indexOutgoing(outgoingRows),
    };
  }

  private toCoordinationSnapshot(
    coordination: Coordination,
    snapshot: CoordinationLifeSnapshot | undefined,
    status: StatusCounts | undefined,
    outgoing: number,
  ): OperationalKpiCoordinationSnapshotDto {
    const resolved = snapshot ?? emptyCoordinationLifeSnapshot();
    const integrity = evaluateCoordinationIntegrity(resolved);
    const life = evaluateCoordinationLifePoints(resolved);
    const problems = this.toProblemCounts(resolved, status);

    return {
      coordination: {
        id: coordination.id,
        code: coordination.code,
        name: coordination.name,
        shortName: coordination.shortName,
      },
      problems,
      dependencies: {
        incoming: resolved.incomingDependencyCount,
        outgoing,
      },
      integrityStatus: integrity.status,
      lifePoints: life.lifePoints,
    };
  }

  private toDirectionSnapshot(
    coordinations: readonly Coordination[],
    snapshots: Map<string, CoordinationLifeSnapshot>,
    statusByOwner: Map<string, StatusCounts>,
    outgoingByOwner: Map<string, number>,
  ): OperationalKpiDirectionSnapshotDto {
    const integrityStatuses: OperationalIntegrityStatus[] = [];
    let incoming = 0;
    let outgoing = 0;
    const problems = this.emptyProblemCounts();
    const items: OperationalKpiCoordinationSnapshotDto[] = [];

    for (const coordination of coordinations) {
      const snapshot =
        snapshots.get(coordination.id) ?? emptyCoordinationLifeSnapshot();
      const item = this.toCoordinationSnapshot(
        coordination,
        snapshot,
        statusByOwner.get(coordination.id),
        outgoingByOwner.get(coordination.id) ?? 0,
      );
      items.push(item);
      integrityStatuses.push(item.integrityStatus);
      this.addProblemCounts(problems, item.problems);
      incoming += snapshot.incomingDependencyCount;
      outgoing += outgoingByOwner.get(coordination.id) ?? 0;
    }

    const registrySnapshot = snapshots.get(ANALYST_REGISTRY_KEY);
    const analystRegistry = this.toAnalystRegistry(
      registrySnapshot,
      statusByOwner.get(ANALYST_REGISTRY_KEY),
    );

    const direction = evaluateOperationalDirectionIntegrity({
      coordinationStatuses: integrityStatuses,
      analystRegistryStatus: analystRegistry.integrityStatus,
    });

    const unknown = integrityStatuses.filter(
      (status) => status === 'DESCONOCIDO',
    ).length;

    return {
      directionStatus: direction.status,
      problems,
      dependencies: { incoming, outgoing },
      coordinationStatusTotals: {
        critical: direction.totals.critical,
        alert: direction.totals.alert,
        stable: direction.totals.stable,
        unknown,
      },
      analystRegistry,
      coordinations: items,
    };
  }

  private toAnalystRegistry(
    snapshot: CoordinationLifeSnapshot | undefined,
    status: StatusCounts | undefined,
  ): OperationalKpiAnalystRegistryDto {
    const resolved = snapshot ?? emptyCoordinationLifeSnapshot();
    const integrity = evaluateAnalystRegistryIntegrity(resolved);
    return {
      integrityStatus: integrity.status,
      problems: this.toProblemCounts(resolved, status),
    };
  }

  private toProblemCounts(
    snapshot: CoordinationLifeSnapshot,
    status: StatusCounts | undefined,
  ): OperationalKpiProblemCountsDto {
    const open = status?.open ?? 0;
    const inProgress = status?.inProgress ?? 0;
    return {
      activeCount: snapshot.activeProblemsCount,
      status: { open, inProgress },
      severity: {
        critical: snapshot.criticalCount,
        high: snapshot.highCount,
        medium: snapshot.mediumCount,
        low: snapshot.lowCount,
      },
    };
  }

  private emptyProblemCounts(): OperationalKpiProblemCountsDto {
    return {
      activeCount: 0,
      status: { open: 0, inProgress: 0 },
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
    };
  }

  private addProblemCounts(
    target: OperationalKpiProblemCountsDto,
    add: OperationalKpiProblemCountsDto,
  ): void {
    target.activeCount += add.activeCount;
    target.status.open += add.status.open;
    target.status.inProgress += add.status.inProgress;
    target.severity.critical += add.severity.critical;
    target.severity.high += add.severity.high;
    target.severity.medium += add.severity.medium;
    target.severity.low += add.severity.low;
  }

  private indexStatusCounts(
    rows: readonly ActiveStatusRow[],
  ): Map<string, StatusCounts> {
    const indexed = new Map<string, StatusCounts>();
    for (const row of rows) {
      const key = snapshotKeyOf(row.coordinationId);
      const current = indexed.get(key) ?? { open: 0, inProgress: 0 };
      if (row.status === SituationStatus.OPEN) {
        current.open += row.total;
      } else if (row.status === SituationStatus.IN_PROGRESS) {
        current.inProgress += row.total;
      }
      indexed.set(key, current);
    }
    return indexed;
  }

  private indexOutgoing(
    rows: readonly OutgoingDependencyRow[],
  ): Map<string, number> {
    return new Map(rows.map((row) => [row.coordinationId, row.total]));
  }
}
