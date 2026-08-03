/**
 * Controla si los seeds de catálogo deben ejecutarse al arrancar.
 * - development: habilitado por defecto
 * - production: deshabilitado por defecto
 * - override: CATALOG_SEED_ON_BOOT=true|false
 */
export function isCatalogSeedEnabled(): boolean {
  const flag = process.env.CATALOG_SEED_ON_BOOT?.trim().toLowerCase();
  if (flag === 'true') {
    return true;
  }
  if (flag === 'false') {
    return false;
  }
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}
