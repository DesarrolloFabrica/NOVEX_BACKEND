/**
 * Configuración tipada de la aplicación.
 * Se carga vía @nestjs/config y se consume con ConfigService.
 */
const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'novex',
    password: process.env.DB_PASSWORD ?? 'novex',
    name: process.env.DB_DATABASE ?? 'novex',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
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
});

export type AppConfiguration = ReturnType<typeof configuration>;

export default configuration;
