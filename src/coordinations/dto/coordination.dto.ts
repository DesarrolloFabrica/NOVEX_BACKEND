import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListCoordinationsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean = false;
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
