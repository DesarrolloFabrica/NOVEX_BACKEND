import { IsEmail, IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(1)
  credential!: string;
}

export class EmailLoginDto {
  @IsEmail()
  email!: string;
}

export class AuthHealthResponseDto {
  status!: 'ok';
  module!: 'auth';
}

export class GoogleLoginResponseDto {
  accessToken!: string;
  expiresIn!: string;
  user!: AuthUserSummaryDto;
}

export class AuthUserSummaryDto {
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
  status!: string;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AuthRoleSummaryDto {
  id!: string;
  code!: string;
  name!: string;
}

export class AuthCoordinationSummaryDto {
  id!: string;
  code!: string;
  name!: string;
}

export class AuthMeResponseDto {
  user!: AuthUserSummaryDto;
  role!: AuthRoleSummaryDto;
  coordination!: AuthCoordinationSummaryDto | null;
  permissions!: {
    id: string;
    code: string;
    name: string;
    module: string;
    description: string | null;
    createdAt: Date;
  }[];
}
