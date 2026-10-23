import { createHash } from 'node:crypto';
import type { CreateSituationDto } from './dto/situation.dto';

/**
 * Huella estable del contenido de un registro. Dos envíos con la misma clave
 * deben producir la misma huella; si no coincide, la clave se reutilizó con
 * otro contenido. Normaliza espacios y el orden de las coordinaciones relacionadas.
 */
export function computeRegistrationFingerprint(
  dto: CreateSituationDto,
): string {
  const canonical = {
    title: dto.title.trim(),
    description: dto.description.trim(),
    coordinationId: dto.coordinationId ?? null,
    categoryId: dto.categoryId,
    severity: dto.severity,
    occurredAt: dto.occurredAt,
    relatedCoordinationIds: [
      ...new Set((dto.relatedCoordinationIds ?? []).map((id) => id.trim())),
    ]
      .filter((id) => id.length > 0)
      .sort(),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
