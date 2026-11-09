import { ConflictException, ForbiddenException } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { openDisposableDataSource } from '../../test/support/disposable-database.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
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
import { OperationalKpiResolutionRepository } from '../operational-kpis/operational-kpi-resolution.repository';
import { OperationalKpiSnapshotRepository } from '../operational-kpis/operational-kpi-snapshot.repository';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { ROLE_PERMISSION_CODES } from '../permissions/seeds/permissions.catalog.seed';
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
import { SituationSeverityChangeSource } from '../common/enums/situation.enums';
import type { SeverityEscalationPolicy } from './severity-escalation/severity-escalation.policy';
import { SituationAdministrationService } from './situation-administration.service';
import { AddSituationCoordinationTransfers1788400000000 } from '../database/migrations/1788400000000-AddSituationCoordinationTransfers';
import { OperationalKpiHistoryRepository } from '../operational-kpis/operational-kpi-history.repository';
import { SituationsService } from './situations.service';

/**
 * FASE 01B.1 contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1), solo en una base
 * desechable validada por la guarda central (test/support). Gemini no
 * interviene. Demuestra con bloqueos, triggers y SQL reales:
 *   - anulación repetida y concurrente: una sola gana;
 *   - traslado frente a cierre: se serializan, nunca ambos;
 *   - traslado INTERNAL e INTER con sus invariantes;
 *   - las anuladas salen del overview y de los KPIs, y se cuentan aparte;
 *   - sin auditoría no hay acción, y la auditoría es inmutable;
 *   - compatibilidad con registros históricos (RESOLVED, sin responsable).
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const COORD_A = '7e000000-0000-4000-8000-0000000000a1';
const COORD_B = '7e000000-0000-4000-8000-0000000000b1';
const COORD_C = '7e000000-0000-4000-8000-0000000000c1';
const CAT = '7e000000-0000-4000-8000-0000000000d1';
const COORD_D = '7e000000-0000-4000-8000-0000000000d2';
const COORD_E = '7e000000-0000-4000-8000-0000000000d3';
const ROLE = '7e000000-0000-4000-8000-0000000000e1';
const U_ADMIN = '7e000000-0000-4000-8000-0000000000f1';
const U_COORD_A = '7e000000-0000-4000-8000-0000000000f2';

const admin: AuthPayload = {
  sub: U_ADMIN,
  email: 'it-01b-admin@test.novex.invalid',
  roleId: ROLE,
  roleCode: 'ADMIN',
  coordinationId: null,
  permissions: [...ROLE_PERMISSION_CODES.ADMIN],
  status: UserStatus.ACTIVE,
};
const coordinatorA: AuthPayload = {
  sub: U_COORD_A,
  email: 'it-01b-coord@test.novex.invalid',
  roleId: ROLE,
  roleCode: 'COORDINADOR',
  coordinationId: COORD_A,
  permissions: [...ROLE_PERMISSION_CODES.COORDINADOR],
  status: UserStatus.ACTIVE,
};

const REASON = 'Reporte duplicado del caso registrado ayer';
const TEST_ESCALATION_POLICY: SeverityEscalationPolicy = {
  code: 'it-01b-escalation',
  schedule: ({ reportedSeverity, createdAt }) =>
    reportedSeverity === SituationSeverity.MEDIUM
      ? [
          {
            ruleKey: 'it-step-1',
            toSeverity: SituationSeverity.HIGH,
            effectiveAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
          },
        ]
      : [],
};

/** Fecha de hoy en Bogotá (YYYY-MM-DD), como los cortes de los KPIs. */
function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(new Date());
}

