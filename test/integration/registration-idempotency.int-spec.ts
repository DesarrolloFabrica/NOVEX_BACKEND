/**
 * Integración con PostgreSQL real. Ejercita el reclamo fenciado, la confirmación
 * transaccional, el borrado en fallo, el índice de idempotencia y el cierre.
 *
 * Solo se simulan los límites externos: Gemini (con cola de comportamientos),
 * el motor de prompts y la auditoría. La persistencia del análisis es real.
 *
 * Seguridad: se ejecuta solo contra una base cuyo nombre contenga "test" y
 * nunca carga `.env`. Variables requeridas: TEST_DB_HOST, TEST_DB_PORT,
 * TEST_DB_USER, TEST_DB_PASSWORD, TEST_DB_NAME.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { join } from 'node:path';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { SituationSeverity } from '../../src/common/enums/situation.enums';
import { isUniqueViolation } from '../../src/common/utils/database-errors';
import { computeRegistrationFingerprint } from '../../src/situations/registration-fingerprint';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { AIOrchestrator } from '../../src/ai-orchestration/ai-orchestrator.service';
import { SituationAIAnalysisRecordRepository } from '../../src/ai-orchestration/repositories/situation-ai-analysis-record.repository';
import type { RegisterSituationWithAnalysisResponseDto } from '../../src/ai-orchestration/dto/ai-orchestration.dto';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';
import { SituationsService } from '../../src/situations/situations.service';
import { Coordination } from '../../src/coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../src/intelligence/entities/incident-category.entity';
import { SituationRelatedCoordination } from '../../src/situations/entities/situation-related-coordination.entity';
import type { CreateSituationDto } from '../../src/situations/dto/situation.dto';
import { User } from '../../src/users/entities/user.entity';

const ROOT = join(__dirname, '../..');
const KEY = '6f1c2b1e-8d2a-4c3b-9e4f-112233445566';
const OTHER_KEY = '7a2d3c4f-9e5b-4d4c-8f50-223344556677';
const INDEX_NAME = 'uq_situations_creator_client_request';
const EVIDENCE_INDEX_NAME = 'uq_situation_evidences_client_key';

const fingerprintOf = (input: CreateSituationDto) =>
  computeRegistrationFingerprint(input);

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type ProviderBehavior = () => Promise<unknown>;

function requireTestDatabaseEnv() {
  const required = [
    'TEST_DB_HOST',
    'TEST_DB_PORT',
    'TEST_DB_USER',
    'TEST_DB_PASSWORD',
    'TEST_DB_NAME',
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de prueba: ${missing.join(', ')}`);
  }
  const database = process.env.TEST_DB_NAME as string;
  if (!database.toLowerCase().includes('test')) {
    throw new Error(
      `Por seguridad, TEST_DB_NAME debe contener "test". Valor recibido: ${database}`,
    );
  }
  return {
    host: process.env.TEST_DB_HOST as string,
    port: Number(process.env.TEST_DB_PORT),
    username: process.env.TEST_DB_USER as string,
    password: process.env.TEST_DB_PASSWORD as string,
    database,
  };
}

describe('Registro idempotente y reclamo de análisis con PostgreSQL real', () => {
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

  const okAnalysis = { provider: 'gemini', confidence: { overall: 0.9 } };
  const defaultProviderCall: ProviderBehavior = () =>
    delay(50).then(() => okAnalysis);

  const dto: CreateSituationDto = {
    title: 'Caída de red',
    description: 'Sin conexión en piso 3',
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

  async function situationByKey(key: string) {
    const [row] = await query<{
      id: string;
      status: string;
      analysis_claim_token: string | null;
      analysis_claim_expires_at: Date | null;
    }>(
      `SELECT id, status, analysis_claim_token, analysis_claim_expires_at
         FROM situations WHERE client_request_id = $1`,
      [key],
    );
    return row;
  }

  function buildOrchestrator() {
    const situationsRepository = new SituationsRepository(ds);
    const situationsService = new SituationsService(
      situationsRepository,
      ds.getRepository(Coordination),
      ds.getRepository(IncidentCategory),
      ds.getRepository(User),
      ds.getRepository(SituationRelatedCoordination),
      { createEntry: () => Promise.resolve({}) } as never,
      new OperationalScopeService(),
      { record: () => Promise.resolve(null) } as never,
    );

    const analysisRecordRepository = new SituationAIAnalysisRecordRepository(
      ds,
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
        executeAnalysis: () => {
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
      analysisRecordRepository,
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
        deleteBySituationId: () => Promise.resolve(undefined),
      } as never,
      { record: () => Promise.resolve(null) } as never,
    );

    return { orchestrator, situationsService, situationsRepository };
  }

  beforeAll(async () => {
    const config = requireTestDatabaseEnv();
    ds = new DataSource({
      type: 'postgres',
      ...config,
      synchronize: false,
      entities: [join(ROOT, 'src/**/*.entity.ts')],
      migrations: [join(ROOT, 'src/database/migrations/*.ts')],
      migrationsTableName: 'typeorm_migrations',
      migrationsRun: false,
      migrationsTransactionMode: 'each',
    });
    await ds.initialize();

    // Base de prueba vacía en cada ejecución: esquema limpio desde las migraciones.
    await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
    await ds.query('CREATE SCHEMA public');
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
    const email = `coord.${suffix}@cun.edu.co`;
    const [creator] = await query<{ id: string }>(
      `INSERT INTO users (email, full_name, role_id, coordination_id, status)
       VALUES ($1, 'Coordinador de prueba', $2, $3, 'ACTIVE')
       RETURNING id`,
      [email, role.id, coordination.id],
    );
    const analystEmail = `analyst.${suffix}@cun.edu.co`;
    const [analystUser] = await query<{ id: string }>(
      `INSERT INTO users (email, full_name, role_id, coordination_id, status)
       VALUES ($1, 'Analista de prueba', $2, $3, 'ACTIVE')
       RETURNING id`,
      [analystEmail, role.id, coordination.id],
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
      permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE', 'AI_ANALYZE'],
      status: UserStatus.ACTIVE,
    };
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  beforeEach(async () => {
    providerQueue = [];
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

  describe('registro con análisis', () => {
    it('dos solicitudes simultáneas con la misma clave crean una sola situación y analizan una vez', async () => {
      const { orchestrator } = buildOrchestrator();

      const outcomes: PromiseSettledResult<RegisterSituationWithAnalysisResponseDto>[] =
        await Promise.allSettled([
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
        ]);

      expect(await countByKey(KEY)).toBe(1);
      const row = await situationByKey(KEY);
      expect(await sessionCount(row.id)).toBe(1);

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
    });

    it('diez solicitudes simultáneas con la misma clave producen exactamente un registro y un análisis', async () => {
      const { orchestrator } = buildOrchestrator();

      await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          orchestrator.registerAndExecute({ ...dto }, actor, KEY),
        ),
      );

      expect(await countByKey(KEY)).toBe(1);
      const row = await situationByKey(KEY);
      expect(await sessionCount(row.id)).toBe(1);
    });

    it('repetición después de completar: replay sin análisis ni escritura', async () => {
      const { orchestrator } = buildOrchestrator();
      const first = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );
      expect(first.replayed).toBe(false);

      providerQueue = [() => Promise.reject(new Error('no debería llamarse'))];
      const again = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      expect(again.replayed).toBe(true);
      expect(again.situation.id).toBe(first.situation.id);
      expect(await sessionCount(first.situation.id)).toBe(1);
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

    it('fallo de Gemini en registro nuevo: la fila se borra y la misma clave puede registrar de nuevo', async () => {
      const { orchestrator } = buildOrchestrator();
      providerQueue = [() => Promise.reject(new Error('Gemini caído'))];

      await expect(
        orchestrator.registerAndExecute({ ...dto }, actor, KEY),
      ).rejects.toThrow('La situación no fue registrada');
      expect(await countByKey(KEY)).toBe(0);

      const retry = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );
      expect(retry.replayed).toBe(false);
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

  describe('recuperación de situaciones sin análisis', () => {
    /** Simula una instancia que murió después de insertar la fila y antes del análisis. */
    async function insertOrphan(key: string): Promise<string> {
      const { situationsService } = buildOrchestrator();
      const created = await situationsService.create({ ...dto }, actor, {
        clientRequestId: key,
        requestFingerprint: 'huella-orfana',
      });
      return created.id;
    }

    it('un reintento con la misma clave reanuda sobre la fila huérfana sin crear otra', async () => {
      const orphanId = await insertOrphan(KEY);
      const { orchestrator } = buildOrchestrator();
      // La huella del reintento debe coincidir con la almacenada.
      await query(
        'UPDATE situations SET request_fingerprint = $2 WHERE id = $1',
        [orphanId, fingerprintOf(dto)],
      );

      const result = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );

      expect(result.replayed).toBe(false);
      expect(result.situation.id).toBe(orphanId);
      expect(await countByKey(KEY)).toBe(1);
      expect(await sessionCount(orphanId)).toBe(1);
      const row = await situationByKey(KEY);
      expect(row.analysis_claim_token).toBeNull();
    });

    it('dos reintentos simultáneos sobre una huérfana ejecutan un solo análisis', async () => {
      const orphanId = await insertOrphan(KEY);
      await query(
        'UPDATE situations SET request_fingerprint = $2 WHERE id = $1',
        [orphanId, fingerprintOf(dto)],
      );
      const { orchestrator } = buildOrchestrator();

      await Promise.allSettled([
        orchestrator.registerAndExecute({ ...dto }, actor, KEY),
        orchestrator.registerAndExecute({ ...dto }, actor, KEY),
      ]);

      expect(await sessionCount(orphanId)).toBe(1);
      expect(await countByKey(KEY)).toBe(1);
    });

    it('una huérfana con reclamo vigente responde 409 sin analizar', async () => {
      const orphanId = await insertOrphan(KEY);
      await query(
        `UPDATE situations SET request_fingerprint = $2,
                analysis_claim_token = gen_random_uuid(),
                analysis_claim_expires_at = now() + interval '5 minutes'
          WHERE id = $1`,
        [orphanId, fingerprintOf(dto)],
      );
      const { orchestrator } = buildOrchestrator();

      await expect(
        orchestrator.registerAndExecute({ ...dto }, actor, KEY),
      ).rejects.toMatchObject({
        response: { code: 'REGISTRATION_IN_PROGRESS', situationId: orphanId },
      });
      expect(await sessionCount(orphanId)).toBe(0);
    });

    it('recuperación que vuelve a fallar en Gemini: conserva la fila', async () => {
      const orphanId = await insertOrphan(KEY);
      await query(
        'UPDATE situations SET request_fingerprint = $2 WHERE id = $1',
        [orphanId, fingerprintOf(dto)],
      );
      const { orchestrator } = buildOrchestrator();
      providerQueue = [() => Promise.reject(new Error('Gemini caído'))];

      await expect(
        orchestrator.registerAndExecute({ ...dto }, actor, KEY),
      ).rejects.toThrow('La situación quedó registrada');

      expect(await countByKey(KEY)).toBe(1);
      const row = await situationByKey(KEY);
      expect(row.analysis_claim_token).toBeNull();
    });

    it('un reclamo vencido puede tomarse; el intento anterior no confirma ni borra después', async () => {
      const { orchestrator } = buildOrchestrator();

      // El intento A obtiene el análisis pero Gemini tarda; su reclamo vence.
      let releaseA: (value: unknown) => void = () => undefined;
      const gateA = new Promise((resolve) => {
        releaseA = resolve;
      });
      providerQueue = [() => gateA.then(() => okAnalysis)];
      const attemptA = orchestrator
        .registerAndExecute({ ...dto }, actor, KEY)
        .catch((error: unknown) => error);

      // Espera a que A tenga el reclamo y lo vence artificialmente.
      for (let i = 0; i < 50; i += 1) {
        const row = await situationByKey(KEY);
        if (row?.analysis_claim_token) break;
        await delay(20);
      }
      await query(
        `UPDATE situations SET analysis_claim_expires_at = now() - interval '1 second'
          WHERE client_request_id = $1`,
        [KEY],
      );

      // El intento B reanuda: toma el reclamo, analiza y confirma.
      const attemptB = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );
      expect(attemptB.replayed).toBe(false);

      // A termina ahora: su token ya no es el vigente, no debe confirmar.
      releaseA(undefined);
      const resultA = await attemptA;

      expect(resultA).toBeInstanceOf(ConflictException);
      const row = await situationByKey(KEY);
      expect(row).toBeDefined();
      expect(await sessionCount(row.id)).toBe(1);
      expect(await countByKey(KEY)).toBe(1);
    });

    it('un intento antiguo que falla después de la recuperación no borra la situación recuperada', async () => {
      const { orchestrator } = buildOrchestrator();

      let failA: (reason: Error) => void = () => undefined;
      const gateA = new Promise<unknown>((_resolve, reject) => {
        failA = reject;
      });
      providerQueue = [() => gateA];
      const attemptA = orchestrator
        .registerAndExecute({ ...dto }, actor, KEY)
        .catch((error: unknown) => error);

      for (let i = 0; i < 50; i += 1) {
        const row = await situationByKey(KEY);
        if (row?.analysis_claim_token) break;
        await delay(20);
      }
      await query(
        `UPDATE situations SET analysis_claim_expires_at = now() - interval '1 second'
          WHERE client_request_id = $1`,
        [KEY],
      );

      const recovered = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        KEY,
      );
      expect(recovered.replayed).toBe(false);

      // A falla tarde. Su borrado debe quedar sin efecto porque ya no posee el token.
      failA(new Error('Gemini tardío'));
      await attemptA;

      expect(await countByKey(KEY)).toBe(1);
      const row = await situationByKey(KEY);
      expect(await sessionCount(row.id)).toBe(1);
    });
  });

  describe('evidencias con identidad estable', () => {
    it('el índice por situación y clave rechaza una segunda nota con la misma clave', async () => {
      const { orchestrator } = buildOrchestrator();
      const created = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        OTHER_KEY,
      );
      const insert = () =>
        ds.query(
          `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description, client_key)
           VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'a', 'capture:notes')`,
          [created.situation.id, creatorId],
        );

      await insert();
      await expect(insert()).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('evidencias legítimas con el mismo título coexisten cuando no comparten clave', async () => {
      const { orchestrator } = buildOrchestrator();
      const created = await orchestrator.registerAndExecute(
        { ...dto },
        actor,
        OTHER_KEY,
      );
      await query(
        `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description)
         VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'manual del usuario')`,
        [created.situation.id, creatorId],
      );
      await query(
        `INSERT INTO situation_evidences (situation_id, uploaded_by_user_id, type, title, description, client_key)
         VALUES ($1, $2, 'NOTE', 'Notas adicionales', 'nota de captura', 'capture:notes')`,
        [created.situation.id, creatorId],
      );

      const [total] = await query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM situation_evidences
          WHERE situation_id = $1 AND title = 'Notas adicionales'`,
        [created.situation.id],
      );
      expect(total.total).toBe(2);
    });
  });

  describe('cierre de situaciones', () => {
    async function registerForClosure(): Promise<string> {
      const { orchestrator } = buildOrchestrator();
      const created = await orchestrator.registerAndExecute(
        { ...dto, title: `Cierre ${Date.now()}` },
        actor,
        KEY,
      );
      return created.situation.id;
    }

    it('OPEN → IN_PROGRESS → CLOSED con motivo, asigna responsable y fija cierre', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();

      await situationsService.update(
        id,
        { status: 'IN_PROGRESS' as never },
        actor,
      );
      const closed = await situationsService.update(
        id,
        {
          status: 'CLOSED' as never,
          statusComment: 'Resuelto con reinicio de switch',
        },
        actor,
      );

      expect(closed.status).toBe('CLOSED');
      expect(closed.closedAt).not.toBeNull();
      expect(closed.lastStatusComment).toBe('Resuelto con reinicio de switch');
      expect(closed.assignedUserId).toBe(creatorId);
    });

    it('no permite cerrar sin motivo', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();
      await situationsService.update(
        id,
        { status: 'IN_PROGRESS' as never },
        actor,
      );

      await expect(
        situationsService.update(id, { status: 'CLOSED' as never }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no permite saltar de OPEN a CLOSED', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();

      await expect(
        situationsService.update(
          id,
          { status: 'CLOSED' as never, statusComment: 'motivo' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una situación cerrada no admite más cambios de estado', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();
      await situationsService.update(
        id,
        { status: 'IN_PROGRESS' as never },
        actor,
      );
      await situationsService.update(
        id,
        { status: 'CLOSED' as never, statusComment: 'motivo' },
        actor,
      );

      await expect(
        situationsService.update(id, { status: 'IN_PROGRESS' as never }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un analista que no es creador ni coordinador propietario recibe 403', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();

      await expect(
        situationsService.update(
          id,
          { status: 'IN_PROGRESS' as never },
          analyst,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un coordinador de otra coordinación no ve la situación: 404', async () => {
      const { situationsService } = buildOrchestrator();
      const id = await registerForClosure();
      const outsider: AuthPayload = {
        ...actor,
        sub: analystId,
        coordinationId: otherCoordinationId,
      };

      await expect(
        situationsService.update(
          id,
          { status: 'IN_PROGRESS' as never },
          outsider,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el cierre no altera el reclamo ni la idempotencia del registro', async () => {
      const { orchestrator, situationsService } = buildOrchestrator();
      const created = await orchestrator.registerAndExecute(
        { ...dto, title: 'Registro cerrado' },
        actor,
        OTHER_KEY,
      );
      await situationsService.update(
        created.situation.id,
        { status: 'IN_PROGRESS' as never },
        actor,
      );
      await situationsService.update(
        created.situation.id,
        { status: 'CLOSED' as never, statusComment: 'motivo' },
        actor,
      );

      const replay = await orchestrator.registerAndExecute(
        { ...dto, title: 'Registro cerrado' },
        actor,
        OTHER_KEY,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.situation.status).toBe('CLOSED');
      expect(await countByKey(OTHER_KEY)).toBe(1);
    });
  });

  describe('migraciones', () => {
    it('revertir todas las migraciones nuevas elimina índices y columnas; reaplicar las restaura', async () => {
      // Migraciones posteriores a la base de la fase: 5 en total.
      for (let i = 0; i < 5; i += 1) {
        await ds.undoLastMigration();
      }
      const indexesAfterUndo = await query(
        'SELECT 1 FROM pg_indexes WHERE indexname = ANY($1)',
        [[INDEX_NAME, EVIDENCE_INDEX_NAME]],
      );
      expect(indexesAfterUndo).toHaveLength(0);
      const columnsAfterUndo = await query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'situations' AND column_name = 'analysis_claim_token'`,
      );
      expect(columnsAfterUndo).toHaveLength(0);

      await ds.runMigrations();

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
