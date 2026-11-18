import ExcelJS from 'exceljs';
import type { SituationsExportSheet } from './situations-export.dto';

/**
 * Libro de Excel de situaciones activas. Funciones puras sobre un modelo plano
 * (sin TypeORM): el servicio consulta y mapea; aquí solo se compone el archivo.
 *
 * Hojas:
 *   Resumen          Metadatos, filtros y totales (estado, severidad,
 *                    coordinación, categoría, plazo).
 *   Situaciones      Una fila por situación con todo lo que NOVEX registra.
 *   Afectaciones     Una fila por afectación (consecuencia) registrada.
 *   Relacionadas     Una fila por coordinación relacionada con una situación.
 */

export const BOGOTA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

const EXCEL_CELL_MAX_LENGTH = 32_000;

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  IN_PROGRESS: 'En atención',
  RESOLVED: 'En atención',
  CLOSED: 'Cerrada',
  CANCELLED: 'Anulada',
};

export const SEVERITY_LABEL: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export const REPORT_KIND_LABEL: Record<string, string> = {
  INTERNAL: 'Interna',
  INTER_COORDINATION: 'Dependencia entre coordinaciones',
};

export const SLA_LABEL: Record<string, string> = {
  on_track: 'En plazo',
  at_risk: 'Plazo en riesgo',
  overdue: 'Plazo vencido',
  closed: 'Plazo cerrado',
};

export interface ExportSituationRow {
  id: string;
  /** Código corto legible (primeros 8 caracteres del id, en mayúscula). */
  code: string;
  title: string;
  description: string;
  reportKind: string;
  status: string;
  severity: string;
  reportedSeverity: string;
  categoryName: string | null;
  categoryOtherText: string | null;
  responsibleCoordinationName: string | null;
  affectedCoordinationName: string | null;
  relatedCoordinationNames: string[];
  affectedProcess: string | null;
  pendingDelivery: string | null;
  createdByName: string;
  assignedName: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  dueAt: Date | null;
  slaHealth: string;
  /** Días completos desde la ocurrencia hasta la generación del archivo. */
  daysOpen: number;
  consequencesCount: number;
  lastConsequenceAt: Date | null;
  lastStatusComment: string | null;
}

export interface ExportConsequenceRow {
  situationCode: string;
  situationTitle: string;
  responsibleCoordinationName: string | null;
  severity: string;
  occurredAt: Date;
  createdAt: Date;
  description: string;
  createdByName: string;
}

export interface ExportRelatedRow {
  situationCode: string;
  situationTitle: string;
  responsibleCoordinationName: string | null;
  relatedCoordinationName: string;
  order: number;
}

export interface SituationsWorkbookInput {
  generatedAt: Date;
  generatedBy: string;
  generatedByRole: string;
  /** Filtros aplicados, ya en lenguaje de producto. */
  filters: ReadonlyArray<readonly [string, string]>;
  sheets: ReadonlySet<SituationsExportSheet>;
  situations: ExportSituationRow[];
  consequences: ExportConsequenceRow[];
  related: ExportRelatedRow[];
  /** Verdadero si se alcanzó el tope de filas y el archivo no está completo. */
  truncated: boolean;
}

// Paleta sobria e institucional (texto oscuro sobre fondos suaves).
const COLOR = {
  ink: 'FF1B2333',
  inkSoft: 'FF5B6577',
  header: 'FF1F2A44',
  headerText: 'FFFFFFFF',
  band: 'FFF4F6FA',
  border: 'FFD9DEE7',
  accent: 'FFB8862B',
  critical: 'FFFBE3E1',
  criticalText: 'FF9B1C1C',
  high: 'FFFDEBD8',
  highText: 'FF9A4A0B',
  medium: 'FFFFF6D6',
  mediumText: 'FF7A5A00',
  low: 'FFE5F4EA',
  lowText: 'FF1E6B3A',
} as const;

const SEVERITY_STYLE: Record<string, { fill: string; font: string }> = {
  CRITICAL: { fill: COLOR.critical, font: COLOR.criticalText },
  HIGH: { fill: COLOR.high, font: COLOR.highText },
  MEDIUM: { fill: COLOR.medium, font: COLOR.mediumText },
  LOW: { fill: COLOR.low, font: COLOR.lowText },
};

const DATE_TIME_FORMAT = 'dd/mm/yyyy hh:mm';

/**
 * Excel no tiene zona horaria: se escribe la hora de Bogotá como si fuera UTC
 * para que la celda muestre la hora local institucional.
 */
