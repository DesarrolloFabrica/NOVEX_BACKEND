import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/* ---------------------------------------------------------------- Roles -- */

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissionCodes!: string[];
}

export interface RoleMatrixRowDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  /** El rol Administrador no se edita desde la consola (anti-bloqueo). */
  locked: boolean;
  permissionCodes: string[];
  userCount: number;
  activeUserCount: number;
}

/* -------------------------------------------------------- Coordinaciones -- */

const COLOR = /^#[0-9a-fA-F]{6}$/;
const CODE = /^coord-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCoordinationDto {
  @IsString()
  @MaxLength(64)
  @Matches(CODE, {
    message:
      'El código debe tener la forma coord-nombre (minúsculas, números y guiones).',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  shortName!: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsString()
  @Matches(COLOR, { message: 'El color debe ser hexadecimal (#RRGGBB).' })
  color!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;
}

export class UpdateCoordinationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  shortName?: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(COLOR, { message: 'El color debe ser hexadecimal (#RRGGBB).' })
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/* ------------------------------------------------------------ Auditoría -- */

export class ListAuditLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export interface AuditLogItemDto {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogPageDto {
  items: AuditLogItemDto[];
  total: number;
  page: number;
  limit: number;
  /** Acciones y tipos de recurso presentes, para los filtros. */
  facets: { actions: string[]; resourceTypes: string[] };
}
