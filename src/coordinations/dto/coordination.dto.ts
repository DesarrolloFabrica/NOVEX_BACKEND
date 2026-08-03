import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListCoordinationsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean = false;

  /**
   * Catálogo completo para autocompletado (percepción de coordinaciones relacionadas).
   * No restringe por alcance del coordinador; el alcance operativo sigue en graph/list normal.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  catalog?: boolean = false;
}

export class CoordinationResponseDto {
  id!: string;
  code!: string;
  name!: string;
  shortName!: string;
  description!: string | null;
  color!: string;
  icon!: string;
  imageAsset!: string;
  displayOrder!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CoordinationDependencyResponseDto {
  id!: string;
  sourceCoordinationId!: string;
  targetCoordinationId!: string;
  dependencyWeight!: number;
  dependencyType!: string;
  bidirectional!: boolean;
}

export class CoordinationGraphResponseDto {
  coordinations!: CoordinationResponseDto[];
  dependencies!: CoordinationDependencyResponseDto[];
}

/** Snapshot agregado para la Red de impacto (fuente de verdad del panel). */
export class CoordinationNetworkStatusDto {
  networkStatus!: 'stable' | 'attention' | 'critical';
  globalRiskScore!: number;
  activeIncidentsCount!: number;
  coordinationsCount!: number;
  synchronizedCoordinationsCount!: number;
  lastSynchronizedAt!: string;
}
