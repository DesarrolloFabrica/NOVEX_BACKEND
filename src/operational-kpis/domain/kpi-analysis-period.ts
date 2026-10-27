import { OperationalKpiHistoryGranularity } from '../dto/operational-kpi-history-query.dto';
import {
  KPI_HISTORY_TIMEZONE,
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
  formatYmd,
  parseYmd,
} from './kpi-history-buckets';

const COLOMBIA_OFFSET = '-05:00';

const MONTH_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const MONTH_TITLE = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export type KpiAnalysisPeriod = {
  granularity: OperationalKpiHistoryGranularity;
  from: string;
  to: string;
  calendarEnd: string;
  label: string;
  incomplete: boolean;
  timezone: typeof KPI_HISTORY_TIMEZONE;
  fromInclusiveIso: string;
  toExclusiveIso: string;
};

function bogotaTodayYmd(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return formatYmd(year, month - 1, day);
}

function addDaysYmd(ymd: string, delta: number): string {
  const instant = new Date(`${ymd}T12:00:00${COLOMBIA_OFFSET}`);
  instant.setTime(instant.getTime() + delta * 24 * 60 * 60 * 1000);
  return bogotaTodayYmd(instant);
}

function bogotaWeekday(ymd: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: KPI_HISTORY_TIMEZONE,
    weekday: 'short',
  }).format(new Date(`${ymd}T12:00:00${COLOMBIA_OFFSET}`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

function mondayOf(ymd: string): string {
  const weekday = bogotaWeekday(ymd);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysYmd(ymd, offset);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function minYmd(a: string, b: string): string {
  return a < b ? a : b;
}

function dayLabel(ymd: string): string {
  const { monthIndex, day } = parseYmd(ymd);
  return `${day} ${MONTH_SHORT[monthIndex]}`;
}

/**
 * Ventana del periodo de análisis actual (semana/mes/ciclo en curso).
 * Si el periodo calendario aún no termina, `to` = hoy (Bogotá).
 */
export function buildCurrentAnalysisPeriod(
  granularity: OperationalKpiHistoryGranularity,
  now: Date = new Date(),
): KpiAnalysisPeriod {
  const today = bogotaTodayYmd(now);
  let from: string;
  let calendarEnd: string;
  let label: string;

  if (granularity === OperationalKpiHistoryGranularity.WEEK) {
    from = mondayOf(today);
    calendarEnd = addDaysYmd(from, 6);
    label = `Semana actual · ${dayLabel(from)} – ${dayLabel(calendarEnd)}`;
  } else if (granularity === OperationalKpiHistoryGranularity.MONTH) {
    const { year, monthIndex } = parseYmd(today);
    from = formatYmd(year, monthIndex, 1);
    calendarEnd = formatYmd(year, monthIndex, daysInMonth(year, monthIndex));
    label = `${MONTH_TITLE[monthIndex]} ${year}`;
  } else {
    const { year, monthIndex } = parseYmd(today);
    if (monthIndex <= 5) {
      from = formatYmd(year, 0, 1);
      calendarEnd = formatYmd(year, 5, 30);
      label = `Ciclo H1 · ene – jun ${year}`;
    } else {
      from = formatYmd(year, 6, 1);
      calendarEnd = formatYmd(year, 11, 31);
      label = `Ciclo H2 · jul – dic ${year}`;
    }
  }

  const to = minYmd(calendarEnd, today);
  const incomplete = to < calendarEnd;

  return {
    granularity,
    from,
    to,
    calendarEnd,
    label,
    incomplete,
    timezone: KPI_HISTORY_TIMEZONE,
    fromInclusiveIso: bogotaDayStartIso(from),
    toExclusiveIso: bogotaDayEndExclusiveIso(to),
  };
}
