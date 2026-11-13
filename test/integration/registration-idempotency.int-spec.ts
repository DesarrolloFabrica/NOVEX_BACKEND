/**
 * Integración con PostgreSQL real: alta idempotente, reclamo de análisis con
 * lease y confirmación protegida, identidad estable de evidencias, cierre con
 * aprendizaje y reversibilidad de las migraciones de idempotencia.
 *
 * Solo se simulan los límites externos: Gemini (con cola de comportamientos),
 * el motor de prompts, la línea de tiempo y la auditoría. Alta, reclamo,
 * sesiones de análisis y cierre son reales.
 *
 * Seguridad: la suite BORRA el esquema (`DROP SCHEMA public CASCADE`) y lo
 * recrea con las migraciones. Solo corre contra una base desechable validada
 * por la guarda central (`test/support/disposable-database.guard.ts`): bandera
 * explícita, destino declarado y marca de base desechable. Procedimiento en
 * CLAUDE.md.
 *
 * Contrato vigente (actualizado en la Fase 01A): el ALTA no analiza; el
 * análisis es una acción posterior (`execute`) bajo reclamo con lease; el
 * cierre es la resolución con aprendizaje, nunca el PATCH.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { join } from 'node:path';
import { UserStatus } from '../../src/common/enums/identity.enums';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../../src/common/enums/situation.enums';
import { isUniqueViolation } from '../../src/common/utils/database-errors';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { AIOrchestrator } from '../../src/ai-orchestration/ai-orchestrator.service';
import { SituationAIAnalysisRecordRepository } from '../../src/ai-orchestration/repositories/situation-ai-analysis-record.repository';
import type { RegisterSituationWithAnalysisResponseDto } from '../../src/ai-orchestration/dto/ai-orchestration.dto';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';
import { SituationsService } from '../../src/situations/situations.service';
import { Coordination } from '../../src/coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../src/intelligence/entities/incident-category.entity';
import { SituationConsequence } from '../../src/situations/entities/situation-consequence.entity';
import { SituationRelatedCoordination } from '../../src/situations/entities/situation-related-coordination.entity';
import { SituationResolution } from '../../src/situations/entities/situation-resolution.entity';
import { SituationSeverityChange } from '../../src/situations/entities/situation-severity-change.entity';
import type { CreateSituationDto } from '../../src/situations/dto/situation.dto';
import { User } from '../../src/users/entities/user.entity';
import { openDisposableDataSource } from '../support/disposable-database.guard';
import { AuditLogService } from '../../src/audit/audit-log.service';
import { AuditLog } from '../../src/audit/entities/audit-log.entity';

const ROOT = join(__dirname, '../..');
const KEY = '6f1c2b1e-8d2a-4c3b-9e4f-112233445566';
const OTHER_KEY = '7a2d3c4f-9e5b-4d4c-8f50-223344556677';
const INDEX_NAME = 'uq_situations_creator_client_request';
const EVIDENCE_INDEX_NAME = 'uq_situation_evidences_client_key';
/** Primera migración del bloque de idempotencia que la prueba revierte. */
const HARDEN_HISTORY_MIGRATION = 'HardenSituationHistory1788700000000';
const FIRST_IDEMPOTENCY_MIGRATION =
  'CreateSituationClientRequestUniqueIndex1787200000001';

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type ProviderBehavior = () => Promise<unknown>;

