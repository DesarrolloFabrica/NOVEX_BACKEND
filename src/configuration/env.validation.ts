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
import { logBootDebug } from '../common/bootstrap-observability';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  if (typeof value === 'boolean') return value;
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
  @IsOptional()
  CORS_ORIGINS?: string;

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
  GEMINI_MODEL: string = 'gemini-3-flash-preview';

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '1h';

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID!: string;

  /** true solo en local; en deploy/omitido = false (solo Google). */
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  ENABLE_EMAIL_LOGIN: boolean = false;
}

export function validateEnvironment(config: Record<string, unknown>) {
  // enableImplicitConversion convierte el string "false" en boolean true (Boolean("false")).
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuración de entorno inválida: ${errors.toString()}`);
  }

  logBootDebug('[BOOT 2] Environment validated');

  return validated;
}
