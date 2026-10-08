import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import {
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../../common/enums/situation.enums';
import { AuditAction } from '../../audit/audit-action.enum';
import { SituationSeverityChange } from '../entities/situation-severity-change.entity';
import { Situation } from '../entities/situation.entity';
import {
  ACTIVE_SEVERITY_ESCALATION_POLICY_CODE,
  planDueEscalations,
  PRODUCTION_SEVERITY_ESCALATION_POLICIES,
  type SeverityEscalationPolicy,
} from './severity-escalation.policy';
import { SeverityEscalationService } from './severity-escalation.service';
import {
  checkSeverityHistoryInvariants,
  severityAt,
  type SeverityHistoryRow,
} from './severity-history';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-10-01T15:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

/**
 * POLÍTICA QA SOLO PARA TESTS. No representa ningún umbral aprobado: existe
 * para ejercitar el motor (pasos a +3 d y +6 d).
 */
const QA_TEST_POLICY: SeverityEscalationPolicy = {
  code: 'qa-test-only',
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

describe('Escalamiento de severidad · estado productivo', () => {
  it('no hay ninguna política productiva activa', () => {
    expect(PRODUCTION_SEVERITY_ESCALATION_POLICIES).toHaveLength(0);
    expect(ACTIVE_SEVERITY_ESCALATION_POLICY_CODE).toBeNull();
  });
});

describe('planDueEscalations', () => {
  const base = {
    policy: QA_TEST_POLICY,
    reportedSeverity: SituationSeverity.MEDIUM,
    createdAt: T0,
    closedAt: null,
    existingRuleKeys: new Set<string>(),
  };

  it('nada antes del primer umbral', () => {
    expect(planDueEscalations({ ...base, now: at(2.9) })).toEqual([]);
  });

  it('encadena desde la reportada y fecha cada paso por la regla, no por el barrido', () => {
    const plan = planDueEscalations({ ...base, now: at(10) });
    expect(
      plan.map((p) => [p.fromSeverity, p.toSeverity, p.effectiveAt]),
    ).toEqual([
      [SituationSeverity.MEDIUM, SituationSeverity.HIGH, at(3)],
      [SituationSeverity.HIGH, SituationSeverity.CRITICAL, at(6)],
    ]);
  });

  it('idempotente: no repite pasos ya registrados', () => {
    const plan = planDueEscalations({
      ...base,
      now: at(10),
      existingRuleKeys: new Set(['step-1']),
    });
    expect(plan.map((p) => p.ruleKey)).toEqual(['step-2']);
    expect(plan[0].fromSeverity).toBe(SituationSeverity.HIGH);
  });

  it('el horizonte es closed_at: nada rige después del cierre', () => {
    const plan = planDueEscalations({ ...base, closedAt: at(4), now: at(10) });
    expect(plan.map((p) => p.ruleKey)).toEqual(['step-1']);
  });

  it('rechaza una política que no sube de nivel', () => {
    const broken: SeverityEscalationPolicy = {
      code: 'broken',
      schedule: () => [
        { ruleKey: 'a', toSeverity: SituationSeverity.LOW, effectiveAt: at(1) },
      ],
    };
    expect(() =>
      planDueEscalations({ ...base, policy: broken, now: at(5) }),
    ).toThrow(/inválida/);
  });
});

describe('severityAt / invariantes del historial', () => {
  const rows: SeverityHistoryRow[] = [
    {
      id: '1',
      previousSeverity: null,
      newSeverity: SituationSeverity.MEDIUM,
      source: SituationSeverityChangeSource.REPORTED,
      effectiveAt: T0,
      createdAt: T0,
    },
    {
      id: '2',
      previousSeverity: SituationSeverity.MEDIUM,
      newSeverity: SituationSeverity.HIGH,
      source: SituationSeverityChangeSource.AUTO_TIME,
      effectiveAt: at(3),
      createdAt: at(3.1),
    },
  ];

  it('devuelve el nivel vigente en cada instante', () => {
    expect(severityAt(rows, at(1))).toBe(SituationSeverity.MEDIUM);
    expect(severityAt(rows, at(3))).toBe(SituationSeverity.HIGH);
    // Antes del alta (afectación declarada antes del registro): la reportada.
    expect(severityAt(rows, at(-1))).toBe(SituationSeverity.MEDIUM);
  });

  it('historial coherente → sin violaciones', () => {
    expect(
      checkSeverityHistoryInvariants({
        reportedSeverity: SituationSeverity.MEDIUM,
        severity: SituationSeverity.HIGH,
        closedAt: at(5),
        history: rows,
      }),
    ).toEqual([]);
  });

  it('detecta caché desalineada, reportada distinta y escalamiento tras cierre', () => {
    expect(
      checkSeverityHistoryInvariants({
        reportedSeverity: SituationSeverity.LOW,
        severity: SituationSeverity.CRITICAL,
        closedAt: at(2),
        history: rows,
      }).sort(),
    ).toEqual([
      'CURRENT_MISMATCH',
      'ESCALATION_AFTER_CLOSE',
      'REPORTED_MISMATCH',
    ]);
  });

  it('detecta ausencia de REPORTED', () => {
    expect(
      checkSeverityHistoryInvariants({
        reportedSeverity: SituationSeverity.MEDIUM,
        severity: SituationSeverity.MEDIUM,
        closedAt: null,
        history: [],
      }),
    ).toEqual(['NO_REPORTED_ROW']);
  });
});

describe('SeverityEscalationService.materializeDueEscalations', () => {
  function situation(over: Partial<Situation> = {}): Situation {
    return {
      id: 'sit-1',
      severity: SituationSeverity.MEDIUM,
      reportedSeverity: SituationSeverity.MEDIUM,
      severityEscalationPolicyCode: QA_TEST_POLICY.code,
      createdAt: T0,
      closedAt: null,
      dueAt: new Date(T0.getTime() + 7 * DAY),
      ...over,
    } as unknown as Situation;
  }

  function harness(options: { conflictOn?: string[] } = {}) {
    const inserted: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const qb = {
      insert() {
        return this;
      },
      into() {
        return this;
      },
      valuesOf: null as Record<string, unknown> | null,
      values(v: Record<string, unknown>) {
        this.valuesOf = v;
        return this;
      },
      update() {
        return this;
      },
      set(values: Record<string, unknown>) {
        updates.push(values);
        return this;
      },
      where() {
        return this;
      },
      orIgnore() {
        return this;
      },
      returning() {
        return this;
      },
      callListeners(flag: boolean) {
        expect(flag).toBe(false);
        return this;
      },
      execute: jest.fn(async () => {
        if (qb.valuesOf) {
          const row = qb.valuesOf;
          qb.valuesOf = null;
          if (options.conflictOn?.includes(row.ruleKey as string)) {
            return { raw: [] };
          }
          inserted.push(row);
          return { raw: [{ id: `chg-${inserted.length}` }] };
        }
        return { raw: [] };
      }),
    };

    const manager = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => qb),
    };
    const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const service = new SeverityEscalationService(
      [QA_TEST_POLICY],
      timelineService as never,
      auditLogService as never,
    );
    return {
      service,
      manager,
      inserted,
      updates,
      timelineService,
      auditLogService,
    };
  }

  it('policy_code NULL → no-op total (el estado de hoy)', async () => {
    const h = harness();
    const result = await h.service.materializeDueEscalations({
      manager: h.manager as never,
      situation: situation({ severityEscalationPolicyCode: null }),
      now: at(30),
    });
    expect(result).toEqual([]);
    expect(h.manager.find).not.toHaveBeenCalled();
    expect(h.manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('política desconocida → no-op (no escala con reglas que no existen)', async () => {
    const h = harness();
    const result = await h.service.materializeDueEscalations({
      manager: h.manager as never,
      situation: situation({ severityEscalationPolicyCode: 'escalation-v9' }),
      now: at(30),
    });
    expect(result).toEqual([]);
  });

  it('escribe AUTO_TIME + severidad efectiva + SEVERITY_ESCALATED, y NO toca due_at', async () => {
    const h = harness();
    const target = situation();
    const dueBefore = target.dueAt;

    const result = await h.service.materializeDueEscalations({
      manager: h.manager as never,
      situation: target,
      now: at(7),
    });

    expect(
      h.inserted.map((r) => [r.previousSeverity, r.newSeverity, r.ruleKey]),
    ).toEqual([
      [SituationSeverity.MEDIUM, SituationSeverity.HIGH, 'step-1'],
      [SituationSeverity.HIGH, SituationSeverity.CRITICAL, 'step-2'],
    ]);
    expect(
      h.inserted.every(
        (r) => r.source === SituationSeverityChangeSource.AUTO_TIME,
      ),
    ).toBe(true);
    expect(h.inserted[0].effectiveAt).toEqual(at(3));
    // Solo se actualiza la severidad: ni due_at ni ninguna otra columna.
    expect(h.updates).toEqual([
      { severity: SituationSeverity.HIGH },
      { severity: SituationSeverity.CRITICAL },
    ]);
    expect(target.severity).toBe(SituationSeverity.CRITICAL);
    expect(target.dueAt).toBe(dueBefore);
    expect(h.timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TimelineEventType.SEVERITY_ESCALATED,
      }),
      h.manager,
    );
    expect(result).toHaveLength(2);

    await h.service.recordAudit(result);
    expect(h.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: AuditAction.SITUATION_SEVERITY_ESCALATED,
      }),
    );
  });

  it('carrera con otro barrido: ON CONFLICT DO NOTHING → no actualiza ni emite evento', async () => {
    const h = harness({ conflictOn: ['step-1'] });
    const target = situation();
    const result = await h.service.materializeDueEscalations({
      manager: h.manager as never,
      situation: target,
      now: at(4),
    });
    expect(result).toEqual([]);
    expect(h.updates).toEqual([]);
    expect(h.timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('respeta lo ya registrado (idempotencia por rule_key)', async () => {
    const h = harness();
    h.manager.find.mockResolvedValue([{ id: 'x', ruleKey: 'step-1' }]);
    await h.service.materializeDueEscalations({
      manager: h.manager as never,
      situation: situation({ severity: SituationSeverity.HIGH }),
      now: at(7),
    });
    expect(h.inserted.map((r) => r.ruleKey)).toEqual(['step-2']);
    expect(h.manager.find).toHaveBeenCalledWith(
      SituationSeverityChange,
      expect.objectContaining({
        where: expect.objectContaining({ policyCode: QA_TEST_POLICY.code }),
      }),
    );
  });
});
