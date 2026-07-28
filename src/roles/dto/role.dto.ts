import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListRolesQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean = false;
}

export class RoleResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  isSystem!: boolean;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
