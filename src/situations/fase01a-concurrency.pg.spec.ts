import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { openDisposableDataSource } from '../../test/support/disposable-database.guard';
import { AIOrchestrator } from '../ai-orchestration/ai-orchestrator.service';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { UserStatus } from '../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineRepository } from '../situation-timeline/repositories/situation-timeline.repository';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { SituationTimelineSubscriber } from '../situation-timeline/subscribers/situation-timeline.subscriber';
import { User } from '../users/entities/user.entity';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationResolution } from './entities/situation-resolution.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SeverityEscalationService } from './severity-escalation/severity-escalation.service';
import { SituationsService } from './situations.service';

/**
 * FASE 01A contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1).
 *
 * SOLO en una base LOCAL, DESECHABLE, migrada y marcada: la guarda central
 * (test/support/disposable-database.guard.ts) aborta antes de cualquier SQL si
 * falta la autorización, el destino declarado no coincide o la base no lleva
 * la marca de desechable. Procedimiento en CLAUDE.md.
 *
 * Qué demuestra que las pruebas con mocks no pueden:
 *   F-01  El PATCH ESPERA el bloqueo de fila y decide sobre el estado vigente:
 *         no revierte un cierre ni borra marcas SLA o de análisis escritas
 *         mientras esperaba.
 *   M1    El análisis IA no se confirma si el caso se cierra mientras corre
 *         Gemini, y el reclamo no se toma sobre un caso cerrado (SQL real con
 *         el enum de estados).
 *   N1    La reasignación por PATCH se rechaza sin tocar la base.
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const COORD_A = '7d000000-0000-4000-8000-0000000000a1';
const COORD_B = '7d000000-0000-4000-8000-0000000000b1';
const CAT = '7d000000-0000-4000-8000-0000000000c1';
const ROLE = '7d000000-0000-4000-8000-0000000000d1';
const U_COORD_A = '7d000000-0000-4000-8000-0000000000e1';
const U_ANALYST = '7d000000-0000-4000-8000-0000000000e2';

const coordinatorA: AuthPayload = {
  sub: U_COORD_A,
  email: 'it-01a-coord@test.novex.invalid',
  roleId: ROLE,
  roleCode: 'COORDINADOR',
  coordinationId: COORD_A,
  permissions: [
    'SITUATIONS_VIEW',
    'SITUATIONS_CREATE',
    'SITUATIONS_UPDATE',
    'SITUATIONS_CLOSE',
    'AI_ANALYZE',
  ],
  status: UserStatus.ACTIVE,
};

const analyst: AuthPayload = {
  ...coordinatorA,
  sub: U_ANALYST,
  email: 'it-01a-analyst@test.novex.invalid',
  roleCode: 'ANALISTA',
  coordinationId: null,
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Envuelve una promesa para saber si ya terminó sin esperarla. */
function track<T>(promise: Promise<T>) {
  const state = { settled: false };
  const tracked = promise.then(
    (value) => {
      state.settled = true;
      return value;
    },
    (error: unknown) => {
      state.settled = true;
      throw error;
    },
  );
  // Evita avisos de rechazo no manejado mientras la prueba espera.
  tracked.catch(() => undefined);
  return { state, tracked };
}

