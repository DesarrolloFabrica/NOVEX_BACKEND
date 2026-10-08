import { ConflictException } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationSeverity,
} from '../common/enums/situation.enums';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { SituationTimelineRepository } from '../situation-timeline/repositories/situation-timeline.repository';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { SituationTimelineSubscriber } from '../situation-timeline/subscribers/situation-timeline.subscriber';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { User } from '../users/entities/user.entity';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationResolution } from './entities/situation-resolution.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SituationConsequencesService } from './situation-consequences.service';
import { SLA_WINDOWS_BY_SEVERITY } from './situation-sla.policy';
import { SituationsService } from './situations.service';
import type { SeverityEscalationPolicy } from './severity-escalation/severity-escalation.policy';
import { SeverityEscalationService } from './severity-escalation/severity-escalation.service';
import { checkSeverityHistoryInvariants } from './severity-escalation/severity-history';
import {
  SITUATION_SWEEP_LOCK_KEY,
  SituationSweepService,
} from './sweep/situation-sweep.service';

/**
 * INTERNAL VIVO contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1). BD local de
 * .env, nunca la de nube. Servicios REALES (sin Nest), auditoría inerte.
 *
 *   NOVEX_PG_IT=1 npx jest src/situations/internal-vivo.pg.spec.ts
 *
 * Fixtures propias (coordinación, categoría y usuarios `it-vivo-*`) que se
 * borran al final. Nota: el barrido recorre TODA la base, igual que el cron
 * que ya corre en local; sobre los datos QA hace lo mismo que haría él.
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const COORD = '7c000000-0000-4000-8000-0000000000a1';
const CAT = '7c000000-0000-4000-8000-0000000000c1';
const U_COORD = '7c000000-0000-4000-8000-0000000000e1';
const ROLE_COORD_CODE = 'COORDINADOR';

/** Política QA SOLO para esta prueba: pasos a +3 d y +6 d. */
const QA_POLICY: SeverityEscalationPolicy = {
  code: 'qa-pg-it',
  schedule: ({ reportedSeverity, createdAt }) => {
    const order = [
      SituationSeverity.LOW,
      SituationSeverity.MEDIUM,
      SituationSeverity.HIGH,
      SituationSeverity.CRITICAL,
    ];
    const start = order.indexOf(reportedSeverity);
    return order.slice(start + 1, start + 3).map((toSeverity, i) => ({
      ruleKey: `step-${i + 1}`,
      toSeverity,
      effectiveAt: new Date(createdAt.getTime() + (i + 1) * 3 * DAY),
    }));
  },
};

