import type { Express } from 'express';
import type { DataSource } from 'typeorm';

type ProbeDataSource = Pick<DataSource, 'isInitialized' | 'query'>;

type Readiness = {
  ready: boolean;
  database: 'up' | 'down';
};

/**
 * Estado compartido por los probes registrados antes de cargar Nest.
 * El proceso puede abrir PORT de inmediato, pero readiness solo pasa cuando
 * Nest termino app.init() y PostgreSQL responde una consulta real.
 */
export class ProbeHealthState {
  private dataSource?: ProbeDataSource;

  markNestReady(dataSource: ProbeDataSource): void {
    this.dataSource = dataSource;
  }

  async readiness(): Promise<Readiness> {
    if (!this.dataSource?.isInitialized) {
      return { ready: false, database: 'down' };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return { ready: true, database: 'up' };
    } catch {
      return { ready: false, database: 'down' };
    }
  }
}

/**
 * Probes autoritativos del proceso. Se montan antes de importar AppModule para
 * que errores de configuracion/imports queden observables sin dar readiness.
 */
export function registerProbeHealthRoutes(
  app: Express,
  state: ProbeHealthState,
): void {
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req, res) => {
    const readiness = await state.readiness();
    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: readiness.database,
      },
    });
  });

  // Compatibilidad con el uptime check historico. Ya no se usa como startup
  // probe, pero tampoco reporta un falso positivo mientras Nest esta iniciando.
  app.get('/api/v1/auth/health', async (_req, res) => {
    const readiness = await state.readiness();
    res
      .status(readiness.ready ? 200 : 503)
      .json(
        readiness.ready
          ? { status: 'ok', module: 'auth' }
          : { status: 'starting', module: 'auth' },
      );
  });
}
