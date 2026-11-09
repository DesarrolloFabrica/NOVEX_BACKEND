import { ConflictException } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { openDisposableDataSource } from '../../test/support/disposable-database.guard';
import { SituationContextBuilder } from '../ai-prompt-engine/builders/situation-context.builder';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { UserStatus } from '../common/enums/identity.enums';
import { EvidenceType } from '../common/enums/situation-evidence.enums';
import { RecommendationPriority } from '../common/enums/situation-recommendation.enums';
import { NormalizeLegacyResolvedSituations1788800000000 } from '../database/migrations/1788800000000-NormalizeLegacyResolvedSituations';
import { buildEstadoEvolutionBuckets } from '../operational-kpis/domain/kpi-estado-evolution-buckets';
import { OperationalKpiHistoryRepository } from '../operational-kpis/operational-kpi-history.repository';
import { OperationalKpiSnapshotRepository } from '../operational-kpis/operational-kpi-snapshot.repository';
import { OperationalOverviewService } from '../operational-overview/operational-overview.service';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { ROLE_PERMISSION_CODES } from '../permissions/seeds/permissions.catalog.seed';
import { SituationEvidenceRepository } from '../situation-evidence/repositories/situation-evidence.repository';
import { SituationEvidenceService } from '../situation-evidence/situation-evidence.service';
import { EvidenceStorageService } from '../situation-evidence/storage/evidence-storage.service';
import { SituationRecommendationsRepository } from '../situation-recommendations/repositories/situation-recommendations.repository';
import { SituationRecommendationsService } from '../situation-recommendations/situation-recommendations.service';
import { SituationTimelineRepository } from '../situation-timeline/repositories/situation-timeline.repository';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { User } from '../users/entities/user.entity';
import { Situation } from './entities/situation.entity';

