import { createHash } from 'node:crypto';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';

/**
 * ESCENARIO QA «INTERNAL VIVO» (solo local).
 *
 * Once problemas internos que evolucionan durante días: afectaciones que se
 * acumulan y severidad que sube. Sirve para demostrar historial, detalle,
 * cronología, `severityAtOccurrence`, personaje, integridad y listados.
 *
 * G y H existen para la tabla INTERNOS del Director: G es un caso LEGACY
 * (anterior a INTERNAL vivo; su fila REPORTED la escribió el backfill días
 * después del alta → historial no fiable) y H un activo EN RIESGO de vencer.
 *
 * I, J y K existen para la lámina «Duración × afectaciones»: I antiguo y
 * acumulando (arriba-derecha), J antiguo con pocas registradas (abajo-
 * derecha), K reciente y ya golpeando (arriba-izquierda).
 *
 * LOS ESCALAMIENTOS SON HISTORIA MOCK EXPLÍCITA. Se registran como AUTO_TIME
 * con `policy_code = 'qa-mock-history'` para que nadie los confunda con el
 * resultado de una política aprobada, y la situación queda con
 * `severity_escalation_policy_code = NULL`: el barrido nunca los toca ni los
 * continúa. No hay política productiva activa.
 *
 * FECHAS. Relativas al ANCLA (instante de la siembra, redondeado a 30 min)
 * para que la demo muestre fechas creíbles el día en que se use: «día 1,
 * día 2, día 4…» son días reales, no minutos. Estructura e ids son
 * deterministas; nunca se siembra un instante futuro.
 */

export const QA_VIVO_ID_PREFIX = '5eedc0de-0e1f-';
export const QA_VIVO_SCENARIO_KEY = 'qa-internal-vivo';
/** Marca de la historia mock: NO es una política. */
export const QA_VIVO_MOCK_POLICY_CODE = 'qa-mock-history';

export function qaVivoId(name: string): string {
  const h = createHash('sha1')
    .update(`${QA_VIVO_SCENARIO_KEY}:${name}`)
    .digest('hex');
  return `${QA_VIVO_ID_PREFIX}4${h.slice(0, 3)}-8${h.slice(3, 6)}-${h.slice(6, 18)}`;
}

/** Colombia: UTC−5 sin horario de verano. */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/** Ancla por defecto: ahora, redondeado hacia abajo a 30 minutos. */
export function qaVivoAnchor(now: Date = new Date()): Date {
  const step = 30 * MIN_MS;
  return new Date(Math.floor(now.getTime() / step) * step);
}

/** «hace `daysBefore` días, a las hh:mm de Bogotá», relativo al ancla. */
function bogotaDayAt(anchor: Date, daysBefore: number, hhmm: string): Date {
  const [hh, mm] = hhmm.split(':').map(Number);
  const localAnchor = new Date(anchor.getTime() + BOGOTA_OFFSET_MS);
  const localMidnight = Date.UTC(
    localAnchor.getUTCFullYear(),
    localAnchor.getUTCMonth(),
    localAnchor.getUTCDate(),
  );
  return new Date(
    localMidnight -
      daysBefore * DAY_MS +
      (hh * 60 + mm) * MIN_MS -
      BOGOTA_OFFSET_MS,
  );
}

type At = { daysBefore: number; at: string } | { hoursBefore: number };

function resolveAt(anchor: Date, at: At): Date {
  return 'hoursBefore' in at
    ? new Date(anchor.getTime() - at.hoursBefore * 60 * MIN_MS)
    : bogotaDayAt(anchor, at.daysBefore, at.at);
}

/** Quién actúa. Se resuelve contra usuarios reales: no se inventan autores. */
export type QaVivoActor = string; // email

