import { BadRequestException } from '@nestjs/common';
import {
  addDaysYmd,
  bogotaDayEndExclusiveIso,
  bogotaDayEndInclusiveIso,
  bogotaDayStartIso,
  formatYmd,
  mondayOfWeekContaining,
  parseYmd,
  type KpiHistoryBucket,
} from './kpi-history-buckets';

export type EstadoPeriodKind = 'week' | 'month' | 'cycle';

/** Resolución de evolución derivada del periodo (única fuente de la regla). */
export const ESTADO_EVOLUTION_BUCKET: Record<
  EstadoPeriodKind,
  'day' | 'week' | 'month'
> = {
  week: 'day',
  month: 'week',
  cycle: 'month',
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

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

function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function maxYmd(a: string, b: string): string {
  return compareYmd(a, b) >= 0 ? a : b;
}

function minYmd(a: string, b: string): string {
  return compareYmd(a, b) <= 0 ? a : b;
}

function bogotaWeekday(ymd: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
  }).format(new Date(`${ymd}T12:00:00-05:00`));
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

function dayLabel(ymd: string): string {
  const { day } = parseYmd(ymd);
  return `${DAY_NAMES[bogotaWeekday(ymd)]} ${day}`;
}

function weekRangeLabel(start: string, end: string): string {
  const { monthIndex: mStart, day: dStart } = parseYmd(start);
  const { monthIndex: mEnd, day: dEnd } = parseYmd(end);
  if (start === end) {
    return `${dStart} ${MONTH_SHORT[mStart]}`;
  }
  if (mStart === mEnd) {
    return `${dStart}–${dEnd} ${MONTH_SHORT[mStart]}`;
  }
  return `${dStart} ${MONTH_SHORT[mStart]} – ${dEnd} ${MONTH_SHORT[mEnd]}`;
}

function monthShortLabel(ymd: string): string {
  const { year, monthIndex } = parseYmd(ymd);
  const title =
    MONTH_SHORT[monthIndex].charAt(0).toUpperCase() +
    MONTH_SHORT[monthIndex].slice(1);
  return `${title} ${year}`;
}

function toBucket(
  start: string,
  end: string,
  label: string,
  calendarStart: string,
  calendarEnd: string,
): KpiHistoryBucket {
  return {
    start,
    end,
    label,
    endExclusiveIso: bogotaDayEndExclusiveIso(end),
    endInclusiveIso: bogotaDayEndInclusiveIso(end),
    calendarStart,
    calendarEnd,
  };
}

/**
 * Buckets de evolución de ESTADO derivados del periodo analizado.
 * - week → días dentro de [from, to]
 * - month → semanas que intersectan [from, to], ventanas recortadas al periodo
 * - cycle → meses calendario intersectando [from, to], recortados
 */
