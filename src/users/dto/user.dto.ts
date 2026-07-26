import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnsureUserDto {
  @IsString()
  @MaxLength(120)
  id!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsIn(['supervisor', 'ejecutor'])
  role!: 'supervisor' | 'ejecutor';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  selectedAreaId?: string | null;
}

export class UserResponseDto {
  id!: string;
  name!: string;
  role!: 'supervisor' | 'ejecutor';
  selectedAreaId!: string | null;
  onboardingCompleted!: boolean;
  onboardingSeenAt!: string | null;
}
