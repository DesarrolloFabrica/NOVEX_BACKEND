import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnsureDemoUserDto {
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

export class DemoUserResponseDto {
  id!: string;
  name!: string;
  role!: 'supervisor' | 'ejecutor';
  selectedAreaId!: string | null;
  onboardingCompleted!: boolean;
  onboardingSeenAt!: string | null;
}
