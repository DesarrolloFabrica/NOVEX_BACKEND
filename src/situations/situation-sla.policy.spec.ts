import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import {
  computeDueAt,
  computeSlaHealth,
  resolveDueAtOnSeverityChange,
  wasClosedOnTime,
} from './situation-sla.policy';

describe('situation-sla.policy', () => {
  const base = new Date('2026-08-01T12:00:00.000Z');

  it('calcula dueAt por severidad desde el registro', () => {
    expect(computeDueAt(SituationSeverity.CRITICAL, base).toISOString()).toBe(
      '2026-08-02T12:00:00.000Z',
    );
    expect(computeDueAt(SituationSeverity.HIGH, base).toISOString()).toBe(
      '2026-08-04T12:00:00.000Z',
    );
    expect(computeDueAt(SituationSeverity.MEDIUM, base).toISOString()).toBe(
      '2026-08-08T12:00:00.000Z',
    );
    expect(computeDueAt(SituationSeverity.LOW, base).toISOString()).toBe(
      '2026-08-15T12:00:00.000Z',
    );
  });

  it('marca at_risk dentro de la ventana de aviso y overdue tras dueAt', () => {
    const dueAt = computeDueAt(SituationSeverity.CRITICAL, base);
    expect(
      computeSlaHealth(
        dueAt,
        SituationStatus.OPEN,
        new Date('2026-08-02T08:00:00.000Z'),
        SituationSeverity.CRITICAL,
      ),
    ).toBe('at_risk');
    expect(
      computeSlaHealth(
        dueAt,
        SituationStatus.IN_PROGRESS,
        new Date('2026-08-02T13:00:00.000Z'),
        SituationSeverity.CRITICAL,
      ),
    ).toBe('overdue');
    expect(
      computeSlaHealth(dueAt, SituationStatus.CLOSED, new Date()),
    ).toBe('closed');
  });

  it('no relaja un dueAt ya vencido al bajar severidad', () => {
    const currentDueAt = computeDueAt(SituationSeverity.CRITICAL, base);
    const now = new Date('2026-08-03T12:00:00.000Z');
    const next = resolveDueAtOnSeverityChange({
      previousSeverity: SituationSeverity.CRITICAL,
      nextSeverity: SituationSeverity.LOW,
      status: SituationStatus.OPEN,
      createdAt: base,
      currentDueAt,
      now,
    });
    expect(next?.toISOString()).toBe(currentDueAt.toISOString());
  });

  it('recalcula dueAt al subir severidad en un caso activo', () => {
    const currentDueAt = computeDueAt(SituationSeverity.LOW, base);
    const next = resolveDueAtOnSeverityChange({
      previousSeverity: SituationSeverity.LOW,
      nextSeverity: SituationSeverity.CRITICAL,
      status: SituationStatus.OPEN,
      createdAt: base,
      currentDueAt,
      now: new Date('2026-08-01T13:00:00.000Z'),
    });
    expect(next?.toISOString()).toBe(
      computeDueAt(SituationSeverity.CRITICAL, base).toISOString(),
    );
  });

  it('detecta cierre a tiempo', () => {
    const dueAt = new Date('2026-08-02T12:00:00.000Z');
    expect(wasClosedOnTime(dueAt, new Date('2026-08-02T11:00:00.000Z'))).toBe(
      true,
    );
    expect(wasClosedOnTime(dueAt, new Date('2026-08-02T13:00:00.000Z'))).toBe(
      false,
    );
  });
});
