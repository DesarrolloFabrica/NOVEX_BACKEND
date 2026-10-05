import { OperationalKpiHistoryGranularity } from '../dto/operational-kpi-history-query.dto';
import { buildCurrentAnalysisPeriod } from './kpi-analysis-period';

describe('buildCurrentAnalysisPeriod', () => {
  it('semana: lunes → domingo, to=hoy si incompleta', () => {
    // Miércoles 1 oct 2025 Bogotá
    const period = buildCurrentAnalysisPeriod(
      OperationalKpiHistoryGranularity.WEEK,
      new Date('2025-10-01T15:00:00-05:00'),
    );
    expect(period.from).toBe('2025-09-29');
    expect(period.calendarEnd).toBe('2025-10-05');
    expect(period.to).toBe('2025-10-01');
    expect(period.incomplete).toBe(true);
    expect(period.label).toBe('Semana actual · 29 sep – 5 oct');
    expect(period.timezone).toBe('America/Bogota');
  });

  it('mes calendario con to=hoy', () => {
    const period = buildCurrentAnalysisPeriod(
      OperationalKpiHistoryGranularity.MONTH,
      new Date('2026-10-05T12:00:00-05:00'),
    );
    expect(period.from).toBe('2026-10-01');
    expect(period.calendarEnd).toBe('2026-10-31');
    expect(period.to).toBe('2026-10-05');
    expect(period.incomplete).toBe(true);
    expect(period.label).toBe('Octubre 2026');
  });

  it('ciclo H2 julio–diciembre', () => {
    const period = buildCurrentAnalysisPeriod(
      OperationalKpiHistoryGranularity.CYCLE,
      new Date('2026-10-05T12:00:00-05:00'),
    );
    expect(period.from).toBe('2026-07-01');
    expect(period.calendarEnd).toBe('2026-12-31');
    expect(period.to).toBe('2026-10-05');
    expect(period.label).toBe('Ciclo H2 · jul – dic 2026');
  });

  it('ciclo H1 enero–junio', () => {
    const period = buildCurrentAnalysisPeriod(
      OperationalKpiHistoryGranularity.CYCLE,
      new Date('2026-03-15T12:00:00-05:00'),
    );
    expect(period.from).toBe('2026-01-01');
    expect(period.calendarEnd).toBe('2026-06-30');
    expect(period.label).toBe('Ciclo H1 · ene – jun 2026');
  });
});