export function toBogotaExcelDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + BOGOTA_UTC_OFFSET_MS);
}

/** Caracteres válidos en XML 1.0: tab, saltos de línea y los imprimibles. */
function isXmlSafeChar(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code < 0x20) return false;
  return code !== 0xfffe && code !== 0xffff;
}

/**
 * Quita caracteres de control que XML no admite (rompen el archivo) y respeta
 * el límite de longitud de una celda de Excel.
 */
export function sanitizeCellText(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';

  const clean = Array.from(String(value))
    .filter((char) => isXmlSafeChar(char.codePointAt(0) ?? 0))
    .join('');
  return clean.length > EXCEL_CELL_MAX_LENGTH
    ? `${clean.slice(0, EXCEL_CELL_MAX_LENGTH)}…`
    : clean;
}

function categoryLabel(row: ExportSituationRow): string {
  if (row.reportKind === 'INTER_COORDINATION' && !row.categoryName) {
    return 'Dependencia (sin categoría)';
  }
  if (row.categoryOtherText) {
    return `${row.categoryName ?? 'Otra'}: ${row.categoryOtherText}`;
  }
  return row.categoryName ?? 'Sin categoría';
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: COLOR.border },
  };
  return { top: side, left: side, bottom: side, right: side };
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

interface ColumnSpec<T> {
  header: string;
  key: string;
  width: number;
  value: (row: T) => ExcelJS.CellValue;
  format?: string;
  wrap?: boolean;
  align?: 'left' | 'center' | 'right';
}

/**
 * Tabla con cabecera fija, autofiltro, bandas y bordes. Devuelve la hoja para
 * que el llamador agregue estilos condicionales por fila.
 */
function addTableSheet<T>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ColumnSpec<T>[],
  rows: T[],
  tabColor: string,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.headerText }, size: 11 };
    cell.fill = solidFill(COLOR.header);
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = thinBorder();
  });

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow(
      Object.fromEntries(
        columns.map((column) => [column.key, column.value(row)]),
      ),
    );
    excelRow.alignment = { vertical: 'top' };
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      cell.border = thinBorder();
      cell.font = { color: { argb: COLOR.ink }, size: 10 };
      if (index % 2 === 1) cell.fill = solidFill(COLOR.band);
      if (column.format) cell.numFmt = column.format;
      cell.alignment = {
        vertical: 'top',
        horizontal: column.align ?? 'left',
        wrapText: column.wrap ?? false,
      };
    });
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: columns.length },
    };
  }
  sheet.pageSetup.printTitlesRow = '1:1';
  return sheet;
}

function paintSeverityCell(cell: ExcelJS.Cell, severity: string): void {
  const style = SEVERITY_STYLE[severity];
  if (!style) return;
  cell.fill = solidFill(style.fill);
  cell.font = { bold: true, color: { argb: style.font }, size: 10 };
  cell.alignment = { vertical: 'top', horizontal: 'center' };
}

