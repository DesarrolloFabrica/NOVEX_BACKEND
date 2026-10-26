import { createHash } from 'node:crypto';
import type { CreateSituationDto } from './dto/situation.dto';

/**
 * Huella estable del contenido de un registro. Dos envíos con la misma clave
 * deben producir la misma huella; si no coincide, la clave se reutilizó con
 * otro contenido. Normaliza espacios y el orden de las coordinaciones relacionadas.
 *
 * CAMPOS DE CARTAS. `reportKind`, la coordinación afectada, el proceso, la
 * entrega pendiente y la afectación inicial también forman parte del
 * contenido: dos reportes INTER que solo difieren en ellos son registros
 * distintos. Se añaden SOLO cuando vienen en la petición (`undefined` no entra
 * en el JSON), de modo que una petición con el contrato anterior produce
 * exactamente la misma huella que en main y las claves ya persistidas en
 * producción siguen reconociéndose tras el despliegue.
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
    reportKind: dto.reportKind,
    affectedCoordinationId: dto.affectedCoordinationId,
    affectedProcess: dto.affectedProcess?.trim(),
    pendingDelivery: dto.pendingDelivery?.trim(),
    initialConsequence: dto.initialConsequence?.description?.trim(),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
