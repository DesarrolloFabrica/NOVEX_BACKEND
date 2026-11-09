import { isCloudDatabaseEnv } from './resolve-database-env';

/**
 * Controla si los seeds de catálogo deben ejecutarse al arrancar.
 * - development: habilitado por defecto
 * - production: deshabilitado por defecto
 * - override: CATALOG_SEED_ON_BOOT=true|false
 *
 * NUNCA contra Cloud SQL sin confirmación explícita. Estos seeds resincronizan
 * permisos de rol (incluidas revocaciones) y borran eventos de demostración.
 * Antes solo miraban `NODE_ENV`, así que arrancar en local con `DB_CLOUD=true`
 * (camino que el propio repositorio sugería) los ejecutaba sobre producción.
 * Contra la nube solo corren con `ALLOW_CLOUD_SEED=true`; los cambios RBAC de
 * producción van por migración.
 */
export function isCatalogSeedEnabled(): boolean {
  if (isCloudDatabaseEnv() && process.env.ALLOW_CLOUD_SEED !== 'true') {
    return false;
  }

  const flag = process.env.CATALOG_SEED_ON_BOOT?.trim().toLowerCase();
  if (flag === 'true') {
    return true;
  }
  if (flag === 'false') {
    return false;
  }
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}
