import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { verifyDisposableDatabase } from './disposable-database.guard';

/**
 * `globalSetup` de las configuraciones e2e e integración. Se ejecuta UNA vez,
 * antes de cualquier suite y antes de que `AppModule` arranque (y escriba sus
 * semillas): si el destino no es una base desechable confirmada, aborta toda
 * la ejecución sin haber escrito nada.
 *
 * Carga `.env` igual que la aplicación (sin sobrescribir lo definido en el
 * proceso), para validar exactamente el destino que ella usaría.
 */
export default async function disposableDatabaseGlobalSetup(): Promise<void> {
  loadEnv({
    path: join(__dirname, '../../.env'),
    override: false,
    quiet: true,
  });
  await verifyDisposableDatabase('jest globalSetup');
}
