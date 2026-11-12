import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '../../common/enums/identity.enums';

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean = false;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  roleCode!: string;

  /** Obligatoria para COORDINADOR; el resto puede tener alcance global. */
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID()
  coordinationId?: string | null;

  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  roleCode?: string;

  /** `null` = alcance global (no permitido para COORDINADOR). */
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID()
  coordinationId?: string | null;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateOnboardingDto {
  @IsInt()
  @Type(() => Number)
  step!: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class UserResponseDto {
  id!: string;
  googleSub!: string | null;
  email!: string;
  fullName!: string;
  photoUrl!: string | null;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  coordinationId!: string | null;
  coordinationCode!: string | null;
  coordinationName!: string | null;
  status!: UserStatus;
  lastLoginAt!: Date | null;
  onboardingStep!: number;
  onboardingCompleted!: boolean;
  onboardingSeenAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
