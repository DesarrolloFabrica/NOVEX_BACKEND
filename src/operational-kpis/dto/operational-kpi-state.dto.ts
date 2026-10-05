import { OperationalKpiHistoryPointDto } from './operational-kpi-history.dto';

export class OperationalKpiStatePeriodDto {
  kind!: string;
  from!: string;
  to!: string;
  calendarEnd!: string;
  label!: string;
  isCurrent!: boolean;
  isPartial!: boolean;
  dataTo!: string;
}

export class OperationalKpiStateSeverityDto {
  low!: number;
  medium!: number;
  high!: number;
  critical!: number;
}

export class OperationalKpiStateAttentionDto {
  open!: number;
  inProgress!: number;
}

export class OperationalKpiStateRelationsDto {
  dependencies!: number;
  commitments!: number;
}

export class OperationalKpiStateEvolutionDto {
  bucket!: 'day' | 'week' | 'month';
  backlog!: OperationalKpiHistoryPointDto[];
  created!: OperationalKpiHistoryPointDto[];
  closed!: OperationalKpiHistoryPointDto[];
}

export class OperationalKpiStateResponseDto {
  scope!: { type: 'coordination'; coordinationId: string };
  timezone!: string;
  period!: OperationalKpiStatePeriodDto;
  severity!: OperationalKpiStateSeverityDto;
  attention!: OperationalKpiStateAttentionDto;
  relations!: OperationalKpiStateRelationsDto;
  registeredCount!: number;
  severitySemantics!: 'current-severity-of-period-registrations';
  evolution!: OperationalKpiStateEvolutionDto;
}