suite(
  'Fase 01B.1 · anulación, traslado y auditoría contra PostgreSQL real',
  () => {
    let ds: DataSource;
    let situations: SituationsService;
    let administration: SituationAdministrationService;

    beforeAll(async () => {
      ds = await openDisposableDataSource('fase01b-administration.pg.spec.ts', {
        entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
      });

      await ds.query(
        `INSERT INTO roles (id, code, name) VALUES ($1, 'it-01b-role', 'IT 01B')`,
        [ROLE],
      );
      await ds.query(
        `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset, is_active)
       VALUES ($1, 'it-01b-a', 'IT 01B A', 'A', '#000', 'x', 'x', true),
              ($2, 'it-01b-b', 'IT 01B B', 'B', '#000', 'x', 'x', true),
              ($3, 'it-01b-c', 'IT 01B C', 'C', '#000', 'x', 'x', true),
              ($4, 'it-01b-d', 'IT 01B D', 'D', '#000', 'x', 'x', true),
              ($5, 'it-01b-e', 'IT 01B E', 'E', '#000', 'x', 'x', true)`,
        [COORD_A, COORD_B, COORD_C, COORD_D, COORD_E],
      );
      await ds.query(
        `INSERT INTO incident_categories (id, code, name, is_selectable, icon)
       VALUES ($1, 'IT_01B', 'IT 01B', true, 'apps')`,
        [CAT],
      );
      await ds.query(
        `INSERT INTO users (id, email, full_name, role_id, coordination_id)
       VALUES ($1, 'it-01b-admin@test.novex.invalid', 'IT Admin', $3, NULL),
              ($2, 'it-01b-coord@test.novex.invalid', 'IT Coordinador A', $3, $4)`,
        [U_ADMIN, U_COORD_A, ROLE, COORD_A],
      );

      const timelineService = new SituationTimelineService(
        new SituationTimelineRepository(ds),
        ds.getRepository(Situation),
      );
      new SituationTimelineSubscriber(ds, timelineService);
      // Auditoría REAL: escribe en audit_logs (inmutable por trigger).
      const audit = new AuditLogService(ds.getRepository(AuditLog), {
        getRequestId: () => null,
      } as never);
      const escalation = new SeverityEscalationService(
        [TEST_ESCALATION_POLICY],
        timelineService,
        audit,
      );
      const situationsRepository = new SituationsRepository(ds);
      situations = new SituationsService(
        situationsRepository,
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
      administration = new SituationAdministrationService(
        situationsRepository,
        situations,
        new OperationalScopeService(),
        timelineService,
        audit,
        ds.getRepository(Coordination),
      );
    });

    afterAll(async () => {
      if (ds?.isInitialized) {
        await ds.query(
          `DROP TRIGGER IF EXISTS it_01b_fail_audit ON audit_logs`,
        );
        await ds.query(`DROP FUNCTION IF EXISTS it_01b_fail_audit()`);
        await ds.destroy();
      }
    });

    const createInternal = (severity = SituationSeverity.HIGH) =>
      situations.create(
        {
          title: 'IT 01B interno',
          description: 'Problema de prueba',
          reportKind: SituationReportKind.INTERNAL,
          coordinationId: COORD_A,
          categoryId: CAT,
          severity,
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
        },
        coordinatorA,
      );

    const createInter = () =>
      situations.create(
        {
          title: 'IT 01B dependencia',
          description: 'Dependencia de prueba',
          reportKind: SituationReportKind.INTER_COORDINATION,
          coordinationId: COORD_B,
          affectedCoordinationId: COORD_A,
          severity: SituationSeverity.CRITICAL,
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
          affectedProcess: 'Proceso de A',
          pendingDelivery: 'Entrega de B',
        },
        coordinatorA,
      );

    const row = async (id: string) =>
      (
        await ds.query<
          Array<{
            status: string;
            coordination_id: string | null;
            affected_coordination_id: string | null;
            created_by_user_id: string;
            closed_at: Date | null;
            assigned_user_id: string | null;
          }>
        >(
          `SELECT status, coordination_id, affected_coordination_id, created_by_user_id, closed_at, assigned_user_id
           FROM situations WHERE id = $1`,
          [id],
        )
      )[0];

    const count = async (sql: string, params: unknown[]) =>
      Number((await ds.query<Array<{ n: string }>>(sql, params))[0].n);

    async function runAsRole(role: string, sql: string, params: unknown[]) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(role)) {
        throw new Error('Rol de prueba inválido.');
      }
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query(`SET LOCAL ROLE "${role}"`);
        return (await runner.query(sql, params)) as unknown;
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    }

    describe('anulación', () => {
      it('conserva autor e historial, registra motivo y estado anterior, y audita', async () => {
        const created = await createInternal();

        const detail = await administration.cancel(
          created.id,
          { reason: REASON },
          admin,
        );

        expect(detail.status).toBe(SituationStatus.CANCELLED);
        expect(detail.cancellation).toMatchObject({
          reason: REASON,
          previousStatus: SituationStatus.OPEN,
          cancelledByUserId: U_ADMIN,
        });
        const current = await row(created.id);
        expect(current.created_by_user_id).toBe(U_COORD_A);
        expect(current.closed_at).toBeNull();
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_timeline_entries WHERE situation_id = $1 AND event_type = 'CANCELLED'`,
            [created.id],
          ),
        ).toBe(1);
        expect(
          await count(
            `SELECT count(*) AS n FROM audit_logs WHERE resource_id = $1 AND action = 'SITUATION_CANCELLED'`,
            [created.id],
          ),
        ).toBe(1);
        // La creación también quedó auditada (obligatoria, en su transacción).
        expect(
          await count(
            `SELECT count(*) AS n FROM audit_logs WHERE resource_id = $1 AND action = 'SITUATION_CREATED'`,
            [created.id],
          ),
        ).toBe(1);
      });

      it('anulación repetida → 409 SITUATION_ALREADY_CANCELLED', async () => {
        const created = await createInternal();
        await administration.cancel(created.id, { reason: REASON }, admin);

        const error = await administration
          .cancel(created.id, { reason: REASON }, admin)
          .catch((caught: unknown) => caught);

        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'SITUATION_ALREADY_CANCELLED',
        });
      });

      it('dos anulaciones simultáneas: una gana; una sola fila de anulación', async () => {
        const created = await createInternal();

        const results = await Promise.allSettled([
          administration.cancel(created.id, { reason: REASON }, admin),
          administration.cancel(created.id, { reason: REASON }, admin),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(rejected?.reason).toBeInstanceOf(ConflictException);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_cancellations WHERE situation_id = $1`,
            [created.id],
          ),
        ).toBe(1);
      });

      it('una anulada no se edita, avanza ni resuelve', async () => {
        const created = await createInternal();
        await administration.cancel(created.id, { reason: REASON }, admin);

        for (const attempt of [
          () => situations.update(created.id, { title: 'x' }, coordinatorA),
          () =>
            situations.update(
              created.id,
              { status: SituationStatus.IN_PROGRESS },
              coordinatorA,
            ),
          () =>
            situations.resolve(
              created.id,
              { learning: 'aprendizaje' },
              coordinatorA,
            ),
        ]) {
          const error = await attempt().catch((caught: unknown) => caught);
          expect((error as ConflictException).getResponse()).toMatchObject({
            code: 'SITUATION_CANCELLED',
          });
        }
        expect((await row(created.id)).status).toBe(SituationStatus.CANCELLED);
      });

      it('un coordinador no anula (403)', async () => {
        const created = await createInternal();
        await expect(
          administration.cancel(created.id, { reason: REASON }, coordinatorA),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('traslado', () => {
      it('INTERNAL: responsable y afectada se trasladan juntas; autor y fechas intactos', async () => {
        const created = await createInternal();
        await ds.query(
          `UPDATE situations SET status = 'IN_PROGRESS', assigned_user_id = $2 WHERE id = $1`,
          [created.id, U_COORD_A],
        );

        await administration.transferCoordination(
          created.id,
          { toCoordinationId: COORD_B, reason: 'Corresponde al área B' },
          admin,
        );

        const current = await row(created.id);
        expect(current.coordination_id).toBe(COORD_B);
        expect(current.affected_coordination_id).toBe(COORD_B);
        expect(current.status).toBe(SituationStatus.OPEN);
        expect(current.assigned_user_id).toBeNull();
        expect(current.created_by_user_id).toBe(U_COORD_A);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_coordination_transfers
            WHERE situation_id = $1 AND from_coordination_id = $2 AND to_coordination_id = $3
              AND status_at_transfer = 'IN_PROGRESS'
              AND previous_assigned_user_id = $4 AND next_assigned_user_id IS NULL`,
            [created.id, COORD_A, COORD_B, U_COORD_A],
          ),
        ).toBe(1);
        // Sin evento UPDATED duplicado: solo el evento de traslado.
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_timeline_entries WHERE situation_id = $1 AND event_type = 'UPDATED'`,
            [created.id],
          ),
        ).toBe(0);
      });

      it('IN_PROGRESS vuelve a OPEN; los cortes previos y posteriores conservan cada responsable', async () => {
        const created = await createInternal();
        const oldCreatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
        await ds.query(
          `UPDATE situations SET status = 'IN_PROGRESS', assigned_user_id = $2,
             coordination_id = $3, affected_coordination_id = $3, created_at = $4
           WHERE id = $1`,
          [created.id, U_COORD_A, COORD_D, oldCreatedAt],
        );
        await administration.transferCoordination(
          created.id,
          {
            toCoordinationId: COORD_E,
            reason: 'Continuidad operativa del área E',
          },
          admin,
        );
        const [{ transferred_at: transferredAt }] = await ds.query<
          Array<{ transferred_at: Date }>
        >(
          `SELECT transferred_at FROM situation_coordination_transfers WHERE situation_id = $1`,
          [created.id],
        );
        const repo = new OperationalKpiHistoryRepository(
          ds.getRepository(Situation),
        );
        const buckets = [
          {
            start: oldCreatedAt.toISOString(),
            end: 'before-transfer',
            label: 'antes',
            endExclusiveIso: new Date(
              transferredAt.getTime() - 1,
            ).toISOString(),
            endInclusiveIso: new Date(
              transferredAt.getTime() - 2,
            ).toISOString(),
          },
          {
            start: transferredAt.toISOString(),
            end: 'after-transfer',
            label: 'después',
            endExclusiveIso: new Date(
              transferredAt.getTime() + 60_000,
            ).toISOString(),
            endInclusiveIso: new Date(
              transferredAt.getTime() + 59_999,
            ).toISOString(),
          },
        ];
        expect(await repo.aggregateBacklog(COORD_D, buckets)).toEqual(
          new Map([
            ['before-transfer', 1],
            ['after-transfer', 0],
          ]),
        );
        expect(await repo.aggregateBacklog(COORD_E, buckets)).toEqual(
          new Map([
            ['before-transfer', 0],
            ['after-transfer', 1],
          ]),
        );
        expect((await row(created.id)).status).toBe(SituationStatus.OPEN);
      });

      it('INTER: solo la responsable; nunca igual a la afectada', async () => {
        const created = await createInter();

        await expect(
          administration.transferCoordination(
            created.id,
            { toCoordinationId: COORD_A, reason: 'Corresponde al área A' },
            admin,
          ),
        ).rejects.toThrow();
        await administration.transferCoordination(
          created.id,
          { toCoordinationId: COORD_C, reason: 'Corresponde al área C' },
          admin,
        );

        const current = await row(created.id);
        expect(current.coordination_id).toBe(COORD_C);
        expect(current.affected_coordination_id).toBe(COORD_A);
      });

      it('traslado frente a cierre en paralelo: se serializan y nunca triunfan ambos', async () => {
        for (let round = 0; round < 6; round += 1) {
          const created = await createInternal();

          const [transfer, resolution] = await Promise.allSettled([
            administration.transferCoordination(
              created.id,
              {
                toCoordinationId: COORD_B,
                reason: `Traslado de prueba ${round}`,
              },
              admin,
            ),
            situations.resolve(
              created.id,
              { learning: `Aprendizaje ${round}` },
              coordinatorA,
            ),
          ]);

          const current = await row(created.id);
          if (resolution.status === 'fulfilled') {
            // Cerró primero: el traslado vio CLOSED y no escribió nada.
            expect(transfer.status).toBe('rejected');
            expect(current.status).toBe(SituationStatus.CLOSED);
            expect(current.coordination_id).toBe(COORD_A);
          } else {
            // Trasladó primero: el coordinador de A ya no es el responsable.
            expect(transfer.status).toBe('fulfilled');
            expect(resolution.reason).toBeInstanceOf(ForbiddenException);
            expect(current.status).toBe(SituationStatus.OPEN);
            expect(current.coordination_id).toBe(COORD_B);
          }
        }
      });

      it('traslado IN_PROGRESS frente a anulación se serializa y conserva ambos eventos si gana primero', async () => {
        for (let round = 0; round < 4; round += 1) {
          const created = await createInternal();
          await ds.query(
            `UPDATE situations SET status = 'IN_PROGRESS', assigned_user_id = $2 WHERE id = $1`,
            [created.id, U_COORD_A],
          );
          const [transfer, cancellation] = await Promise.allSettled([
            administration.transferCoordination(
              created.id,
              {
                toCoordinationId: COORD_B,
                reason: `Reasignación de prueba ${round}`,
              },
              admin,
            ),
            administration.cancel(created.id, { reason: REASON }, admin),
          ]);
          const current = await row(created.id);
          if (cancellation.status === 'fulfilled') {
            expect(current.status).toBe(SituationStatus.CANCELLED);
            expect(
              await count(
                `SELECT count(*) AS n FROM situation_cancellations WHERE situation_id = $1`,
                [created.id],
              ),
            ).toBe(1);
            if (transfer.status === 'fulfilled') {
              expect(current.coordination_id).toBe(COORD_B);
              expect(current.assigned_user_id).toBeNull();
            } else {
              expect(current.coordination_id).toBe(COORD_A);
            }
          } else {
            expect(transfer.status).toBe('fulfilled');
            expect(current.status).toBe(SituationStatus.OPEN);
            expect(current.coordination_id).toBe(COORD_B);
            expect(current.assigned_user_id).toBeNull();
          }
        }
      });
    });

    describe('indicadores', () => {
      it('una anulada sale del overview y de los KPIs, y se cuenta aparte', async () => {
        const overviewRepository = new OperationalOverviewRepository(ds);
        const snapshot = new OperationalKpiSnapshotRepository(
          ds.getRepository(Situation),
        );
        const activeOf = async () =>
          (await overviewRepository.aggregateActiveSituationsBySeverity())
            .filter((r) => r.coordinationId === COORD_C)
            .reduce((sum, r) => sum + r.total, 0);

        // Coordinación C limpia: dos casos internos propios.
        const keep = await situations.create(
          {
            title: 'IT 01B C activo',
            description: 'x',
            reportKind: SituationReportKind.INTERNAL,
            coordinationId: COORD_C,
            categoryId: CAT,
            severity: SituationSeverity.CRITICAL,
            occurredAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            ...admin,
            roleCode: 'ANALISTA',
            permissions: [...ROLE_PERMISSION_CODES.ANALISTA],
          },
        );
        const drop = await situations.create(
          {
            title: 'IT 01B C duplicado',
            description: 'x',
            reportKind: SituationReportKind.INTERNAL,
            coordinationId: COORD_C,
            categoryId: CAT,
            severity: SituationSeverity.CRITICAL,
            occurredAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            ...admin,
            roleCode: 'ANALISTA',
            permissions: [...ROLE_PERMISSION_CODES.ANALISTA],
          },
        );
        void keep;
        const activeBefore = await activeOf();
        const kpiBefore = await snapshot.aggregateComposition(
          COORD_C,
          bogotaToday(),
        );

        await administration.cancel(drop.id, { reason: REASON }, admin);

        expect(await activeOf()).toBe(activeBefore - 1);
        const kpiAfter = await snapshot.aggregateComposition(
          COORD_C,
          bogotaToday(),
        );
        expect(kpiAfter.activeCount).toBe(kpiBefore.activeCount - 1);
        const cancelled = (
          await overviewRepository.aggregateCancelledByCoordination()
        ).find((r) => r.coordinationId === COORD_C);
        expect(cancelled?.total).toBeGreaterThanOrEqual(1);
        // Tampoco cuenta como resolución.
        const resolution = new OperationalKpiResolutionRepository(
          ds.getRepository(Situation),
        );
        const summary = await resolution.aggregateSummary(
          COORD_C,
          bogotaToday(),
          bogotaToday(),
        );
        expect(summary.closedCount).toBe(0);
      });
    });

    describe('auditoría', () => {
      it('si la auditoría no se puede persistir, la anulación no se confirma', async () => {
        const created = await createInternal();
        // Fallo REAL en la base, solo para esta acción y solo en esta prueba.
        await ds.query(`
        CREATE OR REPLACE FUNCTION it_01b_fail_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'auditoría caída (prueba)'; END; $$
      `);
        await ds.query(`
        CREATE TRIGGER it_01b_fail_audit BEFORE INSERT ON audit_logs
        FOR EACH ROW WHEN (NEW.action = 'SITUATION_CANCELLED')
        EXECUTE FUNCTION it_01b_fail_audit()
      `);
        try {
          await expect(
            administration.cancel(created.id, { reason: REASON }, admin),
          ).rejects.toThrow(/auditoría caída/);
        } finally {
          await ds.query(
            `DROP TRIGGER IF EXISTS it_01b_fail_audit ON audit_logs`,
          );
          await ds.query(`DROP FUNCTION IF EXISTS it_01b_fail_audit()`);
        }

        expect((await row(created.id)).status).toBe(SituationStatus.OPEN);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_cancellations WHERE situation_id = $1`,
            [created.id],
          ),
        ).toBe(0);
      });

      it('si falla auditoría de escalada, revierte severidad, historial, timeline y cierre', async () => {
        const created = await createInternal(SituationSeverity.MEDIUM);
        await ds.query(
          `UPDATE situations SET created_at = now() - interval '3 days',
             severity_escalation_policy_code = $2 WHERE id = $1`,
          [created.id, TEST_ESCALATION_POLICY.code],
        );
        await ds.query(`
          CREATE OR REPLACE FUNCTION it_01b_fail_escalation_audit() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo auditoría de escalada'; END; $$
        `);
        await ds.query(`
          CREATE TRIGGER it_01b_fail_escalation_audit BEFORE INSERT ON audit_logs
          FOR EACH ROW WHEN (NEW.action = 'SITUATION_SEVERITY_ESCALATED')
          EXECUTE FUNCTION it_01b_fail_escalation_audit()
        `);
        try {
          await expect(
            situations.resolve(
              created.id,
              { learning: 'Aprendizaje válido' },
              coordinatorA,
            ),
          ).rejects.toThrow(/fallo auditoría de escalada/);
        } finally {
          await ds.query(
            `DROP TRIGGER IF EXISTS it_01b_fail_escalation_audit ON audit_logs`,
          );
          await ds.query(
            `DROP FUNCTION IF EXISTS it_01b_fail_escalation_audit()`,
          );
        }
        const current = await row(created.id);
        expect(current.status).toBe(SituationStatus.OPEN);
        const severity = await ds.query<Array<{ severity: string }>>(
          `SELECT severity::text AS severity FROM situations WHERE id = $1`,
          [created.id],
        );
        expect(severity[0].severity).toBe(SituationSeverity.MEDIUM);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_severity_changes WHERE situation_id = $1 AND source = $2`,
            [created.id, SituationSeverityChangeSource.AUTO_TIME],
          ),
        ).toBe(0);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_resolutions WHERE situation_id = $1`,
            [created.id],
          ),
        ).toBe(0);
        expect(
          await count(
            `SELECT count(*) AS n FROM situation_timeline_entries WHERE situation_id = $1 AND event_type = 'SEVERITY_ESCALATED'`,
            [created.id],
          ),
        ).toBe(0);
        expect(
          await count(
            `SELECT count(*) AS n FROM audit_logs WHERE resource_id = $1 AND action = 'SITUATION_SEVERITY_ESCALATED'`,
            [created.id],
          ),
        ).toBe(0);
      });

      it('audit_logs, anulaciones y traslados rechazan UPDATE/DELETE/TRUNCATE como propietario', async () => {
        const created = await createInternal();
        await administration.transferCoordination(
          created.id,
          {
            toCoordinationId: COORD_B,
            reason: 'Traslado para prueba de inmutabilidad',
          },
          admin,
        );
        await administration.cancel(created.id, { reason: REASON }, admin);
        const [{ id }] = await ds.query<Array<{ id: string }>>(
          `SELECT id FROM audit_logs WHERE resource_id = $1 LIMIT 1`,
          [created.id],
        );
        const ownerRole =
          process.env.NOVEX_HISTORY_OWNER_ROLE ?? 'novex_history_owner';
        const appRole = process.env.NOVEX_APP_DB_ROLE ?? 'novex_app';
        const attempts = [
          [`UPDATE audit_logs SET action = 'X' WHERE id = $1`, [id]],
          [`DELETE FROM audit_logs WHERE id = $1`, [id]],
          [`TRUNCATE audit_logs`, []],
          [
            `UPDATE situation_cancellations SET reason = 'alterado' WHERE situation_id = $1`,
            [created.id],
          ],
          [
            `DELETE FROM situation_cancellations WHERE situation_id = $1`,
            [created.id],
          ],
          [`TRUNCATE situation_cancellations`, []],
          [
            `UPDATE situation_coordination_transfers SET reason = 'alterado' WHERE situation_id = $1`,
            [created.id],
          ],
          [
            `DELETE FROM situation_coordination_transfers WHERE situation_id = $1`,
            [created.id],
          ],
          [`TRUNCATE situation_coordination_transfers`, []],
        ] as const;
        for (const [sql, params] of attempts) {
          await expect(runAsRole(ownerRole, sql, [...params])).rejects.toThrow(
            /inmutable/,
          );
        }
        for (const [sql, params] of attempts) {
          await expect(runAsRole(appRole, sql, [...params])).rejects.toThrow(
            /permission denied/,
          );
        }
      });
    });

    it('rollback de traslados aborta con historial y elimina tabla vacía', async () => {
      const migration = new AddSituationCoordinationTransfers1788400000000();
      const schemaWithHistory = 'it_transfer_rollback_data';
      await ds.query(`DROP SCHEMA IF EXISTS "${schemaWithHistory}" CASCADE`);
      await ds.query(`CREATE SCHEMA "${schemaWithHistory}"`);
      await ds.query(
        `CREATE TABLE "${schemaWithHistory}".situation_coordination_transfers (id int)`,
      );
      await ds.query(
        `INSERT INTO "${schemaWithHistory}".situation_coordination_transfers VALUES (1)`,
      );
      const historyRunner = ds.createQueryRunner();
      await historyRunner.connect();
      await historyRunner.startTransaction();
      await historyRunner.query(
        `SET LOCAL search_path TO "${schemaWithHistory}"`,
      );
      await expect(migration.down(historyRunner)).rejects.toThrow(
        /hay historial de traslados/,
      );
      await expect(
        historyRunner.query(
          `SELECT count(*) FROM situation_coordination_transfers`,
        ),
      ).resolves.toBeDefined();
      await historyRunner.rollbackTransaction();
      await historyRunner.release();
      await ds.query(`DROP SCHEMA "${schemaWithHistory}" CASCADE`);

      const schemaEmpty = 'it_transfer_rollback_empty';
      await ds.query(`DROP SCHEMA IF EXISTS "${schemaEmpty}" CASCADE`);
      await ds.query(`CREATE SCHEMA "${schemaEmpty}"`);
      await ds.query(
        `CREATE TABLE "${schemaEmpty}".situation_coordination_transfers (id int)`,
      );
      const emptyRunner = ds.createQueryRunner();
      await emptyRunner.connect();
      await emptyRunner.startTransaction();
      await emptyRunner.query(`SET LOCAL search_path TO "${schemaEmpty}"`);
      await migration.down(emptyRunner);
      const missing = (await emptyRunner.query(
        `SELECT to_regclass('situation_coordination_transfers') AS table_name`,
      )) as Array<{ table_name: string | null }>;
      expect(missing[0].table_name).toBeNull();
      await emptyRunner.commitTransaction();
      await emptyRunner.release();
      await ds.query(`DROP SCHEMA "${schemaEmpty}" CASCADE`);
    });

    describe('compatibilidad histórica', () => {
      it('un registro legado RESOLVED sin responsable recibe traslado y se anula', async () => {
        const [{ id }] = await ds.query<Array<{ id: string }>>(
          `INSERT INTO situations (title, description, coordination_id, created_by_user_id,
           category_id, severity, status, occurred_at, report_kind)
         VALUES ('legado', 'histórico', NULL, $1, $2, 'MEDIUM', 'RESOLVED', now() - interval '30 days', 'INTERNAL')
         RETURNING id`,
          [U_COORD_A, CAT],
        );

        await administration.transferCoordination(
          id,
          { toCoordinationId: COORD_A, reason: 'Asignación de responsable' },
          admin,
        );
        expect((await row(id)).coordination_id).toBe(COORD_A);

        const detail = await administration.cancel(
          id,
          { reason: REASON },
          admin,
        );
        expect(detail.cancellation?.previousStatus).toBe(
          SituationStatus.RESOLVED,
        );
      });
    });
  },
);