export function buildEstadoEvolutionBuckets(
  kind: EstadoPeriodKind,
  fromYmd: string,
  toYmd: string,
): KpiHistoryBucket[] {
  parseYmd(fromYmd);
  parseYmd(toYmd);
  if (compareYmd(fromYmd, toYmd) > 0) {
    throw new BadRequestException('from no puede ser posterior a to.');
  }

  if (kind === 'week') {
    const buckets: KpiHistoryBucket[] = [];
    let cursor = fromYmd;
    while (compareYmd(cursor, toYmd) <= 0) {
      buckets.push(toBucket(cursor, cursor, dayLabel(cursor), cursor, cursor));
      if (buckets.length > 31) {
        throw new BadRequestException(
          'El rango diario no puede superar 31 buckets.',
        );
      }
      cursor = addDaysYmd(cursor, 1);
    }
    return buckets;
  }

  if (kind === 'month') {
    const buckets: KpiHistoryBucket[] = [];
    let monday = mondayOfWeekContaining(fromYmd);
    while (compareYmd(monday, toYmd) <= 0) {
      const sunday = addDaysYmd(monday, 6);
      if (compareYmd(sunday, fromYmd) >= 0 && compareYmd(monday, toYmd) <= 0) {
        const start = maxYmd(monday, fromYmd);
        const end = minYmd(sunday, toYmd);
        // El label describe la ventana contada (intersección con el periodo),
        // no la semana calendario: «1–4 oct», nunca «28 sep – 4 oct».
        buckets.push(
          toBucket(start, end, weekRangeLabel(start, end), monday, sunday),
        );
      }
      if (buckets.length > 8) {
        throw new BadRequestException(
          'El rango semanal del mes no puede superar 8 buckets.',
        );
      }
      monday = addDaysYmd(monday, 7);
    }
    return buckets;
  }

  // cycle → months
  const buckets: KpiHistoryBucket[] = [];
  let { year, monthIndex } = parseYmd(fromYmd);
  const endParts = parseYmd(toYmd);
  while (
    year < endParts.year ||
    (year === endParts.year && monthIndex <= endParts.monthIndex)
  ) {
    const monthStart = formatYmd(year, monthIndex, 1);
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const monthEnd = formatYmd(year, monthIndex, lastDay);
    const start = maxYmd(monthStart, fromYmd);
    const end = minYmd(monthEnd, toYmd);
    buckets.push(
      toBucket(start, end, monthShortLabel(monthStart), monthStart, monthEnd),
    );
    if (buckets.length > 12) {
      throw new BadRequestException(
        'El rango mensual del ciclo no puede superar 12 buckets.',
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

/**
 * Casilla del FLUJO DE PROBLEMAS: geometría del periodo calendario COMPLETO
 * (los 6 meses del ciclo, todas las semanas del mes, los 7 días de la
 * semana), aunque el periodo siga en curso.
 * - future: empieza después de dataTo → sin datos (null), nunca 0 fingido.
 * - dataEnd: fin de la ventana contada (recortada a dataTo). Es también la
 *   clave del bucket en los conteos de buildEstadoEvolutionBuckets(from, dataTo).
 * - current: contiene «hoy».
 */
export type EstadoFlowSlot = {
  bucket: KpiHistoryBucket;
  dataEnd: string | null;
  future: boolean;
  current: boolean;
};

export function buildEstadoFlowSlots(
  kind: EstadoPeriodKind,
  fromYmd: string,
  calendarEndYmd: string,
  dataToYmd: string,
  todayYmd: string,
): EstadoFlowSlot[] {
  return buildEstadoEvolutionBuckets(kind, fromYmd, calendarEndYmd).map(
    (bucket) => {
      const future = compareYmd(bucket.start, dataToYmd) > 0;
      return {
        bucket,
        future,
        dataEnd: future ? null : minYmd(bucket.end, dataToYmd),
        current:
          compareYmd(bucket.start, todayYmd) <= 0 &&
          compareYmd(todayYmd, bucket.end) <= 0,
      };
    },
  );
}

function lastDayOfMonthYmd(year: number, monthIndex: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return formatYmd(year, monthIndex, lastDay);
}

/**
 * Contrato temporal de ESTADO. `from` + `calendarEnd` describen la geometría
 * calendario completa del periodo; `to` es el fin de datos pedido, que puede
 * venir recortado (periodo en curso). Reglas:
 * - from <= to <= calendarEnd;
 * - week  → from lunes, calendarEnd = domingo de esa semana;
 * - month → from día 1, calendarEnd = último día del mismo mes;
 * - cycle → H1 (1 ene – 30 jun) o H2 (1 jul – 31 dic) del mismo año;
 * - periodo ya terminado (calendarEnd < hoy) → to = calendarEnd;
 * - periodo futuro (from > hoy) → rechazado.
 * En el periodo en curso `to` puede ser < hoy (reloj del cliente) y el
 * servicio sigue recortando con `dataTo = min(to, hoy)`.
 */
export function assertEstadoPeriodShape(
  kind: EstadoPeriodKind,
  fromYmd: string,
  toYmd: string,
  calendarEndYmd: string,
  todayYmd: string,
): void {
  const from = parseYmd(fromYmd);
  parseYmd(toYmd);
  parseYmd(calendarEndYmd);

  if (compareYmd(fromYmd, toYmd) > 0) {
    throw new BadRequestException('from no puede ser posterior a to.');
  }
  if (compareYmd(toYmd, calendarEndYmd) > 0) {
    throw new BadRequestException('to no puede ser posterior a calendarEnd.');
  }

  if (kind === 'week') {
    if (
      mondayOfWeekContaining(fromYmd) !== fromYmd ||
      addDaysYmd(fromYmd, 6) !== calendarEndYmd
    ) {
      throw new BadRequestException(
        'kind=week exige from lunes y calendarEnd el domingo de esa semana.',
      );
    }
  } else if (kind === 'month') {
    if (
      from.day !== 1 ||
      lastDayOfMonthYmd(from.year, from.monthIndex) !== calendarEndYmd
    ) {
      throw new BadRequestException(
        'kind=month exige from día 1 y calendarEnd el último día del mismo mes.',
      );
    }
  } else {
    const h1 = fromYmd === formatYmd(from.year, 0, 1);
    const h2 = fromYmd === formatYmd(from.year, 6, 1);
    const expectedEnd = h1
      ? formatYmd(from.year, 5, 30)
      : formatYmd(from.year, 11, 31);
    if ((!h1 && !h2) || calendarEndYmd !== expectedEnd) {
      throw new BadRequestException(
        'kind=cycle exige un ciclo completo: H1 (1 ene – 30 jun) o H2 (1 jul – 31 dic).',
      );
    }
  }

  if (compareYmd(fromYmd, todayYmd) > 0) {
    throw new BadRequestException(
      'No se puede analizar un periodo futuro: from es posterior a hoy (America/Bogota).',
    );
  }
  if (compareYmd(calendarEndYmd, todayYmd) < 0 && toYmd !== calendarEndYmd) {
    throw new BadRequestException(
      'Un periodo ya terminado exige to = calendarEnd.',
    );
  }
}

export function resolveEstadoDataWindow(
  fromYmd: string,
  toYmd: string,
  calendarEndYmd: string | undefined,
  todayYmd: string,
): { dataTo: string; isPartial: boolean; isCurrent: boolean } {
  const calendarEnd = calendarEndYmd ?? toYmd;
  const dataTo = minYmd(toYmd, todayYmd);
  const isPartial = compareYmd(dataTo, calendarEnd) < 0;
  const isCurrent =
    compareYmd(fromYmd, todayYmd) <= 0 &&
    compareYmd(todayYmd, calendarEnd) <= 0;
  return { dataTo, isPartial, isCurrent };
}

// Re-export helpers needed by service for ISO bounds
export { bogotaDayStartIso, bogotaDayEndExclusiveIso };