const SITUATION_COLUMNS: ColumnSpec<ExportSituationRow>[] = [
  {
    header: 'Código',
    key: 'code',
    width: 12,
    value: (r) => r.code,
    align: 'center',
  },
  {
    header: 'Título',
    key: 'title',
    width: 40,
    value: (r) => sanitizeCellText(r.title),
    wrap: true,
  },
  {
    header: 'Descripción',
    key: 'description',
    width: 60,
    value: (r) => sanitizeCellText(r.description),
    wrap: true,
  },
  {
    header: 'Tipo de registro',
    key: 'reportKind',
    width: 20,
    value: (r) => REPORT_KIND_LABEL[r.reportKind] ?? r.reportKind,
    wrap: true,
  },
  {
    header: 'Estado',
    key: 'status',
    width: 14,
    value: (r) => STATUS_LABEL[r.status] ?? r.status,
    align: 'center',
  },
  {
    header: 'Severidad actual',
    key: 'severity',
    width: 14,
    value: (r) => SEVERITY_LABEL[r.severity] ?? r.severity,
    align: 'center',
  },
  {
    header: 'Severidad reportada',
    key: 'reportedSeverity',
    width: 14,
    value: (r) => SEVERITY_LABEL[r.reportedSeverity] ?? r.reportedSeverity,
    align: 'center',
  },
  {
    header: 'Categoría',
    key: 'category',
    width: 30,
    value: (r) => sanitizeCellText(categoryLabel(r)),
    wrap: true,
  },
  {
    header: 'Coordinación responsable',
    key: 'responsible',
    width: 28,
    value: (r) => r.responsibleCoordinationName ?? 'Sin coordinación',
    wrap: true,
  },
  {
    header: 'Coordinación afectada',
    key: 'affected',
    width: 28,
    value: (r) => r.affectedCoordinationName ?? '',
    wrap: true,
  },
  {
    header: 'Coordinaciones relacionadas',
    key: 'related',
    width: 34,
    value: (r) => r.relatedCoordinationNames.join(', '),
    wrap: true,
  },
  {
    header: 'Proceso afectado',
    key: 'affectedProcess',
    width: 36,
    value: (r) => sanitizeCellText(r.affectedProcess),
    wrap: true,
  },
  {
    header: 'Entrega pendiente',
    key: 'pendingDelivery',
    width: 36,
    value: (r) => sanitizeCellText(r.pendingDelivery),
    wrap: true,
  },
  {
    header: 'Reportada por',
    key: 'createdBy',
    width: 26,
    value: (r) => sanitizeCellText(r.createdByName),
    wrap: true,
  },
  {
    header: 'Asignada a',
    key: 'assigned',
    width: 26,
    value: (r) => sanitizeCellText(r.assignedName),
    wrap: true,
  },
  {
    header: 'Fecha de ocurrencia',
    key: 'occurredAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.occurredAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  {
    header: 'Fecha de registro',
    key: 'createdAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.createdAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  {
    header: 'Fecha límite (plazo)',
    key: 'dueAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.dueAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  {
    header: 'Estado del plazo',
    key: 'sla',
    width: 16,
    value: (r) => SLA_LABEL[r.slaHealth] ?? r.slaHealth,
    align: 'center',
  },
  {
    header: 'Días abierta',
    key: 'daysOpen',
    width: 11,
    value: (r) => r.daysOpen,
    format: '0',
    align: 'center',
  },
  {
    header: 'Afectaciones',
    key: 'consequences',
    width: 13,
    value: (r) => r.consequencesCount,
    format: '0',
    align: 'center',
  },
  {
    header: 'Última afectación',
    key: 'lastConsequenceAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.lastConsequenceAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  {
    header: 'Último comentario de estado',
    key: 'lastComment',
    width: 40,
    value: (r) => sanitizeCellText(r.lastStatusComment),
    wrap: true,
  },
  {
    header: 'Última actualización',
    key: 'updatedAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.updatedAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  { header: 'ID NOVEX', key: 'id', width: 38, value: (r) => r.id },
];

const CONSEQUENCE_COLUMNS: ColumnSpec<ExportConsequenceRow>[] = [
  {
    header: 'Código situación',
    key: 'code',
    width: 14,
    value: (r) => r.situationCode,
    align: 'center',
  },
  {
    header: 'Situación',
    key: 'title',
    width: 40,
    value: (r) => sanitizeCellText(r.situationTitle),
    wrap: true,
  },
  {
    header: 'Coordinación responsable',
    key: 'responsible',
    width: 28,
    value: (r) => r.responsibleCoordinationName ?? 'Sin coordinación',
    wrap: true,
  },
  {
    header: 'Severidad actual',
    key: 'severity',
    width: 14,
    value: (r) => SEVERITY_LABEL[r.severity] ?? r.severity,
    align: 'center',
  },
  {
    header: 'Fecha de la afectación',
    key: 'occurredAt',
    width: 20,
    value: (r) => toBogotaExcelDate(r.occurredAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
  {
    header: 'Afectación',
    key: 'description',
    width: 70,
    value: (r) => sanitizeCellText(r.description),
    wrap: true,
  },
  {
    header: 'Registrada por',
    key: 'createdBy',
    width: 26,
    value: (r) => sanitizeCellText(r.createdByName),
    wrap: true,
  },
  {
    header: 'Fecha de registro',
    key: 'createdAt',
    width: 18,
    value: (r) => toBogotaExcelDate(r.createdAt),
    format: DATE_TIME_FORMAT,
    align: 'center',
  },
];

const RELATED_COLUMNS: ColumnSpec<ExportRelatedRow>[] = [
  {
    header: 'Código situación',
    key: 'code',
    width: 14,
    value: (r) => r.situationCode,
    align: 'center',
  },
  {
    header: 'Situación',
    key: 'title',
    width: 44,
    value: (r) => sanitizeCellText(r.situationTitle),
    wrap: true,
  },
  {
    header: 'Coordinación responsable',
    key: 'responsible',
    width: 30,
    value: (r) => r.responsibleCoordinationName ?? 'Sin coordinación',
    wrap: true,
  },
  {
    header: 'Coordinación relacionada',
    key: 'related',
    width: 30,
    value: (r) => r.relatedCoordinationName,
    wrap: true,
  },
  {
    header: 'Orden',
    key: 'order',
    width: 8,
    value: (r) => r.order,
    format: '0',
    align: 'center',
  },
];

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Bloque «título + tabla» del resumen. Devuelve la siguiente fila libre. */
function writeSummaryTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rows: ExcelJS.CellValue[][],
): number {
  const titleCell = sheet.getCell(startRow, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12, color: { argb: COLOR.ink } };
  titleCell.border = {
    bottom: { style: 'medium', color: { argb: COLOR.accent } },
  };

  const headerRow = sheet.getRow(startRow + 1);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: COLOR.headerText }, size: 10 };
    cell.fill = solidFill(COLOR.header);
    cell.alignment = {
      horizontal: index === 0 ? 'left' : 'center',
      vertical: 'middle',
    };
    cell.border = thinBorder();
  });

  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(startRow + 2 + rowIndex);
    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.border = thinBorder();
      cell.font = { color: { argb: COLOR.ink }, size: 10 };
      if (rowIndex % 2 === 1) cell.fill = solidFill(COLOR.band);
      cell.alignment = { horizontal: index === 0 ? 'left' : 'center' };
    });
  });

  return startRow + 2 + rows.length + 1;
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  input: SituationsWorkbookInput,
): void {
  const sheet = workbook.addWorksheet('Resumen', {
    properties: { tabColor: { argb: COLOR.accent } },
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  sheet.columns = [
    { width: 38 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  sheet.mergeCells('A1:F1');
  const title = sheet.getCell('A1');
  title.value = 'NOVEX · Situaciones activas';
  title.font = { bold: true, size: 18, color: { argb: COLOR.ink } };
  sheet.getRow(1).height = 30;

  sheet.mergeCells('A2:F2');
  const subtitle = sheet.getCell('A2');
  subtitle.value =
    'Reporte operativo generado desde el Centro Operacional. Horas en zona horaria de Bogotá (UTC-5).';
  subtitle.font = { italic: true, size: 10, color: { argb: COLOR.inkSoft } };

  const meta: Array<[string, ExcelJS.CellValue, string?]> = [
    ['Generado', toBogotaExcelDate(input.generatedAt), DATE_TIME_FORMAT],
    [
      'Generado por',
      `${sanitizeCellText(input.generatedBy)} (${input.generatedByRole})`,
    ],
    ['Situaciones en el archivo', input.situations.length, '0'],
    ...input.filters.map(
      ([label, value]) => [label, value] as [string, string],
    ),
  ];
  let row = 4;
  for (const [label, value, format] of meta) {
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: COLOR.inkSoft } };
    sheet.mergeCells(row, 2, row, 6);
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: COLOR.ink } };
    valueCell.alignment = { horizontal: 'left', wrapText: true };
    if (format) valueCell.numFmt = format;
    row += 1;
  }

  if (input.truncated) {
    sheet.mergeCells(row, 1, row, 6);
    const warning = sheet.getCell(row, 1);
    warning.value =
      'Atención: se alcanzó el máximo de filas por archivo. Acote los filtros para obtener el resto.';
    warning.font = { bold: true, color: { argb: COLOR.criticalText } };
    warning.fill = solidFill(COLOR.critical);
    row += 1;
  }
  row += 1;

  const situations = input.situations;

  const byStatus = countBy(situations, (s) => s.status);
  row = writeSummaryTable(
    sheet,
    row,
    'Por estado',
    ['Estado', 'Situaciones'],
    ['OPEN', 'IN_PROGRESS']
      .map(
        (status) =>
          [
            STATUS_LABEL[status],
            byStatus.get(status) ?? 0,
          ] as ExcelJS.CellValue[],
      )
      .concat([['Total', situations.length]]),
  );

  const bySeverity = countBy(situations, (s) => s.severity);
  row = writeSummaryTable(
    sheet,
    row,
    'Por severidad actual',
    ['Severidad', 'Situaciones'],
    SEVERITY_ORDER.map((severity) => [
      SEVERITY_LABEL[severity],
      bySeverity.get(severity) ?? 0,
    ]),
  );

  const bySla = countBy(situations, (s) => s.slaHealth);
  row = writeSummaryTable(
    sheet,
    row,
    'Por estado del plazo',
    ['Plazo', 'Situaciones'],
    ['overdue', 'at_risk', 'on_track'].map((sla) => [
      SLA_LABEL[sla],
      bySla.get(sla) ?? 0,
    ]),
  );

  // Por coordinación responsable con desglose de severidad.
  const coordinations = new Map<string, Map<string, number>>();
  for (const s of situations) {
    const name = s.responsibleCoordinationName ?? 'Sin coordinación';
    const bucket = coordinations.get(name) ?? new Map<string, number>();
    bucket.set(s.severity, (bucket.get(s.severity) ?? 0) + 1);
    coordinations.set(name, bucket);
  }
  const coordinationRows = Array.from(coordinations.entries())
    .map(([name, bucket]) => {
      const total = Array.from(bucket.values()).reduce((a, b) => a + b, 0);
      return { name, bucket, total };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
    .map(({ name, bucket, total }) => [
      name,
      total,
      ...SEVERITY_ORDER.map((severity) => bucket.get(severity) ?? 0),
    ]);
  row = writeSummaryTable(
    sheet,
    row,
    'Por coordinación responsable',
    ['Coordinación', 'Total', ...SEVERITY_ORDER.map((s) => SEVERITY_LABEL[s])],
    coordinationRows,
  );

  const byCategory = countBy(situations, (s) => categoryLabel(s));
  row = writeSummaryTable(
    sheet,
    row,
    'Por categoría',
    ['Categoría', 'Situaciones'],
    Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([name, count]) => [sanitizeCellText(name), count]),
  );

  const byKind = countBy(situations, (s) => s.reportKind);
  writeSummaryTable(
    sheet,
    row,
    'Por tipo de registro',
    ['Tipo', 'Situaciones'],
    ['INTERNAL', 'INTER_COORDINATION'].map((kind) => [
      REPORT_KIND_LABEL[kind],
      byKind.get(kind) ?? 0,
    ]),
  );
}

export function buildSituationsWorkbook(
  input: SituationsWorkbookInput,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NOVEX';
  workbook.lastModifiedBy = 'NOVEX';
  workbook.title = 'Situaciones activas';
  workbook.company = 'NOVEX';
  workbook.created = input.generatedAt;
  workbook.modified = input.generatedAt;

  if (input.sheets.has('summary')) {
    addSummarySheet(workbook, input);
  }

  const situationsSheet = addTableSheet(
    workbook,
    'Situaciones',
    SITUATION_COLUMNS,
    input.situations,
    COLOR.header,
  );
  const severityCol =
    SITUATION_COLUMNS.findIndex((c) => c.key === 'severity') + 1;
  const reportedCol =
    SITUATION_COLUMNS.findIndex((c) => c.key === 'reportedSeverity') + 1;
  const slaCol = SITUATION_COLUMNS.findIndex((c) => c.key === 'sla') + 1;
  input.situations.forEach((situation, index) => {
    const row = situationsSheet.getRow(index + 2);
    paintSeverityCell(row.getCell(severityCol), situation.severity);
    paintSeverityCell(row.getCell(reportedCol), situation.reportedSeverity);
    if (situation.slaHealth === 'overdue') {
      const cell = row.getCell(slaCol);
      cell.font = { bold: true, color: { argb: COLOR.criticalText }, size: 10 };
    } else if (situation.slaHealth === 'at_risk') {
      const cell = row.getCell(slaCol);
      cell.font = { bold: true, color: { argb: COLOR.highText }, size: 10 };
    }
  });

  if (input.sheets.has('consequences')) {
    const sheet = addTableSheet(
      workbook,
      'Afectaciones',
      CONSEQUENCE_COLUMNS,
      input.consequences,
      'FF9A4A0B',
    );
    const col = CONSEQUENCE_COLUMNS.findIndex((c) => c.key === 'severity') + 1;
    input.consequences.forEach((consequence, index) => {
      paintSeverityCell(
        sheet.getRow(index + 2).getCell(col),
        consequence.severity,
      );
    });
  }

  if (input.sheets.has('related')) {
    addTableSheet(
      workbook,
      'Coordinaciones relacionadas',
      RELATED_COLUMNS,
      input.related,
      'FF1E6B3A',
    );
  }

  return workbook;
}
