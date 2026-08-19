import {
  applyResolvedDatabaseEnv,
  resolveDatabaseEnv,
} from './resolve-database-env';

/**
 * Configuración tipada de la aplicación.
 * Se carga vía @nestjs/config y se consume con ConfigService.
 */
const configuration = () => {
  const database = resolveDatabaseEnv(process.env);
  applyResolvedDatabaseEnv(database);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    database: {
      profile: database.profile,
      host: database.host,
      port: database.port,
      username: database.username,
      password: database.password,
      name: database.database,
      ssl: database.ssl,
      /** Obsoleto: el esquema se administra solo con migraciones. */
      synchronize: false,
      logging: (process.env.DB_LOGGING ?? 'false') === 'true',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
      timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS ?? '60000', 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? '',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    },
    /** Solo desarrollo local: login por correo sin OAuth. En deploy debe ser false. */
    enableEmailLogin: (process.env.ENABLE_EMAIL_LOGIN ?? 'false') === 'true',
    /**
     * Logs JSON por request HTTP (http_request_completed / http_request_failed).
     * Por defecto: desactivado en desarrollo, activado en producción (Cloud Logging).
     */
    httpRequestLogging:
      process.env.HTTP_REQUEST_LOGGING !== undefined
        ? process.env.HTTP_REQUEST_LOGGING === 'true'
        : (process.env.NODE_ENV ?? 'development') === 'production',
  };
};

export type AppConfiguration = ReturnType<typeof configuration>;

export default configuration;
