import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @MaxLength(120)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @MaxLength(80)
  module!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class PermissionResponseDto {
  id!: string;
  code!: string;
  name!: string;
  module!: string;
  description!: string | null;
  createdAt!: Date;
}

export class RolePermissionsResponseDto {
  roleId!: string;
  roleCode!: string;
  permissions!: PermissionResponseDto[];
}

export class UserPermissionsResponseDto {
  userId!: string;
  roleId!: string;
  roleCode!: string;
  permissions!: PermissionResponseDto[];
}
