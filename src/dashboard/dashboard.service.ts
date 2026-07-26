import { Injectable } from '@nestjs/common';
import {
  OperationalEnvironmentStatus,
  OperationalEventStatus,
  OperationalTrend,
  RiskLevel,
} from '../common/enums/operational.enums';
import { OperationalEventsRepository } from '../operational-events/repositories/operational-events.repository';
import {
  AreaMetricBreakdownDto,
  CategoryMetricBreakdownDto,
  ConsolidatedIndicatorDto,
  DashboardMetricsDto,
} from './dto/dashboard-metrics.dto';
import { AIInterpretation } from '../intelligence/entities/ai-interpretation.entity';
import { OperationalEvent } from '../operational-events/entities/operational-event.entity';

type EventWithInterpretations = OperationalEvent[];

/**
 * Servicio del tablero ejecutivo.
 * Sprint 6: esqueleto alineado a DashboardMetrics del frontend.
 * El motor de agregación completo se portará en el siguiente sprint.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly eventsRepository: OperationalEventsRepository,
  ) {}

  /**
   * Fotografía ejecutiva calculada desde eventos persistidos.
   */
  async getMetrics(): Promise<DashboardMetricsDto> {
    const events = await this.eventsRepository.find({
      relations: {
        interpretations: {
          category: true,
          affectedAreas: true,
          suggestedIndicators: true,
        },
      },
      order: { reportedAt: 'DESC' },
    });
    const totalEvents = events.length;
    const interpretations = events
      .map((event) =>
        event.interpretations?.find(
          (interpretation) =>
            interpretation.id === event.currentInterpretationId,
        ),
      )
      .filter(this.isInterpretation);
    const activeEvents = events.filter((event) =>
      [OperationalEventStatus.OPEN, OperationalEventStatus.MONITORING].includes(
        event.status,
      ),
    );
    const activeInterpretations = activeEvents
      .map((event) =>
        event.interpretations?.find(
          (interpretation) =>
            interpretation.id === event.currentInterpretationId,
        ),
      )
      .filter(this.isInterpretation);

    if (totalEvents === 0) {
      return this.emptyMetrics();
    }

    const averageRiskScore = this.average(
      activeInterpretations.map((item) => item.riskScore),
    );
    const operationalRiskLevel = this.riskLevelFromScore(averageRiskScore);
    const byCategory = this.buildCategoryBreakdown(events);
    const byArea = this.buildAreaBreakdown(events);
    const dominantAreaName = byArea[0]?.areaName ?? null;
    const dominantCategoryName = byCategory[0]?.categoryName ?? null;

    return {
      totalEvents,
      openCount: events.filter((event) => event.status === OperationalEventStatus.OPEN)
        .length,
      monitoringCount: events.filter(
        (event) => event.status === OperationalEventStatus.MONITORING,
      ).length,
      resolvedCount: events.filter(
        (event) => event.status === OperationalEventStatus.RESOLVED,
      ).length,
      archivedCount: events.filter(
        (event) => event.status === OperationalEventStatus.ARCHIVED,
      ).length,
      averageAffectationPercentage: this.average(
        activeInterpretations.map((item) => item.affectationPercentage),
      ),
      averageRiskScore,
      criticalCount: activeInterpretations.filter(
        (item) => item.riskLevel === RiskLevel.CRITICAL,
      ).length,
      highRiskCount: interpretations.filter(
        (item) => item.riskLevel === RiskLevel.HIGH,
      ).length,
      averageImpactInternal: this.average(
        activeInterpretations.map((item) => item.impactInternal),
      ),
      averageImpactExternal: this.average(
        activeInterpretations.map((item) => item.impactExternal),
      ),
      averageImpactStudents: this.average(
        activeInterpretations.map((item) => item.impactStudents),
      ),
      operationalRiskLevel,
      trend: OperationalTrend.STABLE,
      byCategory,
      byArea,
      consolidatedIndicators: this.buildConsolidatedIndicators(events),
      executiveNarrative: this.buildNarrative(
        totalEvents,
        activeEvents.length,
        operationalRiskLevel,
        dominantAreaName,
      ),
      dominantAreaName,
      dominantCategoryName,
      environment: this.environmentFromRisk(operationalRiskLevel),
      generatedAt: new Date().toISOString(),
    };
  }

  private emptyMetrics(): DashboardMetricsDto {
    return {
      totalEvents: 0,
      openCount: 0,
      monitoringCount: 0,
      resolvedCount: 0,
      archivedCount: 0,
      averageAffectationPercentage: 0,
      averageRiskScore: 0,
      criticalCount: 0,
      highRiskCount: 0,
      averageImpactInternal: 0,
      averageImpactExternal: 0,
      averageImpactStudents: 0,
      operationalRiskLevel: RiskLevel.LOW,
      trend: OperationalTrend.INSUFFICIENT_DATA,
      byCategory: [],
      byArea: [],
      consolidatedIndicators: [],
      executiveNarrative:
        'No hay eventos operacionales registrados en este periodo. El tablero permanece en espera de nueva información.',
      dominantAreaName: null,
      dominantCategoryName: null,
      environment: OperationalEnvironmentStatus.PENDING,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildCategoryBreakdown(
    events: EventWithInterpretations,
  ): CategoryMetricBreakdownDto[] {
    const map = new Map<string, CategoryMetricBreakdownDto>();
    for (const event of events) {
      const interpretation = event.interpretations?.find(
        (item) => item.id === event.currentInterpretationId,
      );
      if (!interpretation) continue;

      const item = map.get(interpretation.categoryId) ?? {
        categoryId: interpretation.categoryId,
        categoryName: interpretation.categoryName,
        count: 0,
        activeCount: 0,
        criticalCount: 0,
      };
      item.count += 1;
      if (event.status !== OperationalEventStatus.RESOLVED) {
        item.activeCount += 1;
      }
      if (interpretation.riskLevel === RiskLevel.CRITICAL) {
        item.criticalCount += 1;
      }
      map.set(item.categoryId, item);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  private buildAreaBreakdown(
    events: EventWithInterpretations,
  ): AreaMetricBreakdownDto[] {
    const map = new Map<string, AreaMetricBreakdownDto & { riskTotal: number }>();
    for (const event of events) {
      const interpretation = event.interpretations?.find(
        (item) => item.id === event.currentInterpretationId,
      );
      if (!interpretation) continue;

      for (const area of interpretation.affectedAreas ?? []) {
        const item = map.get(area.id) ?? {
          areaId: area.id,
          areaName: area.name,
          openCount: 0,
          eventCount: 0,
          criticalCount: 0,
          averageRiskScore: 0,
          riskTotal: 0,
        };
        item.eventCount += 1;
        item.riskTotal += interpretation.riskScore;
        item.averageRiskScore = Math.round(item.riskTotal / item.eventCount);
        if (event.status !== OperationalEventStatus.RESOLVED) {
          item.openCount += 1;
        }
        if (interpretation.riskLevel === RiskLevel.CRITICAL) {
          item.criticalCount += 1;
        }
        map.set(area.id, item);
      }
    }
    return [...map.values()]
      .map(({ riskTotal: _riskTotal, ...item }) => item)
      .sort((a, b) => b.openCount - a.openCount || b.averageRiskScore - a.averageRiskScore);
  }

  private buildConsolidatedIndicators(
    events: EventWithInterpretations,
  ): ConsolidatedIndicatorDto[] {
    return events
      .flatMap((event) =>
        event.interpretations
          ?.find((item) => item.id === event.currentInterpretationId)
          ?.suggestedIndicators?.map((indicator) => ({
            code: indicator.code,
            label: indicator.label,
            value: indicator.value,
            unit: indicator.unit ?? undefined,
            direction: indicator.direction ?? undefined,
            source: indicator.source as ConsolidatedIndicatorDto['source'],
          })) ?? [],
      )
      .slice(0, 8);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
  }

  private isInterpretation(
    item: AIInterpretation | undefined,
  ): item is AIInterpretation {
    return Boolean(item);
  }

  private riskLevelFromScore(score: number): RiskLevel {
    if (score >= 80) return RiskLevel.CRITICAL;
    if (score >= 65) return RiskLevel.HIGH;
    if (score >= 40) return RiskLevel.MODERATE;
    return RiskLevel.LOW;
  }

  private environmentFromRisk(riskLevel: RiskLevel): OperationalEnvironmentStatus {
    if (riskLevel === RiskLevel.CRITICAL) return OperationalEnvironmentStatus.CRITICAL;
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.MODERATE) {
      return OperationalEnvironmentStatus.ATTENTION;
    }
    return OperationalEnvironmentStatus.HEALTHY;
  }

  private buildNarrative(
    totalEvents: number,
    activeCount: number,
    riskLevel: RiskLevel,
    dominantAreaName: string | null,
  ): string {
    return `La plataforma contiene ${totalEvents} eventos semilla, con ${activeCount} activos y riesgo operacional ${riskLevel}. El area con mayor concentracion de afectacion es ${dominantAreaName ?? 'sin concentracion dominante'}.`;
  }
}
