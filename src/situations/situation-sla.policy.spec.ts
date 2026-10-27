import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import {
  computeDueAt,
  computeSlaHealth,
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
    expect(computeSlaHealth(dueAt, SituationStatus.CLOSED, new Date())).toBe(
      'closed',
    );
  });

  it('la ventana de aviso sale de la severidad REPORTADA, no de la efectiva', () => {
    // Reportado MEDIUM (aviso 48 h) aunque hoy sea HIGH (aviso 24 h).
    const dueAt = computeDueAt(SituationSeverity.MEDIUM, base);
    const thirtyHoursBefore = new Date(dueAt.getTime() - 30 * 60 * 60 * 1000);

    expect(
      computeSlaHealth(
        dueAt,
        SituationStatus.OPEN,
        thirtyHoursBefore,
        SituationSeverity.MEDIUM,
      ),
    ).toBe('at_risk');
    // Con la ventana de HIGH el mismo instante seguiría on_track: ese es el
    // resultado que el diseño evita al pasar siempre la reportada.
    expect(
      computeSlaHealth(
        dueAt,
        SituationStatus.OPEN,
        thirtyHoursBefore,
        SituationSeverity.HIGH,
      ),
    ).toBe('on_track');
  });

  it('due_at − created_at es exactamente la ventana de la severidad reportada', () => {
    for (const [severity, hours] of [
      [SituationSeverity.CRITICAL, 24],
      [SituationSeverity.HIGH, 72],
      [SituationSeverity.MEDIUM, 7 * 24],
      [SituationSeverity.LOW, 14 * 24],
    ] as const) {
      expect(computeDueAt(severity, base).getTime() - base.getTime()).toBe(
        hours * 60 * 60 * 1000,
      );
    }
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
