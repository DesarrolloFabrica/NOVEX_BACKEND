import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';

export type PeriodCompositionCounts = {
  severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  attention: {
    open: number;
    inProgress: number;
  };
  registeredCount: number;
};

/**
 * Agregación de composición temporal: created_at ∈ [from, to).
 * Severidad = valor persistido actual (sin historial de cambios).
 */
@Injectable()
export class OperationalKpiPeriodRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateComposition(
    coordinationId: string,
    fromInclusiveIso: string,
    toExclusiveIso: string,
  ): Promise<PeriodCompositionCounts> {
    const sql = `
      SELECT
        s.severity AS severity,
        s.status AS status,
        COUNT(s.id)::int AS total
      FROM situations s
      WHERE s.coordination_id = $1
        AND s.created_at >= $2
        AND s.created_at < $3
      GROUP BY s.severity, s.status
    `;
    const rows = (await this.situationsRepository.manager.query(sql, [
      coordinationId,
      fromInclusiveIso,
      toExclusiveIso,
    ])) as Array<{
      severity: SituationSeverity;
      status: SituationStatus;
      total: number;
    }>;

    const severity = { low: 0, medium: 0, high: 0, critical: 0 };
    const attention = { open: 0, inProgress: 0 };
    let registeredCount = 0;

    for (const row of rows) {
      const total = Number(row.total) || 0;
      registeredCount += total;
      switch (row.severity) {
        case SituationSeverity.LOW:
          severity.low += total;
          break;
        case SituationSeverity.MEDIUM:
          severity.medium += total;
          break;
        case SituationSeverity.HIGH:
          severity.high += total;
          break;
        case SituationSeverity.CRITICAL:
          severity.critical += total;
          break;
        default:
          break;
      }
      if (row.status === SituationStatus.OPEN) {
        attention.open += total;
      } else if (row.status === SituationStatus.IN_PROGRESS) {
        attention.inProgress += total;
      }
    }

    return { severity, attention, registeredCount };
  }
}