export interface QaVivoScenarioSpec {
  key: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';
  label: string;
  coordinationCode: string;
  categoryCode: string;
  title: string;
  description: string;
  reportedSeverity: SituationSeverity;
  author: QaVivoActor;
  /** Quien pasa a «En atención» y, si aplica, cierra. */
  responsible: QaVivoActor;
  occurredAt: At;
  createdAt: At;
  inProgressAt: At | null;
  closedAt: At | null;
  learning: string | null;
  escalations: Array<{ to: SituationSeverity; at: At }>;
  /**
   * Solo LEGACY: instante en que se escribió la fila REPORTED (simula el
   * backfill de la migración). Sin él, se escribe junto con el alta.
   */
  reportedRecordedAt?: At;
  consequences: Array<{
    description: string;
    occurredAt: At;
    /** Minutos entre que ocurre y se registra (o un instante explícito). */
    registeredAt: At | { delayMinutes: number };
    by: QaVivoActor;
  }>;
}

const FABRICA = 'coord-fabrica-contenidos';
const GENERAL = 'coord-general';
const ACADEMICA = 'coord-operaciones-academicas';
const INGENIERIAS = 'coord-ingenierias';

const JOHAN = 'johan_dazasar@cun.edu.co';
const LORENA = 'lorena_gomez@cun.edu.co';
const SARA_ANALISTA = 'sara_murillofo@cun.edu.co';
const LEIDY = 'leidy_bernal@cun.edu.co';
const VIVIANA = 'viviana_cabrera@cun.edu.co';

