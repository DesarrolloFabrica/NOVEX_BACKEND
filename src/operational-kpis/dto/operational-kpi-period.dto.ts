export class OperationalKpiPeriodRangeDto {
  from!: string;
  to!: string;
  calendarEnd!: string;
  label!: string;
  incomplete!: boolean;
}

export class OperationalKpiPeriodSeverityDto {
  low!: number;
  medium!: number;
  high!: number;
  critical!: number;
}

export class OperationalKpiPeriodAttentionDto {
  open!: number;
  inProgress!: number;
}

export class OperationalKpiPeriodRelationsDto {
  dependencies!: number;
  commitments!: number;
}

export class OperationalKpiPeriodResponseDto {
  scope!: { type: 'coordination'; coordinationId: string };
  granularity!: string;
  period!: OperationalKpiPeriodRangeDto;
  timezone!: string;
  severity!: OperationalKpiPeriodSeverityDto;
  attention!: OperationalKpiPeriodAttentionDto;
  relations!: OperationalKpiPeriodRelationsDto;
  registeredCount!: number;
  /**
   * Clarifica semántica: severidad persistida actual de los casos
   * registrados en el periodo (sin historial de cambios).
   */
  severitySemantics!: 'current-severity-of-period-registrations';
}