suite('INTERNAL vivo · Postgres real', () => {
  let ds: DataSource;
  let situations: SituationsService;
  let consequences: SituationConsequencesService;
  let sweep: SituationSweepService;
  const coordinator: AuthPayload = {
    sub: U_COORD,
    email: 'it-vivo-coord@cun.edu.co',
    roleId: 'x',
    roleCode: ROLE_COORD_CODE,
    coordinationId: COORD,
    permissions: [
      'SITUATIONS_VIEW',
      'SITUATIONS_CREATE',
      'SITUATIONS_UPDATE',
      'SITUATIONS_CLOSE',
    ],
    status: UserStatus.ACTIVE,
  };

  beforeAll(async () => {
    if ((process.env.DB_CLOUD ?? 'false') === 'true') {
      throw new Error('Esta suite solo corre contra la BD local.');
    }
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST_LOCAL ?? process.env.DB_HOST,
      port: Number(process.env.DB_PORT_LOCAL ?? process.env.DB_PORT),
      username: process.env.DB_USERNAME_LOCAL ?? process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD_LOCAL ?? process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE_LOCAL ?? process.env.DB_DATABASE,
      entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    });
    await ds.initialize();

    await cleanup();
    await ds.query(
      `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
       VALUES ($1, 'it-vivo', 'IT Vivo', 'IT', '#000000', 'x', 'x')`,
      [COORD],
    );
    await ds.query(
      `INSERT INTO incident_categories (id, code, name, is_selectable, icon)
       VALUES ($1, 'IT_VIVO', 'IT Vivo', true, 'apps')`,
      [CAT],
    );
    await ds.query(
      `INSERT INTO users (id, email, full_name, role_id, coordination_id)
       SELECT $1, 'it-vivo-coord@cun.edu.co', 'IT Coordinador', id, $2
       FROM roles WHERE code = $3`,
      [U_COORD, COORD, ROLE_COORD_CODE],
    );

    const timelineService = new SituationTimelineService(
      new SituationTimelineRepository(ds),
      ds.getRepository(Situation),
    );
    // El subscriber escribe SITUATION_CREATED dentro de la transacción del alta.
    new SituationTimelineSubscriber(ds, timelineService);
    const audit = { record: jest.fn().mockResolvedValue(null) };
    const escalation = new SeverityEscalationService(
      [QA_POLICY],
      timelineService,
      audit as never,
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
      audit as never,
      escalation,
    );
    consequences = new SituationConsequencesService(
      situationsRepository,
      new OperationalScopeService(),
      timelineService,
      audit as never,
      escalation,
    );
    sweep = new SituationSweepService(ds, timelineService, escalation);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await cleanup();
      await ds.destroy();
    }
  });

  async function cleanup() {
    await ds.query(`DELETE FROM situations WHERE coordination_id = $1`, [
      COORD,
    ]);
    await ds.query(`DELETE FROM users WHERE id = $1`, [U_COORD]);
    await ds.query(`DELETE FROM incident_categories WHERE id = $1`, [CAT]);
    await ds.query(`DELETE FROM coordinations WHERE id = $1`, [COORD]);
  }

  const createInternal = (initial?: string) =>
    situations.create(
      {
        title: 'IT vivo',
        description: 'Problema de prueba',
        reportKind: SituationReportKind.INTERNAL,
        coordinationId: COORD,
        categoryId: CAT,
        severity: SituationSeverity.MEDIUM,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        initialConsequence: initial ? { description: initial } : undefined,
      },
      coordinator,
    );

  it('alta: mismo instante en created_at, due_at y REPORTED; afectación inicial en la transacción', async () => {
    const created = await createInternal('Retraso de entregas');
    const [row] = (await ds.query(
      `SELECT s.created_at, s.due_at, c.effective_at, q.created_at AS q_created
       FROM situations s
       JOIN situation_severity_changes c ON c.situation_id = s.id
       JOIN situation_consequences q ON q.situation_id = s.id
       WHERE s.id = $1`,
      [created.id],
    )) as Array<Record<string, Date>>;

    expect(row.created_at.getTime()).toBe(row.effective_at.getTime());
    expect(row.q_created.getTime()).toBe(row.created_at.getTime());
    expect(row.due_at.getTime() - row.created_at.getTime()).toBe(
      SLA_WINDOWS_BY_SEVERITY[SituationSeverity.MEDIUM].dueMs,
    );
    const events = (await ds.query(
      `SELECT event_type FROM situation_timeline_entries WHERE situation_id = $1 ORDER BY created_at`,
      [created.id],
    )) as Array<{ event_type: string }>;
    expect(events.map((e) => e.event_type)).toEqual([
      'SITUATION_CREATED',
      'CONSEQUENCE_ADDED',
    ]);
  });

  it('ATOMICIDAD: una afectación inválida para la base revierte la situación entera', async () => {
    const before = (await ds.query(
      `SELECT count(*)::int AS n FROM situations WHERE coordination_id = $1`,
      [COORD],
    )) as Array<{ n: number }>;
    // 2001 caracteres: el DTO lo frena antes, aquí se fuerza el CHECK de la base.
    await expect(createInternal('x'.repeat(2001))).rejects.toBeDefined();
    const after = (await ds.query(
      `SELECT count(*)::int AS n FROM situations WHERE coordination_id = $1`,
      [COORD],
    )) as Array<{ n: number }>;
    expect(after[0].n).toBe(before[0].n);
  });

  it('CONCURRENCIA: afectación y cierre simultáneos se serializan con FOR UPDATE', async () => {
    for (let i = 0; i < 6; i += 1) {
      const created = await createInternal();
      const [add, resolve] = await Promise.allSettled([
        consequences.addConsequence(
          created.id,
          { description: `carrera ${i}` },
          coordinator,
        ),
        situations.resolve(
          created.id,
          { learning: 'Aprendizaje' },
          coordinator,
        ),
      ]);
      expect(resolve.status).toBe('fulfilled');
      if (add.status === 'rejected') {
        expect(add.reason).toBeInstanceOf(ConflictException);
      }
      const [check] = (await ds.query(
        `SELECT count(*) FILTER (WHERE q.created_at > s.closed_at)::int AS late,
                count(q.id)::int AS total
         FROM situations s LEFT JOIN situation_consequences q ON q.situation_id = s.id
         WHERE s.id = $1`,
        [created.id],
      )) as Array<{ late: number; total: number }>;
      expect(check.late).toBe(0);
      expect(check.total).toBe(add.status === 'fulfilled' ? 1 : 0);
    }
  });

  it('APPEND-ONLY en la base: UPDATE de una afectación es rechazado', async () => {
    const created = await createInternal('original');
    await expect(
      ds.query(
        `UPDATE situation_consequences SET description = 'editada' WHERE situation_id = $1`,
        [created.id],
      ),
    ).rejects.toThrow(/append-only/);
  });

  describe('barrido', () => {
    async function insertSituation(input: {
      createdAt: Date;
      dueAt: Date;
      reported: SituationSeverity;
      severity?: SituationSeverity;
      policy?: string | null;
    }): Promise<string> {
      const [row] = (await ds.query(
        `INSERT INTO situations (title, description, coordination_id, affected_coordination_id,
           created_by_user_id, category_id, severity, reported_severity, status, occurred_at,
           created_at, due_at, sla_policy_code, report_kind, severity_escalation_policy_code)
         VALUES ('IT sweep', 'd', $1, $1, $2, $3, $4, $5, 'OPEN', $6, $6, $7, 'severity-v1',
           'INTERNAL', $8)
         RETURNING id`,
        [
          COORD,
          U_COORD,
          CAT,
          input.severity ?? input.reported,
          input.reported,
          input.createdAt,
          input.dueAt,
          input.policy ?? null,
        ],
      )) as Array<{ id: string }>;
      await ds.query(
        `INSERT INTO situation_severity_changes (situation_id, new_severity, source, effective_at, actor_user_id)
         VALUES ($1, $2, 'REPORTED', $3, $4)`,
        [row.id, input.reported, input.createdAt, U_COORD],
      );
      return row.id;
    }

    it('aviso con la ventana de la severidad REPORTADA, vencimiento condicional e idempotencia', async () => {
      const now = new Date();
      // Reportado MEDIUM (aviso 48 h) aunque hoy figure HIGH (aviso 24 h):
      // vence en 30 h → solo avisa si usa la reportada.
      const warn = await insertSituation({
        createdAt: new Date(now.getTime() - 5 * DAY),
        dueAt: new Date(now.getTime() + 30 * 60 * 60 * 1000),
        reported: SituationSeverity.MEDIUM,
        severity: SituationSeverity.HIGH,
      });
      const due = new Date(now.getTime() - 60 * 60 * 1000);
      const breach = await insertSituation({
        createdAt: new Date(now.getTime() - 8 * DAY),
        dueAt: due,
        reported: SituationSeverity.MEDIUM,
      });

      await sweep.run(now);
      await sweep.run(now); // repetir no duplica

      const rows = (await ds.query(
        `SELECT id, sla_breached_at, last_sla_reminder_at, due_at FROM situations WHERE id = ANY($1)`,
        [[warn, breach]],
      )) as Array<{
        id: string;
        sla_breached_at: Date | null;
        last_sla_reminder_at: Date | null;
        due_at: Date;
      }>;
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get(warn)!.last_sla_reminder_at).not.toBeNull();
      expect(byId.get(breach)!.sla_breached_at!.getTime()).toBe(due.getTime());

      const events = (await ds.query(
        `SELECT situation_id, event_type, count(*)::int AS n FROM situation_timeline_entries
         WHERE situation_id = ANY($1) GROUP BY 1, 2`,
        [[warn, breach]],
      )) as Array<{ situation_id: string; event_type: string; n: number }>;
      expect(events).toEqual(
        expect.arrayContaining([
          { situation_id: warn, event_type: 'SLA_WARNING', n: 1 },
          { situation_id: breach, event_type: 'SLA_BREACHED', n: 1 },
        ]),
      );
    });

    it('escalamiento con política QA: historial coherente, due_at intacto, idempotente; sin política no escala', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 7 * DAY);
      const dueAt = new Date(createdAt.getTime() + 7 * DAY);
      const withPolicy = await insertSituation({
        createdAt,
        dueAt,
        reported: SituationSeverity.MEDIUM,
        policy: QA_POLICY.code,
      });
      const withoutPolicy = await insertSituation({
        createdAt,
        dueAt,
        reported: SituationSeverity.MEDIUM,
      });

      await sweep.run(now);
      await sweep.run(now);

      const [escalated] = (await ds.query(
        `SELECT severity, reported_severity, due_at, closed_at FROM situations WHERE id = $1`,
        [withPolicy],
      )) as Array<Record<string, unknown>>;
      expect(escalated.severity).toBe(SituationSeverity.CRITICAL);
      expect(escalated.reported_severity).toBe(SituationSeverity.MEDIUM);
      expect((escalated.due_at as Date).getTime()).toBe(dueAt.getTime());

      const history = (await ds.query(
        `SELECT id, previous_severity AS "previousSeverity", new_severity AS "newSeverity",
                source, effective_at AS "effectiveAt", created_at AS "createdAt"
         FROM situation_severity_changes WHERE situation_id = $1`,
        [withPolicy],
      )) as never[];
      expect(history).toHaveLength(3);
      expect(
        checkSeverityHistoryInvariants({
          reportedSeverity: SituationSeverity.MEDIUM,
          severity: SituationSeverity.CRITICAL,
          closedAt: null,
          history,
        }),
      ).toEqual([]);

      const [plain] = (await ds.query(
        `SELECT severity, (SELECT count(*)::int FROM situation_severity_changes WHERE situation_id = $1) AS n
         FROM situations WHERE id = $1`,
        [withoutPolicy],
      )) as Array<{ severity: string; n: number }>;
      expect(plain).toEqual({ severity: SituationSeverity.MEDIUM, n: 1 });
    });

    it('lock advisory: si otra instancia barre, esta llamada no hace nada', async () => {
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT pg_advisory_xact_lock($1)', [
          SITUATION_SWEEP_LOCK_KEY,
        ]);
        const result = await sweep.run(new Date());
        expect(result).toEqual({
          acquired: false,
          breached: 0,
          warned: 0,
          escalated: 0,
        });
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });
});