export const QA_VIVO_SCENARIOS: readonly QaVivoScenarioSpec[] = [
  {
    key: 'A',
    label: 'Deterioro fuerte',
    coordinationCode: FABRICA,
    categoryCode: 'INTERNET',
    title: 'Intermitencia prolongada de internet en el estudio',
    description:
      'Existe conexión pero el servicio funciona de forma intermitente en el estudio de grabación y en las salas de edición.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: JOHAN,
    responsible: JOHAN,
    occurredAt: { daysBefore: 8, at: '08:30' },
    createdAt: { daysBefore: 8, at: '09:10' },
    inProgressAt: { daysBefore: 8, at: '11:00' },
    closedAt: null,
    learning: null,
    escalations: [
      { to: SituationSeverity.HIGH, at: { daysBefore: 5, at: '09:10' } },
      { to: SituationSeverity.CRITICAL, at: { daysBefore: 2, at: '09:10' } },
    ],
    consequences: [
      {
        description:
          'Se retrasó la entrega de dos contenidos audiovisuales al aula virtual.',
        occurredAt: { daysBefore: 8, at: '10:00' },
        registeredAt: { delayMinutes: 25 },
        by: JOHAN,
      },
      {
        description:
          'No fue posible cargar archivos pesados (videos de más de 500 MB) al repositorio de contenidos.',
        occurredAt: { daysBefore: 7, at: '15:40' },
        // Se registró al día siguiente: la UI lo muestra como «Registrada el…».
        registeredAt: { daysBefore: 6, at: '09:05' },
        by: JOHAN,
      },
      {
        description:
          'Se aplazó la publicación de cuatro piezas del curso de Ingeniería de Software.',
        occurredAt: { daysBefore: 5, at: '11:20' },
        registeredAt: { delayMinutes: 25 },
        by: JOHAN,
      },
      {
        description:
          'Se suspendieron dos sesiones de grabación en el estudio por caída del enlace.',
        occurredAt: { daysBefore: 3, at: '09:15' },
        registeredAt: { delayMinutes: 25 },
        by: LORENA,
      },
      {
        description:
          'Se reprogramó para la próxima semana la entrega de contenidos a Operación Académica.',
        occurredAt: { daysBefore: 1, at: '16:30' },
        registeredAt: { delayMinutes: 20 },
        by: JOHAN,
      },
    ],
  },
  {
    key: 'B',
    label: 'Deterioro moderado',
    coordinationCode: GENERAL,
    categoryCode: 'APLICATIVOS',
    title: 'Fallas intermitentes del aplicativo de matrícula',
    description:
      'El aplicativo de matrícula rechaza de forma intermitente las cargas masivas de registros.',
    reportedSeverity: SituationSeverity.LOW,
    author: SARA_ANALISTA,
    // Coordinación General: el ANALISTA puede avanzarlo y cerrarlo.
    responsible: SARA_ANALISTA,
    occurredAt: { daysBefore: 12, at: '13:20' },
    createdAt: { daysBefore: 12, at: '14:00' },
    inProgressAt: { daysBefore: 11, at: '09:00' },
    closedAt: null,
    learning: null,
    escalations: [
      { to: SituationSeverity.MEDIUM, at: { daysBefore: 5, at: '14:00' } },
    ],
    consequences: [
      {
        description:
          'Se procesaron manualmente 40 registros de matrícula que el aplicativo rechazó.',
        occurredAt: { daysBefore: 10, at: '10:30' },
        registeredAt: { delayMinutes: 30 },
        by: SARA_ANALISTA,
      },
      {
        description:
          'Se demoró la emisión de certificados de dos estudiantes por bloqueo del módulo.',
        occurredAt: { daysBefore: 4, at: '15:10' },
        registeredAt: { delayMinutes: 20 },
        by: SARA_ANALISTA,
      },
    ],
  },
  {
    key: 'C',
    label: 'Resolución rápida',
    coordinationCode: FABRICA,
    categoryCode: 'EQUIPOS',
    title: 'Equipo de edición fuera de servicio',
    description:
      'Uno de los equipos de edición de video no enciende después del corte de energía.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: JOHAN,
    responsible: JOHAN,
    occurredAt: { daysBefore: 6, at: '08:15' },
    createdAt: { daysBefore: 6, at: '08:40' },
    inProgressAt: { daysBefore: 6, at: '09:30' },
    closedAt: { daysBefore: 5, at: '10:15' },
    learning:
      'Se dejó un equipo de respaldo configurado en el estudio para reemplazos inmediatos.',
    escalations: [],
    consequences: [
      {
        description:
          'Se reasignó la edición de un video a otro equipo y se entregó con medio día de retraso.',
        occurredAt: { daysBefore: 6, at: '09:00' },
        registeredAt: { delayMinutes: 20 },
        by: JOHAN,
      },
    ],
  },
  {
    key: 'D',
    label: 'Sin afectaciones',
    coordinationCode: ACADEMICA,
    categoryCode: 'ACAS',
    title: 'Usuarios duplicados en ACAS',
    description:
      'Aparecen estudiantes con dos usuarios activos en ACAS; aún no se ha visto efecto en la operación.',
    reportedSeverity: SituationSeverity.LOW,
    author: LEIDY,
    responsible: LEIDY,
    occurredAt: { daysBefore: 2, at: '09:30' },
    createdAt: { daysBefore: 2, at: '10:00' },
    inProgressAt: null,
    closedAt: null,
    learning: null,
    escalations: [],
    consequences: [],
  },
  {
    key: 'E',
    label: 'Cerrado con historia',
    coordinationCode: INGENIERIAS,
    categoryCode: 'INFRAESTRUCTURA',
    title: 'Filtraciones en el laboratorio de redes',
    description:
      'Hay filtraciones de agua en el techo del laboratorio de redes cuando llueve.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: VIVIANA,
    responsible: VIVIANA,
    occurredAt: { daysBefore: 21, at: '07:30' },
    createdAt: { daysBefore: 21, at: '08:00' },
    inProgressAt: { daysBefore: 21, at: '10:00' },
    closedAt: { daysBefore: 14, at: '17:30' },
    learning:
      'Se impermeabilizó la cubierta y se definió revisión preventiva antes de cada temporada de lluvias.',
    escalations: [
      { to: SituationSeverity.HIGH, at: { daysBefore: 17, at: '08:00' } },
    ],
    consequences: [
      {
        description: 'Se trasladaron dos clases prácticas a otro salón.',
        occurredAt: { daysBefore: 21, at: '09:00' },
        registeredAt: { delayMinutes: 30 },
        by: VIVIANA,
      },
      {
        description:
          'Se desconectaron por precaución tres racks del laboratorio durante la lluvia.',
        occurredAt: { daysBefore: 19, at: '14:00' },
        registeredAt: { delayMinutes: 40 },
        by: VIVIANA,
      },
      {
        description:
          'Se aplazó la práctica evaluada de redes de un grupo de quinto semestre.',
        occurredAt: { daysBefore: 16, at: '11:00' },
        registeredAt: { daysBefore: 15, at: '09:00' },
        by: VIVIANA,
      },
    ],
  },
  {
    key: 'F',
    label: 'Recién creado',
    coordinationCode: FABRICA,
    categoryCode: 'INTERNET',
    title: 'Caída del wifi en la sala de edición 2',
    description:
      'La red inalámbrica de la sala de edición 2 no tiene servicio desde esta mañana.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: JOHAN,
    responsible: JOHAN,
    occurredAt: { hoursBefore: 2.5 },
    createdAt: { hoursBefore: 2 },
    inProgressAt: null,
    closedAt: null,
    learning: null,
    escalations: [],
    consequences: [
      {
        // Afectación inicial: ocurre cuando ocurrió el problema y se registra
        // en el alta, como hace ReportProblemForm.
        description:
          'No se pudo sincronizar el material del día con el servidor de la sala.',
        occurredAt: { hoursBefore: 2.5 },
        registeredAt: { hoursBefore: 2 },
        by: JOHAN,
      },
    ],
  },
  {
    key: 'G',
    label: 'Legacy (anterior a INTERNAL vivo)',
    coordinationCode: ACADEMICA,
    categoryCode: 'APLICATIVOS',
    title: 'Retraso en la publicación de horarios en el portal',
    description:
      'Los horarios de los grupos nuevos tardan varios días en verse en el portal estudiantil.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: LEIDY,
    responsible: LEIDY,
    occurredAt: { daysBefore: 40, at: '08:00' },
    createdAt: { daysBefore: 40, at: '08:30' },
    inProgressAt: { daysBefore: 39, at: '09:00' },
    closedAt: null,
    learning: null,
    escalations: [],
    // El backfill escribió la fila REPORTED semanas después del alta.
    reportedRecordedAt: { daysBefore: 9, at: '03:00' },
    consequences: [],
  },
  {
    key: 'H',
    label: 'En riesgo de vencer',
    coordinationCode: FABRICA,
    categoryCode: 'EQUIPOS',
    title: 'Micrófonos inalámbricos del estudio con interferencia',
    description:
      'Los micrófonos inalámbricos del estudio captan interferencia y cortes durante las grabaciones.',
    // HIGH: plazo 72 h, aviso 24 h. Registrado hace 54 h → vence en 18 h.
    reportedSeverity: SituationSeverity.HIGH,
    author: JOHAN,
    responsible: JOHAN,
    occurredAt: { hoursBefore: 55 },
    createdAt: { hoursBefore: 54 },
    inProgressAt: { hoursBefore: 50 },
    closedAt: null,
    learning: null,
    escalations: [],
    consequences: [
      {
        description:
          'Se repitió la grabación de una clase por cortes de audio.',
        occurredAt: { hoursBefore: 30 },
        registeredAt: { delayMinutes: 15 },
        by: JOHAN,
      },
    ],
  },
  {
    key: 'I',
    label: 'Antiguo y acumulando',
    coordinationCode: INGENIERIAS,
    categoryCode: 'APLICATIVOS',
    title: 'Licencias del software de simulación vencidas en laboratorios',
    description:
      'Las licencias del software de simulación de circuitos vencieron y solo funcionan en modo demostración.',
    reportedSeverity: SituationSeverity.MEDIUM,
    author: VIVIANA,
    responsible: VIVIANA,
    occurredAt: { daysBefore: 30, at: '08:00' },
    createdAt: { daysBefore: 30, at: '09:00' },
    inProgressAt: { daysBefore: 29, at: '10:00' },
    closedAt: null,
    learning: null,
    escalations: [
      { to: SituationSeverity.HIGH, at: { daysBefore: 16, at: '09:00' } },
    ],
    consequences: [
      {
        description:
          'Se aplazó la práctica de simulación de dos grupos de electrónica.',
        occurredAt: { daysBefore: 28, at: '10:00' },
        registeredAt: { delayMinutes: 30 },
        by: VIVIANA,
      },
      {
        description:
          'Los estudiantes no pudieron exportar los resultados de sus simulaciones.',
        occurredAt: { daysBefore: 21, at: '15:00' },
        registeredAt: { delayMinutes: 40 },
        by: VIVIANA,
      },
      {
        description:
          'Se reprogramó un parcial práctico por falta de licencias.',
        occurredAt: { daysBefore: 12, at: '09:30' },
        registeredAt: { delayMinutes: 25 },
        by: VIVIANA,
      },
      {
        description:
          'Un docente tuvo que dictar la sesión con capturas en lugar del software.',
        occurredAt: { daysBefore: 4, at: '11:00' },
        registeredAt: { delayMinutes: 20 },
        by: VIVIANA,
      },
    ],
  },
  {
    key: 'J',
    label: 'Antiguo con pocas afectaciones',
    coordinationCode: INGENIERIAS,
    categoryCode: 'EQUIPOS',
    title: 'Osciloscopios descalibrados en el laboratorio de física',
    description:
      'Dos osciloscopios del laboratorio de física muestran lecturas desplazadas.',
    reportedSeverity: SituationSeverity.LOW,
    author: VIVIANA,
    responsible: VIVIANA,
    occurredAt: { daysBefore: 20, at: '14:00' },
    createdAt: { daysBefore: 20, at: '14:30' },
    inProgressAt: null,
    closedAt: null,
    learning: null,
    escalations: [],
    consequences: [
      {
        description:
          'Un grupo repitió la medición con equipos prestados de otra sede.',
        occurredAt: { daysBefore: 15, at: '10:00' },
        registeredAt: { delayMinutes: 30 },
        by: VIVIANA,
      },
    ],
  },
  {
    key: 'K',
    label: 'Reciente y ya golpeando',
    coordinationCode: ACADEMICA,
    categoryCode: 'ACAS',
    title: 'Notas del corte que no se reflejan en ACAS',
    description:
      'Las notas cargadas por los docentes no aparecen en ACAS para los estudiantes.',
    reportedSeverity: SituationSeverity.HIGH,
    author: LEIDY,
    responsible: LEIDY,
    occurredAt: { daysBefore: 5, at: '07:30' },
    createdAt: { daysBefore: 5, at: '08:00' },
    inProgressAt: { daysBefore: 5, at: '09:00' },
    closedAt: null,
    learning: null,
    escalations: [],
    consequences: [
      {
        description:
          'Se atendieron 25 solicitudes de estudiantes que no ven sus notas.',
        occurredAt: { daysBefore: 4, at: '10:00' },
        registeredAt: { delayMinutes: 30 },
        by: LEIDY,
      },
      {
        description:
          'Se aplazó el cierre del corte académico de dos programas.',
        occurredAt: { daysBefore: 3, at: '16:00' },
        registeredAt: { delayMinutes: 20 },
        by: LEIDY,
      },
      {
        description: 'Se retrasaron las alertas tempranas de bajo rendimiento.',
        occurredAt: { daysBefore: 1, at: '11:00' },
        registeredAt: { delayMinutes: 25 },
        by: LEIDY,
      },
    ],
  },
];