suite('Fase 01A · concurrencia contra PostgreSQL real', () => {
  let ds: DataSource;
  let situations: SituationsService;

  beforeAll(async () => {
    // Guarda central: bandera explícita, destino declarado y marca de base
    // desechable, comprobados ANTES de cualquier SQL (ver test/support).
    ds = await openDisposableDataSource('fase01a-concurrency.pg.spec.ts', {
      entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    });

    await cleanup();
    await ds.query(
      `INSERT INTO roles (id, code, name) VALUES ($1, 'it-01a-role', 'IT 01A')`,
      [ROLE],
    );
    await ds.query(
      `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
       VALUES ($1, 'it-01a-a', 'IT 01A A', 'A', '#000000', 'x', 'x'),
              ($2, 'it-01a-b', 'IT 01A B', 'B', '#000000', 'x', 'x')`,
      [COORD_A, COORD_B],
    );
    await ds.query(
      `INSERT INTO incident_categories (id, code, name, is_selectable, icon)
       VALUES ($1, 'IT_01A', 'IT 01A', true, 'apps')`,
      [CAT],
    );
    await ds.query(
      `INSERT INTO users (id, email, full_name, role_id, coordination_id)
       VALUES ($1, 'it-01a-coord@test.novex.invalid', 'IT Coordinador A', $3, $4),
              ($2, 'it-01a-analyst@test.novex.invalid', 'IT Analista', $3, NULL)`,
      [U_COORD_A, U_ANALYST, ROLE, COORD_A],
    );

    const timelineService = new SituationTimelineService(
      new SituationTimelineRepository(ds),
      ds.getRepository(Situation),
    );
    new SituationTimelineSubscriber(ds, timelineService);
    // Auditoría REAL (Fase 01B.1): las acciones críticas la escriben dentro
    // de su transacción; audit_logs es inmutable y queda en la base desechable.
    const audit = new AuditLogService(ds.getRepository(AuditLog), {
      getRequestId: () => null,
    } as never);
    const escalation = new SeverityEscalationService(
      [],
      timelineService,
      audit,
    );
    situations = new SituationsService(
      new SituationsRepository(ds),
      ds.getRepository(Coordination),
      ds.getRepository(IncidentCategory),
      ds.getRepository(User),
      ds.getRepository(SituationRelatedCoordination),
      ds.getRepository(SituationResolution),
      ds.getRepository(SituationSeverityChange),
      ds.getRepository(SituationConsequence),
      timelineService,
      new OperationalScopeService(),
      audit,
      escalation,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await cleanup();
      await ds.destroy();
    }
  });

  async function cleanup() {
    await ds.query(
      `DELETE FROM situations WHERE coordination_id = ANY($1::uuid[])`,
      [[COORD_A, COORD_B]],
    );
    await ds.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [U_COORD_A, U_ANALYST],
    ]);
    await ds.query(`DELETE FROM incident_categories WHERE id = $1`, [CAT]);
    await ds.query(`DELETE FROM coordinations WHERE id = ANY($1::uuid[])`, [
      [COORD_A, COORD_B],
    ]);
    await ds.query(`DELETE FROM roles WHERE id = $1`, [ROLE]);
  }

  const createInternal = (by: AuthPayload = coordinatorA) =>
    situations.create(
      {
        title: 'IT 01A',
        description: 'Problema de prueba',
        reportKind: SituationReportKind.INTERNAL,
        coordinationId: COORD_A,
        categoryId: CAT,
        severity: SituationSeverity.HIGH,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      by,
    );

  const readRow = async (id: string) => {
    const [row] = await ds.query<
      Array<{
        status: string;
        title: string;
        closed_at: Date | null;
        sla_breached_at: Date | null;
        analysis_claim_token: string | null;
        coordination_id: string;
      }>
    >(
      `SELECT status, title, closed_at, sla_breached_at, analysis_claim_token, coordination_id
         FROM situations WHERE id = $1`,
      [id],
    );
    return row;
  };

  /** Abre una transacción que retiene la fila con FOR UPDATE. */
  async function holdRowLock(id: string) {
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SELECT id FROM situations WHERE id = $1 FOR UPDATE`, [
      id,
    ]);
    return runner;
  }

  describe('F-01 · el PATCH espera el bloqueo y decide sobre el estado vigente', () => {
    it('un cierre confirmado mientras el PATCH esperaba NO se revierte (409)', async () => {
      const created = await createInternal();
      const holder = await holdRowLock(created.id);

      const patch = track(
        situations.update(created.id, { title: 'Editado' }, coordinatorA),
      );
      await sleep(400);
      // Prueba de que el PATCH espera el bloqueo (antes leía sin bloquear).
      expect(patch.state.settled).toBe(false);

      // Cierre concurrente (lo mismo que escribe la resolución).
      await holder.query(
        `UPDATE situations SET status = 'CLOSED', closed_at = now(), resolved_at = now() WHERE id = $1`,
        [created.id],
      );
      await holder.query(
        `INSERT INTO situation_resolutions (situation_id, learning, resolved_by_user_id)
         VALUES ($1, 'Aprendizaje concurrente', $2)`,
        [created.id, U_COORD_A],
      );
      await holder.commitTransaction();
      await holder.release();

      const error = await patch.tracked.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);

      const row = await readRow(created.id);
      expect(row.status).toBe(SituationStatus.CLOSED);
      expect(row.closed_at).not.toBeNull();
      expect(row.title).toBe('IT 01A');
    });

    it('conserva sla_breached_at y el reclamo IA escritos mientras esperaba', async () => {
      const created = await createInternal();
      const holder = await holdRowLock(created.id);
      const claim = randomUUID();

      const patch = track(
        situations.update(created.id, { title: 'Editado' }, coordinatorA),
      );
      await sleep(400);
      expect(patch.state.settled).toBe(false);

      await holder.query(
        `UPDATE situations
            SET sla_breached_at = now(),
                analysis_claim_token = $2,
                analysis_claim_expires_at = now() + interval '1 minute'
          WHERE id = $1`,
        [created.id, claim],
      );
      await holder.commitTransaction();
      await holder.release();

      await patch.tracked;
      const row = await readRow(created.id);
      expect(row.title).toBe('Editado');
      expect(row.sla_breached_at).not.toBeNull();
      expect(row.analysis_claim_token).toBe(claim);
      expect(row.status).toBe(SituationStatus.OPEN);
    });

    it('avance y resolución en paralelo: el caso SIEMPRE termina cerrado', async () => {
      for (let round = 0; round < 8; round += 1) {
        const created = await createInternal();

        const results = await Promise.allSettled([
          situations.update(
            created.id,
            { status: SituationStatus.IN_PROGRESS },
            coordinatorA,
          ),
          situations.resolve(
            created.id,
            { learning: `Aprendizaje ${round}` },
            coordinatorA,
          ),
        ]);

        const [advance, resolution] = results;
        expect(resolution.status).toBe('fulfilled');
        if (advance.status === 'rejected') {
          // Llegó tarde: vio el cierre bajo bloqueo.
          expect(advance.reason).toBeInstanceOf(ConflictException);
        }

        const row = await readRow(created.id);
        expect(row.status).toBe(SituationStatus.CLOSED);
        expect(row.closed_at).not.toBeNull();
        const [{ total }] = await ds.query<Array<{ total: string }>>(
          `SELECT count(*) AS total FROM situation_resolutions WHERE situation_id = $1`,
          [created.id],
        );
        expect(Number(total)).toBe(1);
      }
    });
  });

  describe('N1 · la reasignación por PATCH se rechaza sin tocar la base', () => {
    it('el autor ANALISTA no traslada la coordinación responsable', async () => {
      const created = await createInternal(analyst);

      const error = await situations
        .update(created.id, { coordinationId: COORD_B }, analyst)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ForbiddenException);
      const row = await readRow(created.id);
      expect(row.coordination_id).toBe(COORD_A);
    });
  });

  describe('M1 · análisis IA frente a un cierre', () => {
    function buildOrchestrator(duringGemini: () => Promise<void>) {
      const persistAnalysis = jest.fn().mockResolvedValue({});
      // Sesión REAL dentro de la transacción de confirmación: el registro
      // vigente la referencia por clave foránea.
      const createSession = jest.fn(
        async (
          input: { situationId: string },
          manager: { query: DataSource['query'] },
        ) => {
          const id = randomUUID();
          await manager.query(
            `INSERT INTO situation_analysis_sessions
               (id, situation_id, version, provider, model, prompt_version,
                analysis_result, prompt_snapshot, execution_time_ms, token_estimate)
             VALUES ($1, $2, 1, 'gemini', 'gemini-test', 'v2', '{}', '(prueba)', 1, 1)`,
            [id, input.situationId],
          );
          return { id, version: 1, provider: 'gemini', createdAt: new Date() };
        },
      );
      const orchestrator = new AIOrchestrator(
        { get: jest.fn().mockReturnValue('gemini-test') } as never,
        ds,
        { exist: jest.fn().mockResolvedValue(true) } as never,
        {} as never,
        {
          buildForSituation: jest.fn().mockResolvedValue({
            context: {},
            prompt: { templateVersion: 'v2' },
            metrics: { estimatedTokens: 10 },
          }),
        } as never,
        {
          name: 'gemini',
          // Gemini SIMULADO: nunca se llama al real.
          executeAnalysis: jest.fn(async () => {
            await duringGemini();
            return { provider: 'gemini', confidence: { overall: 0.9 } };
          }),
        } as never,
        {
          normalizeCoordinationReferences: jest.fn().mockResolvedValue({}),
          validateAnalysis: jest.fn().mockReturnValue({
            provider: 'gemini',
            confidence: { overall: 0.9 },
          }),
          persistAnalysis,
        } as never,
        { findBySituation: jest.fn().mockResolvedValue(null) } as never,
        {
          findBySituation: jest.fn().mockResolvedValue({ items: [] }),
        } as never,
        {
          createEntry: jest.fn().mockResolvedValue({ id: 't' }),
          findBySituation: jest.fn().mockResolvedValue({ items: [] }),
        } as never,
        {
          findBySituationId: jest.fn().mockResolvedValue(null),
          create: jest.fn((value: unknown) => value),
          save: jest.fn(),
        } as never,
        {
          getLatestSession: jest.fn().mockResolvedValue(null),
          createSession,
        } as never,
        {
          record: jest.fn().mockResolvedValue(null),
          recordCritical: jest.fn().mockResolvedValue({}),
        } as never,
      );
      return { orchestrator, persistAnalysis, createSession };
    }

    it('si el caso se cierra mientras corre Gemini, no se confirma nada y se libera el reclamo', async () => {
      const created = await createInternal();
      const { orchestrator, persistAnalysis } = buildOrchestrator(async () => {
        await situations.resolve(
          created.id,
          { learning: 'Cerrado durante el análisis' },
          coordinatorA,
        );
      });

      const error = await orchestrator
        .execute(created.id, analyst)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SITUATION_CLOSED',
      });
      expect(persistAnalysis).not.toHaveBeenCalled();
      const row = await readRow(created.id);
      expect(row.status).toBe(SituationStatus.CLOSED);
      expect(row.analysis_claim_token).toBeNull();
    });

    it('no toma el reclamo de un caso ya cerrado (SQL real con el enum de estados)', async () => {
      const created = await createInternal();
      await situations.resolve(
        created.id,
        { learning: 'Cerrado antes' },
        coordinatorA,
      );
      const { orchestrator, persistAnalysis } = buildOrchestrator(() =>
        Promise.resolve(),
      );

      const error = await orchestrator
        .execute(created.id, analyst)
        .catch((caught: unknown) => caught);

      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SITUATION_CLOSED',
      });
      expect(persistAnalysis).not.toHaveBeenCalled();
      expect((await readRow(created.id)).analysis_claim_token).toBeNull();
    });

    it('con el caso activo, el análisis se confirma bajo el reclamo', async () => {
      const created = await createInternal();
      const { orchestrator, persistAnalysis, createSession } =
        buildOrchestrator(() => Promise.resolve());

      await orchestrator.execute(created.id, analyst);

      expect(persistAnalysis).toHaveBeenCalledTimes(1);
      expect(createSession).toHaveBeenCalledTimes(1);
      expect((await readRow(created.id)).analysis_claim_token).toBeNull();
    });
  });
});
