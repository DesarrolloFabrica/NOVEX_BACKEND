import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
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

export class UserResponseDto {
  id!: string;
  googleSub!: string | null;
  email!: string;
  fullName!: string;
  photoUrl!: string | null;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  status!: UserStatus;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
