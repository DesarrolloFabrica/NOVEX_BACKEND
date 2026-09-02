import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationSeverity } from '../../common/enums/situation.enums';
import { SituationAffectedCoordination } from '../../situation-impact/entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from '../../situation-impact/entities/situation-impact-assessment.entity';
import { Situation } from '../../situations/entities/situation.entity';
import { ACTIVE_SITUATION_STATUSES } from '../domain/coordination-integrity';

/** Una fila por (coordinación dueña, severidad). `coordinationId` null = Registro de analista. */
export interface ActiveSeverityRow {
  coordinationId: string | null;
  severity: SituationSeverity;
  total: number;
}

/** Coordinaciones distintas alcanzadas por los problemas activos de cada dueño. */
export interface AffectedCoordinationRow {
  coordinationId: string | null;
  total: number;
}

/**
 * Agregación de LEVEL 0. Dos consultas con `GROUP BY`, ambas sobre el MISMO
 * universo filtrado (`status IN (OPEN, IN_PROGRESS)`), de modo que el número
 * de queries no depende del número de situaciones ni de coordinaciones.
 *
 * No carga entidades completas, ni análisis IA, ni recomendaciones, ni
 * evidencias, ni timeline.
 */
@Injectable()
export class OperationalOverviewRepository extends Repository<Situation> {
  constructor(private readonly dataSource: DataSource) {
    super(Situation, dataSource.createEntityManager());
  }

  /**
   * Conteo de situaciones activas por coordinación dueña y severidad.
   * Incluye el grupo `coordination_id IS NULL` (Registro de analista): el
   * filtrado por alcance se aplica después, en el service.
   */
  async aggregateActiveSituationsBySeverity(): Promise<ActiveSeverityRow[]> {
    const rows = await this.createQueryBuilder('situation')
      .select('situation.coordinationId', 'coordinationId')
      .addSelect('situation.severity', 'severity')
      .addSelect('COUNT(*)', 'total')
      .where('situation.status IN (:...statuses)', {
        statuses: [...ACTIVE_SITUATION_STATUSES],
      })
      .groupBy('situation.coordinationId')
      .addGroupBy('situation.severity')
      .getRawMany<{
        coordinationId: string | null;
        severity: SituationSeverity;
        total: string;
      }>();

    return rows.map((row) => ({
      coordinationId: row.coordinationId,
      severity: row.severity,
      total: Number(row.total),
    }));
  }

  /**
   * Coordinaciones DISTINTAS afectadas por los problemas activos de cada
   * dueño, vía `situation_impact_assessments` ->
   * `situation_affected_coordinations`.
   *
   * La coordinación dueña no cuenta como propagación hacia otra área: el
   * modelo permite que aparezca entre las afectadas y la lectura existente ya
   * la descarta (`SituationImpactService.selectSimulatedCandidates`). El
   * Registro de analista no tiene dueña, así que no se excluye nada.
   */
  async aggregateAffectedCoordinations(): Promise<AffectedCoordinationRow[]> {
    const rows = await this.createQueryBuilder('situation')
      .innerJoin(
        SituationImpactAssessment,
        'assessment',
        'assessment.situationId = situation.id',
      )
      .innerJoin(
        SituationAffectedCoordination,
        'affected',
        'affected.impactAssessmentId = assessment.id',
      )
      .select('situation.coordinationId', 'coordinationId')
      .addSelect('COUNT(DISTINCT affected.coordination_id)', 'total')
      .where('situation.status IN (:...statuses)', {
        statuses: [...ACTIVE_SITUATION_STATUSES],
      })
      .andWhere(
        '(situation.coordinationId IS NULL OR affected.coordinationId <> situation.coordinationId)',
      )
      .groupBy('situation.coordinationId')
      .getRawMany<{ coordinationId: string | null; total: string }>();

    return rows.map((row) => ({
      coordinationId: row.coordinationId,
      total: Number(row.total),
    }));
  }
}
