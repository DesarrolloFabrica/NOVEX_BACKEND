import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListOperationalAreasQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeGlobal?: boolean = true;
}

export class CreateOperationalAreaDto {
  @IsString()
  @MaxLength(32)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}

export class UpdateOperationalAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}