/* ─────────────────────────── Resolución a instantes ─────────────────────── */

export interface QaVivoRecord {
  key: QaVivoScenarioSpec['key'];
  id: string;
  spec: QaVivoScenarioSpec;
  occurredAt: Date;
  createdAt: Date;
  inProgressAt: Date | null;
  closedAt: Date | null;
  status: SituationStatus;
  /** Instante de la fila REPORTED (= alta salvo en LEGACY). */
  reportedRecordedAt: Date;
  /** Severidad efectiva final: la del último escalamiento, o la reportada. */
  severity: SituationSeverity;
  escalations: Array<{
    id: string;
    from: SituationSeverity;
    to: SituationSeverity;
    effectiveAt: Date;
    /** Registro del sistema: unos minutos después, como haría el barrido. */
    recordedAt: Date;
    ruleKey: string;
  }>;
  consequences: Array<{
    id: string;
    description: string;
    occurredAt: Date;
    createdAt: Date;
    by: QaVivoActor;
  }>;
}

export function buildQaVivoRecords(anchor: Date): QaVivoRecord[] {
  return QA_VIVO_SCENARIOS.map((spec) => {
    const id = qaVivoId(`situation:${spec.key}`);
    let level = spec.reportedSeverity;
    const escalations = spec.escalations.map((step, index) => {
      const effectiveAt = resolveAt(anchor, step.at);
      const item = {
        id: qaVivoId(`severity:${spec.key}:${index + 1}`),
        from: level,
        to: step.to,
        effectiveAt,
        recordedAt: new Date(effectiveAt.getTime() + 12 * MIN_MS),
        ruleKey: `qa-mock-step-${index + 1}`,
      };
      level = step.to;
      return item;
    });
    const consequences = spec.consequences.map((c, index) => {
      const occurredAt = resolveAt(anchor, c.occurredAt);
      const createdAt =
        'delayMinutes' in c.registeredAt
          ? new Date(
              occurredAt.getTime() + c.registeredAt.delayMinutes * MIN_MS,
            )
          : resolveAt(anchor, c.registeredAt);
      return {
        id: qaVivoId(`consequence:${spec.key}:${index + 1}`),
        description: c.description,
        occurredAt,
        createdAt,
        by: c.by,
      };
    });
    const closedAt = spec.closedAt ? resolveAt(anchor, spec.closedAt) : null;
    const inProgressAt = spec.inProgressAt
      ? resolveAt(anchor, spec.inProgressAt)
      : null;
    return {
      key: spec.key,
      id,
      spec,
      occurredAt: resolveAt(anchor, spec.occurredAt),
      createdAt: resolveAt(anchor, spec.createdAt),
      inProgressAt,
      closedAt,
      reportedRecordedAt: spec.reportedRecordedAt
        ? resolveAt(anchor, spec.reportedRecordedAt)
        : resolveAt(anchor, spec.createdAt),
      status: closedAt
        ? SituationStatus.CLOSED
        : inProgressAt
          ? SituationStatus.IN_PROGRESS
          : SituationStatus.OPEN,
      severity: level,
      escalations,
      consequences,
    };
  });
}