describe('Alta idempotente y reclamo de análisis con PostgreSQL real', () => {
  let ds: DataSource;
  let coordinationId: string;
  let otherCoordinationId: string;
  let categoryId: string;
  let creatorId: string;
  let analystId: string;
  let actor: AuthPayload;
  let analyst: AuthPayload;

  /** Cola de comportamientos del proveedor Gemini; cada llamada consume uno. */
  let providerQueue: ProviderBehavior[] = [];
  let providerCalls = 0;

  const okAnalysis = { provider: 'gemini', confidence: { overall: 0.9 } };
  const defaultProviderCall: ProviderBehavior = () =>
    delay(50).then(() => okAnalysis);

  const dto: CreateSituationDto = {
    title: 'Caída de red',
    description: 'Sin conexión en piso 3',
    reportKind: SituationReportKind.INTERNAL,
    categoryId: '',
    severity: SituationSeverity.MEDIUM,
    occurredAt: '2026-01-15',
  };

  function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return ds.query(sql, params);
  }

  async function countByKey(key: string): Promise<number> {
    const rows = await query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM situations WHERE client_request_id = $1',
      [key],
    );
    return rows[0].total;
  }

  async function sessionCount(situationId: string): Promise<number> {
    const rows = await query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM situation_analysis_sessions WHERE situation_id = $1',
      [situationId],
    );
    return rows[0].total;
  }

  async function claimOf(situationId: string): Promise<string | null> {
    const [row] = await query<{ analysis_claim_token: string | null }>(
      'SELECT analysis_claim_token FROM situations WHERE id = $1',
      [situationId],
    );
    return row.analysis_claim_token;
  }

  async function waitForClaim(situationId: string): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      if (await claimOf(situationId)) return;
      await delay(20);
    }
    throw new Error('El intento no llegó a tomar el reclamo.');
  }

  async function expireClaim(situationId: string): Promise<void> {
    await query(
      `UPDATE situations SET analysis_claim_expires_at = now() - interval '1 second'
        WHERE id = $1`,
      [situationId],
    );
  }

  function buildOrchestrator() {
    // Auditoría REAL (Fase 01B.1): obligatoria y en la transacción de cada
    // acción crítica; audit_logs es inmutable.
    const audit = new AuditLogService(ds.getRepository(AuditLog), {
      getRequestId: () => null,
    } as never);
    const situationsRepository = new SituationsRepository(ds);
    const situationsService = new SituationsService(
      situationsRepository,
      ds.getRepository(Coordination),
      ds.getRepository(IncidentCategory),
      ds.getRepository(User),
      ds.getRepository(SituationRelatedCoordination),
      ds.getRepository(SituationResolution),
      ds.getRepository(SituationSeverityChange),
      ds.getRepository(SituationConsequence),
      { createEntry: () => Promise.resolve({}) } as never,
      new OperationalScopeService(),
      audit,
      // Sin política de escalamiento (estado productivo actual).
      {
        materializeDueEscalations: () => Promise.resolve([]),
        recordAudit: () => Promise.resolve(undefined),
      } as never,
    );

    const orchestrator = new AIOrchestrator(
      { get: () => 'gemini-test' } as never,
      ds,
      situationsRepository,
      situationsService,
      {
        buildForSituation: () =>
          Promise.resolve({
            context: {},
            prompt: {
              templateVersion: 'v1',
              systemPrompt: 's',
              userPrompt: 'u',
            },
            metrics: { estimatedTokens: 1 },
          }),
      } as never,
      {
        name: 'gemini',
        // Gemini SIMULADO: nunca se llama al real.
        executeAnalysis: () => {
          providerCalls += 1;
          const next = providerQueue.shift() ?? defaultProviderCall;
          return next();
        },
      } as never,
      {
        normalizeCoordinationReferences: (analysis: unknown) =>
          Promise.resolve(analysis),
        validateAnalysis: (analysis: unknown) => analysis,
        persistAnalysis: () => Promise.resolve(undefined),
      } as never,
      { findBySituation: () => Promise.resolve({}) } as never,
      { findBySituation: () => Promise.resolve({ items: [] }) } as never,
      {
        createEntry: () => Promise.resolve({}),
        findBySituation: () => Promise.resolve({ items: [] }),
      } as never,
      new SituationAIAnalysisRecordRepository(ds),
      {
        getLatestSession: async (situationId: string) => {
          const [row] = await query<{ version: number; created_at: Date }>(
            `SELECT version, created_at FROM situation_analysis_sessions
              WHERE situation_id = $1 ORDER BY version DESC LIMIT 1`,
            [situationId],
          );
          return row
            ? { version: row.version, createdAt: row.created_at }
            : null;
        },
        createSession: async (
          input: {
            situationId: string;
            provider: string;
            model: string;
            promptVersion: string;
            analysisResult: unknown;
            executionTimeMs: number;
            tokenEstimate: number;
          },
          manager: {
            query: (sql: string, params: unknown[]) => Promise<unknown>;
          },
        ) => {
          const rows = (await manager.query(
            `INSERT INTO situation_analysis_sessions
               (situation_id, version, provider, model, prompt_version,
                analysis_result, prompt_snapshot, execution_time_ms, token_estimate)
             VALUES ($1,
               (SELECT COALESCE(MAX(version), 0) + 1 FROM situation_analysis_sessions WHERE situation_id = $1),
               $2, $3, $4, $5::jsonb, 'snapshot', $6, $7)
             RETURNING id, version, provider, created_at`,
            [
              input.situationId,
              input.provider,
              input.model,
              input.promptVersion,
              JSON.stringify(input.analysisResult),
              input.executionTimeMs,
              input.tokenEstimate,
            ],
          )) as Array<{
            id: string;
            version: number;
            provider: string;
            created_at: Date;
          }>;
          const row = rows[0];
          return {
            id: row.id,
            version: row.version,
            provider: row.provider,
            createdAt: row.created_at,
          };
        },
      } as never,
      audit,
    );

    return { orchestrator, situationsService };
  }

  /** Un problema registrado por el coordinador, sin análisis (como en producción). */
  async function registerSituation(key: string = OTHER_KEY): Promise<string> {
    const { orchestrator } = buildOrchestrator();
    const created = await orchestrator.registerAndExecute(
      { ...dto, title: `Caso ${key.slice(0, 8)} ${Date.now()}` },
      actor,
      key,
    );
    return created.situation.id;
  }

  beforeAll(async () => {
    // Guarda central ANTES de cualquier SQL; después, esquema limpio.
    ds = await openDisposableDataSource('registration-idempotency', {
      synchronize: false,
      entities: [join(ROOT, 'src/**/*.entity.ts')],
      migrations: [join(ROOT, 'src/database/migrations/*.ts')],
      migrationsTableName: 'typeorm_migrations',
      migrationsRun: false,
      migrationsTransactionMode: 'each',
    });

    await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
    await ds.query('CREATE SCHEMA public');
    // Restaura el privilegio por defecto del esquema public (PostgreSQL 15+:
    // USAGE para PUBLIC), como en una base recién creada.
    await ds.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
    await ds.runMigrations();

    const suffix = Date.now().toString(36);
    const [role] = await query<{ id: string }>(
      'INSERT INTO roles (code, name) VALUES ($1, $2) RETURNING id',
      [`TEST_ROLE_${suffix}`, 'Rol de prueba'],
    );
    const [coordination] = await query<{ id: string }>(
      `INSERT INTO coordinations (code, name, short_name, color, icon, image_asset, display_order, is_active)
       VALUES ($1, 'Coordinación de prueba', 'Prueba', '#000000', 'apps', 'test.png', 1, true)
       RETURNING id`,
      [`TEST_COORD_${suffix}`],
    );
    const [otherCoordination] = await query<{ id: string }>(
      `INSERT INTO coordinations (code, name, short_name, color, icon, image_asset, display_order, is_active)
       VALUES ($1, 'Otra coordinación', 'Otra', '#000000', 'apps', 'test.png', 2, true)
       RETURNING id`,
      [`TEST_COORD2_${suffix}`],
    );
    const [category] = await query<{ id: string }>(
      'INSERT INTO incident_categories (code, name) VALUES ($1, $2) RETURNING id',
      [`TEST_CAT_${suffix}`, 'Categoría de prueba'],
    );
    const email = `coord.${suffix}@test.novex.invalid`;
    const [creator] = await query<{ id: string }>(
      `INSERT INTO users (email, full_name, role_id, coordination_id, status)
       VALUES ($1, 'Coordinador de prueba', $2, $3, 'ACTIVE')
       RETURNING id`,
      [email, role.id, coordination.id],
    );
    const analystEmail = `analyst.${suffix}@test.novex.invalid`;
    const [analystUser] = await query<{ id: string }>(
      `INSERT INTO users (email, full_name, role_id, coordination_id, status)
       VALUES ($1, 'Analista de prueba', $2, NULL, 'ACTIVE')
       RETURNING id`,
      [analystEmail, role.id],
    );

    coordinationId = coordination.id;
    otherCoordinationId = otherCoordination.id;
    categoryId = category.id;
    creatorId = creator.id;
    analystId = analystUser.id;
    dto.categoryId = categoryId;
    dto.coordinationId = coordinationId;

    actor = {
      sub: creatorId,
      email,
      roleId: role.id,
      roleCode: 'COORDINADOR',
      coordinationId,
      permissions: [
        'SITUATIONS_CREATE',
        'SITUATIONS_VIEW',
        'SITUATIONS_UPDATE',
        'SITUATIONS_CLOSE',
        'AI_ANALYZE',
      ],
      status: UserStatus.ACTIVE,
    };
    analyst = {
      sub: analystId,
      email: analystEmail,
      roleId: role.id,
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: [
        'SITUATIONS_VIEW',
        'SITUATIONS_CREATE',
        'SITUATIONS_UPDATE',
        'SITUATIONS_CLOSE',
        'AI_ANALYZE',
      ],
      status: UserStatus.ACTIVE,
    };
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  beforeEach(async () => {
    providerQueue = [];
    providerCalls = 0;
    await ds.query('DELETE FROM situations WHERE created_by_user_id = $1', [
      creatorId,
    ]);
  });

  describe('índice único e inserciones', () => {
    it('el índice rechaza la segunda inserción con la misma clave y la detecta como unicidad', async () => {
      const insert = () =>
        ds.query(
          `INSERT INTO situations (title, description, coordination_id, created_by_user_id,
             category_id, severity, status, occurred_at, client_request_id, request_fingerprint)
           VALUES ('t', 'd', $1, $2, $3, 'MEDIUM', 'OPEN', now(), $4, 'h')`,
          [coordinationId, creatorId, categoryId, KEY],
        );

      const results = await Promise.allSettled([insert(), insert()]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(QueryFailedError);
      expect(isUniqueViolation(rejected[0].reason)).toBe(true);
      expect(await countByKey(KEY)).toBe(1);
    });

    it('filas sin clave (históricas) no se ven afectadas por el índice parcial', async () => {
      const insertWithoutKey = () =>
        ds.query(
          `INSERT INTO situations (title, description, coordination_id, created_by_user_id,
             category_id, severity, status, occurred_at)
           VALUES ('t', 'd', $1, $2, $3, 'MEDIUM', 'OPEN', now())`,
          [coordinationId, creatorId, categoryId],
        );

      await insertWithoutKey();
      await insertWithoutKey();

      const rows = await query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM situations WHERE created_by_user_id = $1 AND client_request_id IS NULL',
        [creatorId],
      );
      expect(rows[0].total).toBe(2);
    });
  });

  describe('alta idempotente (el alta no analiza)', () => {
    it('dos solicitudes simultáneas con la misma clave crean una sola situación', async () => {
      const { orchestrator } = buildOrchestrator();

      const outcomes: PromiseSettledResult<RegisterSituationWithAnalysisResponseDto>[] =
        await Promise.allSettled([
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
        ]);

      expect(await countByKey(KEY)).toBe(1);
      const fulfilled = outcomes.filter(
        (
          o,
        ): o is PromiseFulfilledResult<RegisterSituationWithAnalysisResponseDto> =>
          o.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (o): o is PromiseRejectedResult => o.status === 'rejected',
      );

      expect(fulfilled.filter((o) => o.value.replayed === false)).toHaveLength(
        1,
      );
      for (const failure of rejected) {
        expect(failure.reason).toBeInstanceOf(ConflictException);
        expect(
          (failure.reason as ConflictException).getResponse(),
        ).toMatchObject({ code: 'REGISTRATION_IN_PROGRESS' });
      }
      expect(providerCalls).toBe(0);
    });

    it('diez solicitudes simultáneas con la misma clave producen exactamente un registro', async () => {
      const { orchestrator } = buildOrchestrator();

      await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
        ),
      );

      expect(await countByKey(KEY)).toBe(1);
      expect(providerCalls).toBe(0);
    });

    it('el alta nunca llama a Gemini: registra aunque el proveedor esté caído', async () => {
      const { orchestrator } = buildOrchestrator();
      providerQueue = [() => Promise.reject(new Error('Gemini caído'))];

      const created = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      expect(created.replayed).toBe(false);
      expect(created.analysis).toBeNull();
      expect(await countByKey(KEY)).toBe(1);
      expect(await sessionCount(created.situation.id)).toBe(0);
      expect(providerCalls).toBe(0);
    });

    it('repetición después de completar: replay sin escritura', async () => {
      const { orchestrator } = buildOrchestrator();
      const first = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );
      expect(first.replayed).toBe(false);

      const again = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      expect(again.replayed).toBe(true);
      expect(again.situation.id).toBe(first.situation.id);
      expect(await countByKey(KEY)).toBe(1);
    });

    it('repetición tras cambio de estado: el registro original conserva su estado y no se reabre', async () => {
      const { orchestrator } = buildOrchestrator();
      const first = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      await query(
        `UPDATE situations SET status = 'IN_PROGRESS', assigned_user_id = $2 WHERE id = $1`,
        [first.situation.id, creatorId],
      );
      const [before] = await query<{ status: string; updated_at: Date }>(
        'SELECT status, updated_at FROM situations WHERE id = $1',
        [first.situation.id],
      );

      const again = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      const [after] = await query<{ status: string; updated_at: Date }>(
        'SELECT status, updated_at FROM situations WHERE id = $1',
        [first.situation.id],
      );
      expect(again.replayed).toBe(true);
      expect(again.situation.status).toBe('IN_PROGRESS');
      expect(after.status).toBe('IN_PROGRESS');
      expect(new Date(after.updated_at).getTime()).toBe(
        new Date(before.updated_at).getTime(),
      );
    });

    it('misma clave con otro contenido responde 422 y no crea registros', async () => {
      const { orchestrator } = buildOrchestrator();
      await orchestrator.registerAndExecute({ ...dto }, actor, KEY);

      await expect(
        orchestrator.registerAndExecute(
          { ...dto, title: 'Otro incidente' },
          actor,
          KEY,
        ),
      ).rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_KEY_REUSED' },
      });
      expect(await countByKey(KEY)).toBe(1);
    });

    it('claves distintas del mismo usuario son intentos independientes', async () => {
      const { orchestrator } = buildOrchestrator();

      await orchestrator.registerAndExecute({ ...dto }, actor, KEY);
      await orchestrator.registerAndExecute({ ...dto }, actor, OTHER_KEY);

      expect(await countByKey(KEY)).toBe(1);
      expect(await countByKey(OTHER_KEY)).toBe(1);
    });
  });

  describe('análisis bajo demanda: reclamo con lease y confirmación protegida', () => {
    it('confirma una sesión y libera el reclamo', async () => {
      const id = await registerSituation();
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.execute(id, actor);

      expect(result.analysisVersion).toBe(1);
      expect(await sessionCount(id)).toBe(1);
      expect(await claimOf(id)).toBeNull();
    });

    it('dos análisis simultáneos: uno confirma y el otro recibe 409 ANALYSIS_IN_PROGRESS', async () => {
      const id = await registerSituation();
      const { orchestrator } = buildOrchestrator();

      const outcomes = await Promise.allSettled([
        orchestrator.execute(id, actor),
        orchestrator.execute(id, actor),
      ]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find(
        (o): o is PromiseRejectedResult => o.status === 'rejected',
      );
      expect(
        (rejected?.reason as ConflictException).getResponse(),
      ).toMatchObject({ code: 'ANALYSIS_IN_PROGRESS' });
      expect(await sessionCount(id)).toBe(1);
    });

    it('con un reclamo vigente de otro intento responde 409 sin llamar a Gemini', async () => {
      const id = await registerSituation();
      await query(
        `UPDATE situations SET analysis_claim_token = gen_random_uuid(),
                analysis_claim_expires_at = now() + interval '5 minutes'
          WHERE id = $1`,
        [id],
      );
      const { orchestrator } = buildOrchestrator();

      await expect(orchestrator.execute(id, actor)).rejects.toMatchObject({
        response: { code: 'ANALYSIS_IN_PROGRESS' },
      });
      expect(await sessionCount(id)).toBe(0);
      expect(providerCalls).toBe(0);
    });

    it('un fallo de Gemini conserva la situación y libera el reclamo', async () => {
      const id = await registerSituation();
      const { orchestrator } = buildOrchestrator();
      providerQueue = [() => Promise.reject(new Error('Gemini caído'))];

      await expect(orchestrator.execute(id, actor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(await countByKey(OTHER_KEY)).toBe(1);
      expect(await sessionCount(id)).toBe(0);
      expect(await claimOf(id)).toBeNull();
    });

    it('un reclamo vencido puede tomarse; el intento anterior no confirma después', async () => {
      const id = await registerSituation();
      const { orchestrator } = buildOrchestrator();

      // El intento A toma el reclamo pero Gemini tarda; su reclamo vence.
      let releaseA: (value: unknown) => void = () => undefined;
      const gateA = new Promise((resolve) => {
        releaseA = resolve;
      });
      providerQueue = [() => gateA.then(() => okAnalysis)];
      const attemptA = orchestrator
        .execute(id, actor)
        .catch((error: unknown) => error);

      await waitForClaim(id);
      await expireClaim(id);

      // El intento B toma el reclamo vencido, analiza y confirma.
      const attemptB = await orchestrator.execute(id, actor);
      expect(attemptB.analysisVersion).toBe(1);

      // A termina ahora: su token ya no es el vigente, no confirma.
      releaseA(undefined);
      const resultA = await attemptA;

      expect(resultA).toBeInstanceOf(ConflictException);
      expect((resultA as ConflictException).getResponse()).toMatchObject({
        code: 'ANALYSIS_CLAIM_LOST',
      });
      expect(await sessionCount(id)).toBe(1);
    });

    it('un intento antiguo que falla tarde no borra la situación ni el análisis vigente', async () => {
      const id = await registerSituation();
      const { orchestrator } = buildOrchestrator();

      let failA: (reason: Error) => void = () => undefined;
      const gateA = new Promise<unknown>((_resolve, reject) => {
        failA = reject;
      });
      providerQueue = [() => gateA];
      const attemptA = orchestrator
        .execute(id, actor)
        .catch((error: unknown) => error);

      await waitForClaim(id);
      await expireClaim(id);

      await orchestrator.execute(id, actor);

      failA(new Error('Gemini tardío'));
      await attemptA;

      expect(await countByKey(OTHER_KEY)).toBe(1);
      expect(await sessionCount(id)).toBe(1);
    });

    it('no analiza un caso cerrado: 409 SITUATION_CLOSED sin llamar a Gemini', async () => {
      const id = await registerSituation();
      const { orchestrator, situationsService } = buildOrchestrator();
      await situationsService.resolve(id, { learning: 'Cerrado' }, actor);

      await expect(orchestrator.execute(id, analyst)).rejects.toMatchObject({
        response: { code: 'SITUATION_CLOSED' },
      });
      expect(providerCalls).toBe(0);
      expect(await claimOf(id)).toBeNull();
    });
  });

  describe('evidencias con identidad estable', () => {
    it('el índice por situación y clave rechaza una segunda nota con la misma clave', async () => {
      const id = await registerSituation();
      const insert = () =>
        ds.query(
          `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description, client_key)
           VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'a', 'capture:notes')`,
          [id, creatorId],
        );

      await insert();
      await expect(insert()).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('evidencias legítimas con el mismo título coexisten cuando no comparten clave', async () => {
      const id = await registerSituation();
      await query(
        `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description)
         VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'manual del usuario')`,
        [id, creatorId],
      );
      await query(
        `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description, client_key)
         VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'nota de captura', 'capture:notes')`,
        [id, creatorId],
      );

      const [total] = await query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM situation_evidences
          WHERE situation_id = $1 AND title = 'Notas adicionales'`,
        [id],
      );
      expect(total.total).toBe(2);
    });
  });

  describe('atención y cierre con aprendizaje', () => {
    it('OPEN → IN_PROGRESS (PATCH) → CLOSED (resolución): asigna, fija cierre y guarda el aprendizaje', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerSituation(KEY);

      await situationsService.update(
        id,
        { status: SituationStatus.IN_PROGRESS },
        actor,
      );
      const closed = await situationsService.resolve(
        id,
        { learning: 'Resuelto con reinicio de switch' },
        actor,
      );

      expect(closed.status).toBe(SituationStatus.CLOSED);
      expect(closed.closedAt).not.toBeNull();
      expect(closed.resolution?.learning).toBe(
        'Resuelto con reinicio de switch',
      );
      expect(closed.lastStatusComment).toBeNull();
      expect(closed.assignedUserId).toBe(creatorId);
    });

    it('el PATCH no cierra, tampoco aportando un motivo (403)', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerSituation(KEY);
      await situationsService.update(
        id,
        { status: SituationStatus.IN_PROGRESS },
        actor,
      );

      await expect(
        situationsService.update(
          id,
          { status: SituationStatus.CLOSED, statusComment: 'motivo' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('una situación cerrada no admite modificaciones ordinarias (409)', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerSituation(KEY);
      await situationsService.resolve(id, { learning: 'motivo' }, actor);

      await expect(
        situationsService.update(
          id,
          { status: SituationStatus.IN_PROGRESS },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        situationsService.update(id, { title: 'Retoque' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('un analista que no es autor ni de Coordinación General no avanza el caso (403)', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerSituation(KEY);

      await expect(
        situationsService.update(
          id,
          { status: SituationStatus.IN_PROGRESS },
          analyst,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un coordinador de otra coordinación no puede editar el caso: 404', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerSituation(KEY);
      const outsider: AuthPayload = {
        ...actor,
        sub: analystId,
        coordinationId: otherCoordinationId,
      };

      await expect(
        situationsService.update(id, { title: 'Intrusión' }, outsider),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el cierre no altera la idempotencia del alta', async () => {
      const { orchestrator, situationsService } = buildOrchestrator();
      const created = await orchestrator.registerAndExecute(
        { ...dto, title: 'Registro cerrado' },
        actor,
        OTHER_KEY,
      );
      await situationsService.resolve(
        created.situation.id,
        { learning: 'motivo' },
        actor,
      );

      const replay = await orchestrator.registerAndExecute(
        { ...dto, title: 'Registro cerrado' },
        actor,
        OTHER_KEY,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.situation.status).toBe(SituationStatus.CLOSED);
      expect(await countByKey(OTHER_KEY)).toBe(1);
    });
  });

  describe('migraciones', () => {
    /*
     * Desde 1788700000000 (HardenSituationHistory) la reversión automática se
     * detiene ahí por diseño: revertirla quitaría las protecciones del
     * historial. Por eso ya no se puede volver hasta el bloque de idempotencia
     * (${FIRST_IDEMPOTENCY_MIGRATION}); esa reversión se probó en Fase 01A.
     * Aquí se ejercitan los down() posteriores (Fase 01B.2), la barrera y la
     * reaplicación completa.
     */
    it('los down() posteriores al historial protegido revierten y reaplican; la barrera no se cruza', async () => {
      for (let guard = 0; guard < 40; guard += 1) {
        const [last] = await query<{ name: string }>(
          'SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1',
        );
        if (last.name === HARDEN_HISTORY_MIGRATION) break;
        await ds.undoLastMigration();
      }

      const retirementColumns = await query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'situation_evidences' AND column_name = 'retired_at'`,
      );
      expect(retirementColumns).toHaveLength(0);
      const normalizationLog = await query<{ t: string | null }>(
        `SELECT to_regclass('public.legacy_resolved_normalizations')::text AS t`,
      );
      expect(normalizationLog[0].t).toBeNull();

      await expect(ds.undoLastMigration()).rejects.toThrow(/irreversible/);
      const indexesAtBarrier = await query(
        'SELECT 1 FROM pg_indexes WHERE indexname = ANY($1)',
        [[INDEX_NAME, EVIDENCE_INDEX_NAME]],
      );
      expect(indexesAtBarrier).toHaveLength(2);
      expect(FIRST_IDEMPOTENCY_MIGRATION).toBeTruthy();

      await ds.runMigrations();

      const retirementAfterRedo = await query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'situation_evidences' AND column_name = 'retired_at'`,
      );
      expect(retirementAfterRedo).toHaveLength(1);

      const indexesAfterRedo = await query(
        'SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)',
        [[INDEX_NAME, EVIDENCE_INDEX_NAME]],
      );
      expect(indexesAfterRedo).toHaveLength(2);
      const indexValidity = await query<{ indisvalid: boolean }>(
        `SELECT i.indisvalid FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
          WHERE c.relname = ANY($1)`,
        [[INDEX_NAME, EVIDENCE_INDEX_NAME]],
      );
      expect(indexValidity.every((row) => row.indisvalid)).toBe(true);
    });
  });
});
