import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION_CODE = '23505';

/** Indica si el error de TypeORM proviene de una violación de restricción única de PostgreSQL. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      UNIQUE_VIOLATION_CODE
  );
}
