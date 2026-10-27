import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Scopes de esta fase. `group` y `compare` se añadirán al enum sin romper
 * el query actual; hoy un valor desconocido es 400.
 */
export enum OperationalKpiScopeType {
  DIRECTION = 'direction',
  COORDINATION = 'coordination',
}

export class OperationalKpiQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @IsOptional()
  @IsUUID('4')
  coordinationId?: string;
}
