import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EvidenceType } from '../../common/enums/situation-evidence.enums';

export class CreateSituationEvidenceDto {
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @ValidateIf((dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName?: string;

  @ValidateIf((dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storagePath?: string;

  @ValidateIf((dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE)
  @IsString()
  @MinLength(1)
  @MaxLength(127)
  mimeType?: string;

  @ValidateIf((dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class SituationEvidenceResponseDto {
  id!: string;
  situationId!: string;
  uploadedByUserId!: string;
  uploadedByUserName!: string;
  type!: EvidenceType;
  title!: string;
  description!: string;
  fileName!: string | null;
  storagePath!: string | null;
  mimeType!: string | null;
  fileSize!: number | null;
  createdAt!: Date;
}

export class SituationEvidencesListResponseDto {
  situationId!: string;
  items!: SituationEvidenceResponseDto[];
  total!: number;
}
