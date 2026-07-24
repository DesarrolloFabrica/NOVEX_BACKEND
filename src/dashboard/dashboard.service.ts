import { Injectable } from '@nestjs/common';
import {
  OperationalEnvironmentStatus,
  OperationalTrend,
  RiskLevel,
} from '../common/enums/operational.enums';
import { OperationalEventsRepository } from '../operational-events/repositories/operational-events.repository';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto';

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
   * Fotografía vacía/neutral mientras no se porte el engine.
   * Garantiza el contrato de respuesta para la integración frontend.
   */
  async getMetrics(): Promise<DashboardMetricsDto> {
    const totalEvents = await this.eventsRepository.count();

    return {
      totalEvents,
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
        totalEvents === 0
          ? 'No hay eventos operacionales registrados en este periodo. El tablero permanece en espera de nueva información.'
          : 'Motor de inteligencia pendiente de portar al backend. El contrato DashboardMetrics ya está disponible.',
      dominantAreaName: null,
      dominantCategoryName: null,
      environment: OperationalEnvironmentStatus.PENDING,
      generatedAt: new Date().toISOString(),
    };
  }
}
