import { BadRequestException } from '@nestjs/common';
import { OperationalKpiHistoryGranularity } from '../dto/operational-kpi-history-query.dto';

export const KPI_HISTORY_TIMEZONE = 'America/Bogota' as const;
/** Offset fijo: Colombia no observa horario de verano. */
const COLOMBIA_OFFSET = '-05:00';

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export const KPI_HISTORY_MAX_BUCKETS: Record<
  OperationalKpiHistoryGranularity,
  number
> = {
  [OperationalKpiHistoryGranularity.WEEK]: 52,
  [OperationalKpiHistoryGranularity.MONTH]: 24,
  [OperationalKpiHistoryGranularity.CYCLE]: 8,
};

export type KpiHistoryBucket = {
  start: string;
  end: string;
  label: string;
  /** Fin exclusivo en instante UTC (closed_at / created_at comparisons). */
  endExclusiveIso: string;
  /** Fin inclusive 23:59:59.999 Bogotá como instante UTC. */
  endInclusiveIso: string;
  /**
   * Unidad de calendario completa a la que pertenece el bucket (día, semana
   * lun–dom o mes). Puede exceder [start, end] cuando el bucket está recortado
   * al periodo: «1–4 oct» pertenece a la semana 28 sep – 4 oct. Solo en los
   * buckets de ESTADO (drill-down).
   */
  calendarStart?: string;
  calendarEnd?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatYmd(
  year: number,
  monthIndex: number,
  day: number,
): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function parseYmd(ymd: string): {
  year: number;
  monthIndex: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) {
    throw new BadRequestException(`Fecha inválida: ${ymd}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > daysInMonth(year, monthIndex)
  ) {
    throw new BadRequestException(`Fecha inválida: ${ymd}`);
  }
  return { year, monthIndex, day };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function bogotaWeekday(ymd: string): number {
  const instant = new Date(`${ymd}T12:00:00${COLOMBIA_OFFSET}`);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: KPI_HISTORY_TIMEZONE,
    weekday: 'short',
  }).format(instant);
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

export function addDaysYmd(ymd: string, delta: number): string {
  const instant = new Date(`${ymd}T12:00:00${COLOMBIA_OFFSET}`);
  instant.setTime(instant.getTime() + delta * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return formatYmd(year, month - 1, day);
}

export function mondayOfWeekContaining(ymd: string): string {
  const weekday = bogotaWeekday(ymd);
  const offsetFromMonday = weekday === 0 ? -6 : 1 - weekday;
  return addDaysYmd(ymd, offsetFromMonday);
}

function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Instante UTC del inicio del día civil Bogotá (00:00-05:00 = 05:00Z).
 */
export function bogotaDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00${COLOMBIA_OFFSET}`).toISOString();
}

/**
 * Instante exclusivo: primer instante del día siguiente en Bogotá.
 * created_at < endExclusive ⇔ created_at en [start, end] inclusive civil.
 */
export function bogotaDayEndExclusiveIso(ymd: string): string {
  return bogotaDayStartIso(addDaysYmd(ymd, 1));
}

export function bogotaDayEndInclusiveIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999${COLOMBIA_OFFSET}`).toISOString();
}

function weekLabel(monday: string, sunday: string): string {
  const [y] = monday.split('-').map(Number);
  const [, mMon, dMon] = monday.split('-').map(Number);
  const [, mSun, dSun] = sunday.split('-').map(Number);
  if (mMon === mSun) {
    return `Semana del ${dMon} al ${dSun} de ${MONTH_NAMES[mMon - 1]} de ${y}`;
  }
  return `Semana del ${dMon} de ${MONTH_NAMES[mMon - 1]} al ${dSun} de ${MONTH_NAMES[mSun - 1]} de ${y}`;
}

function monthLabel(year: number, monthIndex: number): string {
  const title =
    MONTH_NAMES[monthIndex].charAt(0).toUpperCase() +
    MONTH_NAMES[monthIndex].slice(1);
  return `${title} de ${year}`;
}

function cycleOf(ymd: string): { year: number; half: 1 | 2 } {
  const { year, monthIndex } = parseYmd(ymd);
  return { year, half: monthIndex <= 5 ? 1 : 2 };
}

function cycleBounds(
  year: number,
  half: 1 | 2,
): { start: string; end: string; label: string } {
  if (half === 1) {
    return {
      start: formatYmd(year, 0, 1),
      end: formatYmd(year, 5, 30),
      label: `Ciclo 1 · ${year} (enero–junio)`,
    };
  }
  return {
    start: formatYmd(year, 6, 1),
    end: formatYmd(year, 11, 31),
    label: `Ciclo 2 · ${year} (julio–diciembre)`,
  };
}

function nextCycle(year: number, half: 1 | 2): { year: number; half: 1 | 2 } {
  return half === 1 ? { year, half: 2 } : { year: year + 1, half: 1 };
}

function toBucket(start: string, end: string, label: string): KpiHistoryBucket {
  return {
    start,
    end,
    label,
    endExclusiveIso: bogotaDayEndExclusiveIso(end),
    endInclusiveIso: bogotaDayEndInclusiveIso(end),
  };
}

export function buildKpiHistoryBuckets(
  granularity: OperationalKpiHistoryGranularity,
  fromYmd: string,
  toYmd: string,
): KpiHistoryBucket[] {
  parseYmd(fromYmd);
  parseYmd(toYmd);
  if (compareYmd(fromYmd, toYmd) > 0) {
    throw new BadRequestException('from no puede ser posterior a to.');
  }

  const buckets: KpiHistoryBucket[] = [];
  const max = KPI_HISTORY_MAX_BUCKETS[granularity];

  if (granularity === OperationalKpiHistoryGranularity.WEEK) {
    let monday = mondayOfWeekContaining(fromYmd);
    const lastMonday = mondayOfWeekContaining(toYmd);
    while (compareYmd(monday, lastMonday) <= 0) {
      const sunday = addDaysYmd(monday, 6);
      buckets.push(toBucket(monday, sunday, weekLabel(monday, sunday)));
      if (buckets.length > max) {
        throw new BadRequestException(
          `El rango semanal no puede superar ${max} buckets.`,
        );
      }
      monday = addDaysYmd(monday, 7);
    }
    return buckets;
  }

  if (granularity === OperationalKpiHistoryGranularity.MONTH) {
    let { year, monthIndex } = parseYmd(fromYmd);
    const end = parseYmd(toYmd);
    while (
      year < end.year ||
      (year === end.year && monthIndex <= end.monthIndex)
    ) {
      const start = formatYmd(year, monthIndex, 1);
      const endDay = formatYmd(year, monthIndex, daysInMonth(year, monthIndex));
      buckets.push(toBucket(start, endDay, monthLabel(year, monthIndex)));
      if (buckets.length > max) {
        throw new BadRequestException(
          `El rango mensual no puede superar ${max} buckets.`,
        );
      }
      monthIndex += 1;
      if (monthIndex > 11) {
        monthIndex = 0;
        year += 1;
      }
    }
    return buckets;
  }

  let cursor = cycleOf(fromYmd);
  const last = cycleOf(toYmd);
  while (
    cursor.year < last.year ||
    (cursor.year === last.year && cursor.half <= last.half)
  ) {
    const bounds = cycleBounds(cursor.year, cursor.half);
    buckets.push(toBucket(bounds.start, bounds.end, bounds.label));
    if (buckets.length > max) {
      throw new BadRequestException(
        `El rango de ciclos no puede superar ${max} buckets.`,
      );
    }
    cursor = nextCycle(cursor.year, cursor.half);
  }
  return buckets;
}
