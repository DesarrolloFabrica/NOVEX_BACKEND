import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
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

  @IsUUID()
  coordinationId!: string;

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

  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
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
  createdAt!: Date;
  updatedAt!: Date;
}
