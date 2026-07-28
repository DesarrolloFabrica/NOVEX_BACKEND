import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

/**
 * Validación de variables de entorno al arranque.
 * Falla rápido si la configuración es inválida.
 */
export class EnvironmentVariables {
  @IsString()
  @IsOptional()
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_DATABASE!: string;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  DB_SYNCHRONIZE: boolean = false;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  DB_LOGGING: boolean = false;

  /** Opcional en arranque; requerida al invocar interpretación real. */
  @IsString()
  @IsOptional()
  GEMINI_API_KEY: string = '';

  @IsString()
  @IsOptional()
  GEMINI_MODEL: string = 'gemini-2.0-flash';
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuración de entorno inválida: ${errors.toString()}`);
  }

  return validated;
}
