import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Entrada mínima de catálogo para anclar la respuesta de Gemini. */
export class AiCatalogItemDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;
}

/**
 * DTO específico para la capa de IA.
 * No transporta entidades TypeORM ni el grafo completo del evento.
 */
export class InterpretEventAiDto {
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(12)
  description!: string;

  @IsString()
  @MaxLength(32)
  sourceAreaCode!: string;

  @IsString()
  @MaxLength(180)
  sourceAreaName!: string;

  @IsDateString()
  reportedAt!: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AiCatalogItemDto)
  availableCategories!: AiCatalogItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AiCatalogItemDto)
  availableAreas!: AiCatalogItemDto[];
}