/**
 * Coherencia del escenario ANTES de tocar la base: nada futuro, orden
 * temporal, escalamientos que suben y ninguno después del cierre,
 * afectaciones dentro de la vida del problema.
 */
export function assertQaVivoRecordsCoherent(
  records: readonly QaVivoRecord[],
  now: Date,
): void {
  const problems: string[] = [];
  for (const r of records) {
    const instants = [
      r.occurredAt,
      r.createdAt,
      r.inProgressAt,
      r.closedAt,
      r.reportedRecordedAt,
      ...r.escalations.flatMap((e) => [e.effectiveAt, e.recordedAt]),
      ...r.consequences.flatMap((c) => [c.occurredAt, c.createdAt]),
    ].filter((d): d is Date => d !== null);
    if (instants.some((d) => d.getTime() > now.getTime())) {
      problems.push(`${r.key}: instante futuro`);
    }
    if (r.occurredAt > r.createdAt)
      problems.push(`${r.key}: ocurre después del registro`);
    if (r.reportedRecordedAt < r.createdAt) {
      problems.push(`${r.key}: fila REPORTED anterior al alta`);
    }
    if (r.inProgressAt && r.inProgressAt < r.createdAt) {
      problems.push(`${r.key}: En atención antes del registro`);
    }
    let last = r.createdAt;
    for (const e of r.escalations) {
      if (e.effectiveAt < last)
        problems.push(`${r.key}: escalamiento fuera de orden`);
      if (r.closedAt && e.effectiveAt > r.closedAt) {
        problems.push(`${r.key}: escalamiento después del cierre`);
      }
      last = e.effectiveAt;
    }
    for (const c of r.consequences) {
      if (c.occurredAt < r.occurredAt)
        problems.push(`${r.key}: afectación anterior al problema`);
      if (c.createdAt < c.occurredAt)
        problems.push(`${r.key}: afectación registrada antes de ocurrir`);
      if (r.closedAt && c.createdAt > r.closedAt) {
        problems.push(`${r.key}: afectación registrada después del cierre`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Escenario INTERNAL vivo incoherente: ${problems.join('; ')}`,
    );
  }
}
