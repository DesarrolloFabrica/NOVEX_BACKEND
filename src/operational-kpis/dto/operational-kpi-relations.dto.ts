import { OperationalKpiHistoryMetric } from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export class OperationalKpiRelationPartnerDto {
  id!: string;
  code!: string;
  name!: string;
  shortName!: string;
}

export class OperationalKpiRelationItemDto {
  coordination!: OperationalKpiRelationPartnerDto;
  value!: number;
}

export class OperationalKpiRelationsResponseDto {
  scope!: {
    type: OperationalKpiScopeType;
    coordinationId: string;
  };
  metric!: OperationalKpiHistoryMetric;
  range!: { from: string; to: string };
  timezone!: 'America/Bogota';
  /** Compromisos: yo soy responsable, otra área es afectada. */
  commitments!: OperationalKpiRelationItemDto[];
  /** Dependencias: otra área es responsable, yo soy afectada. */
  dependencies!: OperationalKpiRelationItemDto[];
}
