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
    username: process.env.DB_USERNAME ?? 'omega',
    password: process.env.DB_PASSWORD ?? 'omega',
    name: process.env.DB_DATABASE ?? 'omega',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  },
});

export type AppConfiguration = ReturnType<typeof configuration>;

export default configuration;
