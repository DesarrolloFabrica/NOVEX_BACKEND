import type { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditResourceType } from './audit-action.enum';

/**
 * ¿Qué filas ha modificado el ADMIN desde la Consola?
 *
 * La respuesta sale del propio registro de auditoría (sin columnas nuevas): un
 * rol o coordinación con una entrada `ROLE_*` / `COORDINATION_*` fue editado a
 * mano. Los seeds de catálogo (activos en desarrollo) lo consultan para NO
 * resincronizar esas filas en cada arranque; si no, los cambios hechos desde la
 * consola se perdían al reiniciar el backend.
 */
export const ROLE_DEFINITION_ACTIONS: readonly AuditAction[] = [
  AuditAction.ROLE_UPDATED,
  AuditAction.ROLE_ACTIVATED,
  AuditAction.ROLE_DEACTIVATED,
];

export const ROLE_PERMISSION_ACTIONS: readonly AuditAction[] = [
  AuditAction.ROLE_PERMISSIONS_CHANGED,
];

export const COORDINATION_ACTIONS: readonly AuditAction[] = [
  AuditAction.COORDINATION_CREATED,
  AuditAction.COORDINATION_UPDATED,
  AuditAction.COORDINATION_ACTIVATED,
  AuditAction.COORDINATION_DEACTIVATED,
];

export async function findAdminManagedIds(
  source: DataSource | EntityManager,
  resourceType: AuditResourceType,
  actions: readonly AuditAction[],
): Promise<Set<string>> {
  const rows: Array<{ resource_id: string | null }> = await source.query(
    `SELECT DISTINCT "resource_id" FROM "audit_logs"
     WHERE "resource_type" = $1 AND "action" = ANY($2) AND "resource_id" IS NOT NULL`,
    [resourceType, [...actions]],
  );
  return new Set(
    rows.map((row) => row.resource_id).filter((id): id is string => !!id),
  );
}