/**
 * FASE 01B.2 contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1), solo en una base
 * desechable validada por la guarda central. Gemini no interviene: sus
 * sugerencias se siembran como filas. Demuestra con SQL real:
 *   - 5 coordinaciones sugeridas por la IA no cambian la integridad; 3
 *     relaciones confirmadas sí;
 *   - overview, KPIs de estado y carga por tipo cuentan la misma población
 *     (RESOLVED legado con y sin fecha, INTER consigo misma, anuladas);
 *   - recomendaciones congeladas en casos cerrados, incluso frente a un cierre
 *     concurrente;
 *   - retiro de evidencias: sin borrado físico, definitivo, fuera de Gemini;
 *   - la migración RESOLVED → CLOSED con y sin fechas reales, y su reversión.
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const id = (suffix: string) =>
  `7f000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const P = id('a1');
const Q = id('a2');
const R = id('a3');
const S = id('a4');
const T = id('a5');
const U = id('a6');
const W = id('a7');
const CAT = id('c1');
const ROLE = id('e1');
const U_ADMIN = id('f1');
const U_COORD = id('f2');

const admin: AuthPayload = {
  sub: U_ADMIN,
  email: 'it-01b2-admin@test.novex.invalid',
  roleId: ROLE,
  roleCode: 'ADMIN',
  coordinationId: null,
  permissions: [...ROLE_PERMISSION_CODES.ADMIN],
  status: UserStatus.ACTIVE,
};
const coordinator: AuthPayload = {
  sub: U_COORD,
  email: 'it-01b2-coord@test.novex.invalid',
  roleId: ROLE,
  roleCode: 'COORDINADOR',
  coordinationId: P,
  permissions: [...ROLE_PERMISSION_CODES.COORDINADOR],
  status: UserStatus.ACTIVE,
};

function bogotaYmd(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

suite(
  'Fase 01B.2 · IA, indicadores y consistencia contra PostgreSQL real',
  () => {
    let ds: DataSource;
    let timeline: SituationTimelineService;
    let audit: AuditLogService;

    const insertSituation = async (input: {
      owner: string | null;
      status?: string;
      severity?: string;
      kind?: 'INTERNAL' | 'INTER_COORDINATION';
      affected?: string | null;
      createdDaysAgo?: number;
      closedAt?: string | null;
      resolvedAt?: string | null;
    }): Promise<string> => {
      const kind = input.kind ?? 'INTERNAL';
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO situations (title, description, coordination_id, created_by_user_id,
         category_id, severity, status, occurred_at, report_kind, affected_coordination_id,
         created_at, closed_at, resolved_at)
       VALUES ('IT 01B2', 'caso de prueba', $1, $2, $3, $4, $5,
         now() - make_interval(days => $6), $7, $8,
         now() - make_interval(days => $6), $9, $10)
       RETURNING id`,
        [
          input.owner,
          U_COORD,
          kind === 'INTERNAL' ? CAT : null,
          input.severity ?? 'MEDIUM',
          input.status ?? 'OPEN',
          input.createdDaysAgo ?? 5,
          kind,
          input.affected ?? null,
          input.closedAt ?? null,
          input.resolvedAt ?? null,
        ],
      );
      return rows[0].id;
    };

    beforeAll(async () => {
      ds = await openDisposableDataSource('fase01b2-indicators.pg.spec.ts', {
        entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
      });
      await removeOwnSituations();
      await ds.query(
        `INSERT INTO roles (id, code, name) VALUES ($1, 'it-01b2-role', 'IT 01B2')
         ON CONFLICT DO NOTHING`,
        [ROLE],
      );
      const coords = [P, Q, R, S, T, U, W];
      for (const [index, coordination] of coords.entries()) {
        await ds.query(
          `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset, is_active)
         VALUES ($1, $2, $3, $4, '#000', 'x', 'x', true)
         ON CONFLICT DO NOTHING`,
          [coordination, `it-01b2-${index}`, `IT 01B2 ${index}`, `C${index}`],
        );
      }
      await ds.query(
        `INSERT INTO incident_categories (id, code, name, is_selectable, icon)
       VALUES ($1, 'IT_01B2', 'IT 01B2', true, 'apps')
       ON CONFLICT DO NOTHING`,
        [CAT],
      );
      await ds.query(
        `INSERT INTO users (id, email, full_name, role_id, coordination_id)
       VALUES ($1, 'it-01b2-admin@test.novex.invalid', 'IT Admin', $3, NULL),
              ($2, 'it-01b2-coord@test.novex.invalid', 'IT Coordinador', $3, $4)
       ON CONFLICT DO NOTHING`,
        [U_ADMIN, U_COORD, ROLE, P],
      );
      timeline = new SituationTimelineService(
        new SituationTimelineRepository(ds),
        ds.getRepository(Situation),
      );
      audit = new AuditLogService(ds.getRepository(AuditLog), {
        getRequestId: () => null,
      } as never);
    });

    afterAll(async () => {
      if (ds?.isInitialized) {
        await removeOwnSituations();
        await ds.destroy();
      }
    });

    /**
     * Re-ejecutable en la misma base desechable: retira SOLO los casos de las
     * coordinaciones de esta suite (la auditoría inmutable no se toca). Las
     * filas de catálogo se reutilizan (ON CONFLICT DO NOTHING).
     */
    async function removeOwnSituations(): Promise<void> {
      const coords = [P, Q, R, S, T, U, W];
      const own = `SELECT id FROM situations
         WHERE coordination_id = ANY($1::uuid[]) OR affected_coordination_id = ANY($1::uuid[])`;
      const [{ t }]: Array<{ t: string | null }> = await ds.query(
        `SELECT to_regclass('public.legacy_resolved_normalizations')::text AS t`,
      );
      if (t) {
        await ds.query(
          `DELETE FROM legacy_resolved_normalizations WHERE situation_id IN (${own})`,
          [coords],
        );
      }
      await ds.query(`DELETE FROM situations WHERE id IN (${own})`, [coords]);
    }

    describe('A · la IA no modifica la integridad', () => {
      const overviewFor = async (coordinationId: string) => {
        const service = new OperationalOverviewService(
          new CoordinationsRepository(ds),
          new OperationalOverviewRepository(ds),
          new OperationalScopeService(),
        );
        const overview = await service.getOverview(admin);
        return overview.coordinations.find((c) => c.id === coordinationId)!;
      };

      it('5 coordinaciones sugeridas por Gemini no cambian estado, integridad ni vidas', async () => {
        const situationId = await insertSituation({ owner: P });
        const before = await overviewFor(P);

        const [assessment]: Array<{ id: string }> = await ds.query(
          `INSERT INTO situation_impact_assessments
           (situation_id, operational_severity, confidence, estimated_duration_minutes, summary, reasoning)
         VALUES ($1, 'CRITICAL', 0.9, 120, 'sugerencia', 'sugerencia') RETURNING id`,
          [situationId],
        );
        for (const suggested of [Q, R, S, T, U]) {
          await ds.query(
            `INSERT INTO situation_affected_coordinations
             (impact_assessment_id, coordination_id, impact_level, description)
           VALUES ($1, $2, 'CRITICAL', 'sugerida por IA')`,
            [assessment.id, suggested],
          );
        }

        const after = await overviewFor(P);
        expect(after.affectedCoordinationCount).toBe(0);
        expect(after.status).toBe(before.status);
        expect(after.status).not.toBe('CRITICO');
        expect(after.lifePoints).toBe(before.lifePoints);
        expect(after.activeProblemsCount).toBe(before.activeProblemsCount);
      });

      it('3 relaciones confirmadas por un usuario autorizado sí la elevan (umbral vigente)', async () => {
        const [situation]: Array<{ id: string }> = await ds.query(
          `SELECT id FROM situations WHERE coordination_id = $1 LIMIT 1`,
          [P],
        );
        for (const [order, related] of [Q, R, S].entries()) {
          await ds.query(
            `INSERT INTO situation_related_coordinations (situation_id, coordination_id, display_order)
           VALUES ($1, $2, $3)`,
            [situation.id, related, order],
          );
        }

        const after = await overviewFor(P);
        expect(after.affectedCoordinationCount).toBe(3);
        expect(after.status).toBe('CRITICO');
      });
    });

    describe('C · overview y KPIs cuentan la misma población', () => {
      it('RESOLVED legado, INTER consigo misma y anuladas cuentan igual en todas las lecturas', async () => {
        // Activos reales de W: dos internos y una INTER consigo misma.
        await insertSituation({ owner: W, severity: 'HIGH' });
        await insertSituation({
          owner: W,
          status: 'IN_PROGRESS',
          severity: 'CRITICAL',
        });
        await insertSituation({
          owner: W,
          kind: 'INTER_COORDINATION',
          affected: W,
          severity: 'LOW',
        });
        // No activos: anulada, RESOLVED sin fechas, RESOLVED resuelto hace 1 día.
        await insertSituation({ owner: W, status: 'CANCELLED' });
        await insertSituation({ owner: W, status: 'RESOLVED' });
        await insertSituation({
          owner: W,
          status: 'RESOLVED',
          resolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        });
        // Dependencia real que AFECTA a W (responsable Q).
        await insertSituation({
          owner: Q,
          kind: 'INTER_COORDINATION',
          affected: W,
          severity: 'CRITICAL',
        });

        const overviewRepository = new OperationalOverviewRepository(ds);
        const active = (
          await overviewRepository.aggregateActiveSituationsBySeverity()
        )
          .filter((row) => row.coordinationId === W)
          .reduce((sum, row) => sum + row.total, 0);
        const incoming = (
          await overviewRepository.aggregateIncomingDependencies()
        ).find((row) => row.affectedCoordinationId === W);
        const outgoing = (
          await overviewRepository.aggregateOutgoingDependencies()
        ).find((row) => row.coordinationId === W);

        expect(active).toBe(3);
        // K-06: la INTER consigo misma no es dependencia entrante ni saliente.
        expect(incoming?.total).toBe(1);
        expect(incoming?.criticalTotal).toBe(1);
        expect(outgoing).toBeUndefined();

        const snapshot = new OperationalKpiSnapshotRepository(
          ds.getRepository(Situation),
        );
        const today = await snapshot.aggregateComposition(W, bogotaYmd());
        // K-02: misma cifra que overview (cartas, panel, integridad).
        expect(today.activeCount).toBe(active);
        expect(today.attention.inProgress).toBe(1);

        const history = new OperationalKpiHistoryRepository(
          ds.getRepository(Situation),
        );
        const buckets = buildEstadoEvolutionBuckets(
          'cycle',
          bogotaYmd(-6),
          bogotaYmd(),
        );
        const byKind = await history.aggregateActiveByKind(W, buckets);
        const last = byKind.get(buckets.at(-1)!.end)!;
        expect(last.internal + last.external).toBe(active);
        expect(last.external).toBe(0);

        // Corte de hace 2 días: el RESOLVED con fecha real seguía activo; el
        // RESOLVED sin fecha y la anulada nunca cuentan.
        const past = await snapshot.aggregateComposition(W, bogotaYmd(-2));
        expect(past.activeCount).toBe(4);
        expect(past.attention.closedAfterCut).toBe(1);
      });
    });

    describe('E · recomendaciones y evidencias', () => {
      const recommendationsService = () =>
        new SituationRecommendationsService(
          new SituationRecommendationsRepository(ds),
          ds.getRepository(Situation),
          ds.getRepository(User),
          timeline,
        );

      const insertRecommendation = async (situationId: string) => {
        const [row]: Array<{ id: string }> = await ds.query(
          `INSERT INTO situation_recommendations (situation_id, title, description, priority, generated_by)
         VALUES ($1, 'Revisar', 'Detalle', 'MEDIUM', 'AI') RETURNING id`,
          [situationId],
        );
        return row.id;
      };

      it('una recomendación de un caso CERRADO o ANULADO no se modifica; se sigue leyendo', async () => {
        for (const [status, code] of [
          ['CLOSED', 'SITUATION_CLOSED'],
          ['CANCELLED', 'SITUATION_CANCELLED'],
        ] as const) {
          const situationId = await insertSituation({
            owner: P,
            status,
            closedAt: status === 'CLOSED' ? new Date().toISOString() : null,
          });
          const recommendationId = await insertRecommendation(situationId);

          const error = await recommendationsService()
            .updateRecommendation(
              recommendationId,
              { priority: RecommendationPriority.CRITICAL },
              U_COORD,
            )
            .catch((caught: unknown) => caught);
          expect(error).toBeInstanceOf(ConflictException);
          expect((error as ConflictException).getResponse()).toMatchObject({
            code,
          });

          const [row]: Array<{ priority: string }> = await ds.query(
            `SELECT priority FROM situation_recommendations WHERE id = $1`,
            [recommendationId],
          );
          expect(row.priority).toBe('MEDIUM');
          const list =
            await recommendationsService().findBySituation(situationId);
          expect(list.total).toBe(1);
        }
      });

      it('un cierre concurrente gana: la modificación espera el bloqueo y responde 409', async () => {
        const situationId = await insertSituation({
          owner: P,
          status: 'IN_PROGRESS',
        });
        const recommendationId = await insertRecommendation(situationId);

        const closer = ds.createQueryRunner();
        await closer.connect();
        await closer.startTransaction();
        await closer.query(
          `SELECT id FROM situations WHERE id = $1 FOR UPDATE`,
          [situationId],
        );

        const pending = recommendationsService()
          .updateRecommendation(
            recommendationId,
            { priority: RecommendationPriority.HIGH },
            U_COORD,
          )
          .catch((caught: unknown) => caught);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await closer.query(
          `UPDATE situations SET status = 'CLOSED', closed_at = now() WHERE id = $1`,
          [situationId],
        );
        await closer.commitTransaction();
        await closer.release();

        const error = await pending;
        expect(error).toBeInstanceOf(ConflictException);
        const [row]: Array<{ priority: string }> = await ds.query(
          `SELECT priority FROM situation_recommendations WHERE id = $1`,
          [recommendationId],
        );
        expect(row.priority).toBe('MEDIUM');
      });

      it('retiro de evidencia: sin borrado físico, definitivo, con motivo y fuera de Gemini', async () => {
        const situationId = await insertSituation({ owner: P });
        const evidenceRepository = new SituationEvidenceRepository(ds);
        const service = new SituationEvidenceService(
          evidenceRepository,
          ds.getRepository(Situation),
          new EvidenceStorageService(),
          timeline,
          audit,
          new OperationalScopeService(),
        );
        const created = await service.create(
          situationId,
          { type: EvidenceType.NOTE, title: 'Nota', description: 'detalle' },
          coordinator,
        );

        const retired = await service.retire(
          situationId,
          created.id,
          { reason: 'Nota duplicada por error del usuario' },
          coordinator,
        );
        expect(retired.status).toBe('RETIRED');

        // No hay borrado físico.
        const [{ count }]: Array<{ count: string }> = await ds.query(
          `SELECT COUNT(*) FROM situation_evidences WHERE id = $1`,
          [created.id],
        );
        expect(Number(count)).toBe(1);

        // No aparece como activa ni en el contexto de Gemini.
        expect((await service.findBySituation(situationId)).total).toBe(0);
        expect(
          (await service.findBySituation(situationId, { includeRetired: true }))
            .items[0].retirement?.reason,
        ).toBe('Nota duplicada por error del usuario');
        const builder = new SituationContextBuilder(
          {} as never,
          {} as never,
          evidenceRepository,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        );
        expect(await builder.buildEvidence(situationId)).toEqual([]);

        // El retiro es definitivo y el motivo obligatorio (base de datos).
        await expect(
          ds.query(
            `UPDATE situation_evidences SET retired_at = NULL WHERE id = $1`,
            [created.id],
          ),
        ).rejects.toThrow(/definitivo/);
        const other = await service.create(
          situationId,
          { type: EvidenceType.NOTE, title: 'Otra', description: 'detalle' },
          coordinator,
        );
        await expect(
          ds.query(
            `UPDATE situation_evidences SET retired_at = now(), retired_by_user_id = $2 WHERE id = $1`,
            [other.id, U_COORD],
          ),
        ).rejects.toThrow(/chk_situation_evidences_retirement_complete/);

        // Auditoría obligatoria del retiro, sin el texto del motivo.
        const audits: Array<{ metadata: Record<string, unknown> }> =
          await ds.query(
            `SELECT metadata FROM audit_logs
          WHERE action = 'SITUATION_EVIDENCE_RETIRED' AND resource_id = $1`,
            [situationId],
          );
        expect(audits).toHaveLength(1);
        expect(JSON.stringify(audits[0].metadata)).not.toContain('duplicada');
      });
    });

    describe('D · migración RESOLVED → CLOSED (al final: convierte todos los RESOLVED)', () => {
      it('convierte solo con fecha real, registra los pendientes y se revierte', async () => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const withClosed = await insertSituation({
          owner: P,
          status: 'RESOLVED',
          closedAt: dayAgo,
          resolvedAt: dayAgo,
        });
        const withResolvedOnly = await insertSituation({
          owner: P,
          status: 'RESOLVED',
          resolvedAt: dayAgo,
        });
        const withoutDates = await insertSituation({
          owner: P,
          status: 'RESOLVED',
        });
        const closeBeforeCreate = await insertSituation({
          owner: P,
          status: 'RESOLVED',
          createdDaysAgo: 1,
          resolvedAt: new Date(
            Date.now() - 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        });
        await ds.query(
          `INSERT INTO situation_resolutions (situation_id, learning, resolved_by_user_id)
         VALUES ($1, 'Aprendizaje real', $2)`,
          [withClosed, U_COORD],
        );

        const migration = new NormalizeLegacyResolvedSituations1788800000000();
        const runner = ds.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        await migration.up(runner);
        await runner.commitTransaction();

        const state = async (situationId: string) => {
          const [row]: Array<{
            status: string;
            closed_at: Date | null;
            resolved_at: Date | null;
          }> = await ds.query(
            `SELECT status, closed_at, resolved_at FROM situations WHERE id = $1`,
            [situationId],
          );
          return row;
        };
        const log = async (situationId: string) => {
          const [row]: Array<{
            outcome: string;
            close_date_source: string | null;
            has_learning: boolean;
          }> = await ds.query(
            `SELECT outcome, close_date_source, has_learning
               FROM legacy_resolved_normalizations WHERE situation_id = $1`,
            [situationId],
          );
          return row;
        };

        expect((await state(withClosed)).status).toBe('CLOSED');
        expect((await state(withClosed)).closed_at?.toISOString()).toBe(dayAgo);
        expect(await log(withClosed)).toMatchObject({
          outcome: 'NORMALIZED',
          close_date_source: 'closed_at',
          has_learning: true,
        });
        const resolvedOnly = await state(withResolvedOnly);
        expect(resolvedOnly.status).toBe('CLOSED');
        expect(resolvedOnly.closed_at?.toISOString()).toBe(dayAgo);
        expect((await log(withResolvedOnly)).close_date_source).toBe(
          'resolved_at',
        );
        // Sin fecha real: no se convierte ni se inventa una fecha.
        expect(await state(withoutDates)).toMatchObject({
          status: 'RESOLVED',
          closed_at: null,
        });
        expect((await log(withoutDates)).outcome).toBe(
          'PENDING_MISSING_CLOSE_DATE',
        );
        expect((await state(closeBeforeCreate)).status).toBe('RESOLVED');
        expect((await log(closeBeforeCreate)).outcome).toBe(
          'PENDING_CLOSE_BEFORE_CREATE',
        );
        // El aprendizaje se conserva.
        const [{ count }]: Array<{ count: string }> = await ds.query(
          `SELECT COUNT(*) FROM situation_resolutions WHERE situation_id = $1`,
          [withClosed],
        );
        expect(Number(count)).toBe(1);

        // Idempotencia explícita: una segunda ejecución se niega.
        const again = ds.createQueryRunner();
        await again.connect();
        await expect(migration.up(again)).rejects.toThrow(/ya se aplicó/);
        await again.release();

        // Reversión exacta.
        await runner.startTransaction();
        await migration.down(runner);
        await runner.commitTransaction();
        expect(await state(withResolvedOnly)).toMatchObject({
          status: 'RESOLVED',
          closed_at: null,
        });
        expect((await state(withClosed)).status).toBe('RESOLVED');
        expect(await runner.hasTable('legacy_resolved_normalizations')).toBe(
          false,
        );

        // Deja el esquema como lo dejó migration:run.
        await runner.startTransaction();
        await migration.up(runner);
        await runner.commitTransaction();
        await runner.release();
      });
    });
  },
);
