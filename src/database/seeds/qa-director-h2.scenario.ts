import { createHash } from 'crypto';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';

/* ═══════════════════════════════════════════════════════════════════════
 * ESCENARIO QA · DIRECTOR · H2 2026 (solo LOCAL / QA, nunca producción)
 *
 * Para qué existe: validar a ojo, contra la app REAL (Postgres → repositorio
 * → servicio → API → frontend), las gráficas de ESTADO del DIRECTOR (Carga,
 * Movimiento, Antigüedad) y el drill-down ciclo → mes → semana → día.
 *
 * Alcance: Coordinación General de Operaciones + Operación Académica + sus
 * cinco hijas. La jerarquía NO existe en la base de datos (`coordinations` no
 * tiene parent); la fuente es la estructura de producto declarada en
 * NOVEX_FRONTEND/src/modules/operational-cards/data/productHierarchy.ts.
 *
 * Reglas del dataset:
 *   - Fechas ABSOLUTAS (hora Bogotá): 1 jul – 7 oct 2026. Nada en nov/dic.
 *   - Determinista: sin Math.random ni fechas relativas a «hoy».
 *   - Ids deterministas con prefijo fijo QA_ID_PREFIX: así se reemplaza
 *     (idempotente) y se limpia SOLO este escenario, sin marcar títulos.
 *   - La carga activa NO se escribe: se deriva de created_at / closed_at.
 *     Cada coordinación tiene una «personalidad» (ver `pattern`).
 * ═══════════════════════════════════════════════════════════════════════ */

/** Prefijo de los UUID del escenario (48 bits fijos: colisión despreciable). */
export const QA_ID_PREFIX = '5eedc0de-d1e2-';
export const QA_SCENARIO_KEY = 'qa-director-h2';

/** Último instante con eventos (Bogotá). El seed se niega a correr antes. */
export const QA_ANCHOR_LOCAL = '2026-10-07 06:30';
export const QA_WINDOW = { from: '2026-07-01', to: '2026-10-07' } as const;

export type QaScopeKey =
  | 'general'
  | 'academica'
  | 'bellasArtes'
  | 'empresarial'
  | 'ingenierias'
  | 'transversales'
  | 'negocios';

/** Códigos técnicos reales (catálogo actual), con su rol en el escenario. */
export const QA_SCOPE: Readonly<
  Record<QaScopeKey, { code: string; label: string; parent: QaScopeKey | null }>
> = {
  general: {
    code: 'coord-general',
    label: 'Coordinación General de Operaciones',
    parent: null,
  },
  academica: {
    code: 'coord-operaciones-academicas',
    label: 'Operación Académica',
    parent: null,
  },
  bellasArtes: {
    code: 'coord-bellas-artes',
    label: 'Bellas Artes',
    parent: 'academica',
  },
  empresarial: {
    code: 'coord-empresarial',
    label: 'Transformación Empresarial',
    parent: 'academica',
  },
  ingenierias: {
    code: 'coord-ingenierias',
    label: 'Ingenierías',
    parent: 'academica',
  },
  transversales: {
    code: 'coord-transversales',
    label: 'Transversales',
    parent: 'academica',
  },
  negocios: { code: 'coord-negocios', label: 'Negocios', parent: 'academica' },
};

/** Categorías REALES usadas (code de incident_categories, seleccionables). */
export type QaCategoryCode =
  | 'INTERNET'
  | 'ACAS'
  | 'APLICATIVOS'
  | 'EQUIPOS'
  | 'INFRAESTRUCTURA'
  | 'TICKETS';

const { LOW, MEDIUM, HIGH, CRITICAL } = SituationSeverity;
type Sev = SituationSeverity;
type Active = 'OPEN' | 'IN_PROGRESS';

/**
 * Una situación del escenario. `closed` ausente = sigue activa (con `status`).
 * `cat` = INTERNAL de esa categoría; `affects` = INTER donde la coordinación
 * dueña de la lista es RESPONSABLE y `affects` es la AFECTADA.
 */
export type QaRow = {
  key: string;
  title: string;
  /** 'MM-DD HH:mm' (2026, hora Bogotá). */
  created: string;
  closed?: string;
  status?: Active;
  sev: Sev;
  cat?: QaCategoryCode;
  affects?: QaScopeKey;
};

export type QaCoordinationScenario = {
  scope: QaScopeKey;
  /** Personalidad esperada de la Carga (se verifica en tests). */
  pattern: string;
  rows: QaRow[];
};

/* ─────────────── Coordinación General: sube → pico → baja → repunte ───── */
const GENERAL: QaCoordinationScenario = {
  scope: 'general',
  pattern:
    'Reportados 5/9/6/8 · Solucionados 2/4/8/7 → activos 3 → 8 (pico) → 6 → 7',
  rows: [
    {
      key: 'G01',
      title: 'Fallas eléctricas intermitentes en sede centro',
      created: '07-03 09:10',
      closed: '07-21 16:00',
      sev: MEDIUM,
      cat: 'INFRAESTRUCTURA',
    },
    // A · arrastrado desde julio, sigue activo (90+ días).
    {
      key: 'G02',
      title: 'Filtraciones en el cuarto de servidores de sede norte',
      created: '07-08 08:40',
      status: 'IN_PROGRESS',
      sev: HIGH,
      cat: 'INFRAESTRUCTURA',
    },
    // B · julio → septiembre.
    {
      key: 'G03',
      title: 'Caídas de wifi en salas de docentes',
      created: '07-14 10:20',
      closed: '09-09 11:30',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'G04',
      title: 'Tickets de soporte sin categorizar',
      created: '07-22 14:05',
      closed: '07-30 09:00',
      sev: LOW,
      cat: 'TICKETS',
    },
    {
      key: 'G05',
      title: 'Proyectores sin mantenimiento en auditorio',
      created: '07-28 11:15',
      closed: '08-18 15:20',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    {
      key: 'G06',
      title: 'Error en el tablero de turnos de vigilancia',
      created: '08-03 09:00',
      closed: '08-14 17:00',
      sev: HIGH,
      cat: 'APLICATIVOS',
    },
    {
      key: 'G07',
      title: 'Consolidado de indicadores operativos sin entregar',
      created: '08-05 10:30',
      status: 'OPEN',
      sev: HIGH,
      affects: 'academica',
    },
    {
      key: 'G08',
      title: 'Corte de energía prolongado en sede sur',
      created: '08-11 08:15',
      closed: '08-26 12:00',
      sev: CRITICAL,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'G09',
      title: 'Saturación del canal de internet en jornada nocturna',
      created: '08-13 13:40',
      closed: '08-29 10:10',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'G10',
      title: 'Equipos de cómputo de laboratorio bloqueados',
      created: '08-19 09:50',
      closed: '09-04 16:30',
      sev: HIGH,
      cat: 'EQUIPOS',
    },
    {
      key: 'G11',
      title: 'Calendario de mantenimientos sin compartir',
      created: '08-20 15:00',
      closed: '09-10 09:40',
      sev: MEDIUM,
      affects: 'academica',
    },
    {
      key: 'G12',
      title: 'Reportes de ocupación de aulas desactualizados',
      created: '08-25 10:00',
      closed: '09-15 14:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'G13',
      title: 'Inventario de licencias pendiente',
      created: '08-27 11:20',
      closed: '09-22 10:15',
      sev: LOW,
      affects: 'transversales',
    },
    // C · agosto → octubre.
    {
      key: 'G14',
      title: 'Ascensor fuera de servicio en edificio administrativo',
      created: '08-31 09:30',
      closed: '10-02 11:00',
      sev: HIGH,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'G15',
      title: 'Reasignación manual de tickets duplicados',
      created: '09-02 08:50',
      closed: '09-18 17:20',
      sev: LOW,
      cat: 'TICKETS',
    },
    {
      key: 'G16',
      title: 'Validación de capacidad eléctrica para laboratorios',
      created: '09-12 10:10',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      affects: 'ingenierias',
    },
    {
      key: 'G17',
      title: 'Cámaras de seguridad sin grabación',
      created: '09-17 14:30',
      closed: '09-29 09:00',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    {
      key: 'G18',
      title: 'Intermitencia de internet en sala de evaluación',
      created: '09-24 09:20',
      status: 'OPEN',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'G19',
      title: 'Iluminación deficiente en parqueadero',
      created: '10-01 08:30',
      status: 'IN_PROGRESS',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'G20',
      title: 'Error de acceso al módulo de reservas',
      created: '10-02 10:45',
      closed: '10-06 15:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'G21',
      title: 'Plan de contingencia de sedes sin socializar',
      created: '10-05 09:15',
      status: 'OPEN',
      sev: HIGH,
      affects: 'academica',
    },
    {
      key: 'G22',
      title: 'Punto de red caído en recepción',
      created: '10-06 08:20',
      closed: '10-07 06:10',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'G23',
      title: 'Falla de sincronización del directorio institucional',
      created: '10-07 06:00',
      status: 'OPEN',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    // ── RESOLUCIÓN (QA): cierres rápidos en OCT (mejora frente a SEP) ──
    // R · 30 minutos.
    {
      key: 'GR1',
      title: 'Proyector del auditorio sin señal',
      created: '10-05 10:00',
      closed: '10-05 10:30',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    // R · mismo día, 4 horas (duración > 0, no «0 días»).
    {
      key: 'GR2',
      title: 'Acceso bloqueado a la mesa de ayuda',
      created: '10-02 08:00',
      closed: '10-02 12:00',
      sev: MEDIUM,
      cat: 'TICKETS',
    },
    // R · cruza medianoche: 23:30 → 00:30 = 1 hora (no «1 día»).
    {
      key: 'GR3',
      title: 'Caída nocturna del portal de pagos',
      created: '10-03 23:30',
      closed: '10-04 00:30',
      sev: HIGH,
      cat: 'APLICATIVOS',
    },
    // R · 2 días exactos (rango 1–3 d), cerrado en SEP.
    {
      key: 'GR4',
      title: 'Cableado suelto en la sala de juntas',
      created: '09-08 09:00',
      closed: '09-10 09:00',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    // R · creado SEP, cerrado EXACTAMENTE 1 OCT 00:00 Bogotá → pertenece a OCT.
    {
      key: 'GR5',
      title: 'Cambio de contraseñas masivo pendiente',
      created: '09-24 10:00',
      closed: '10-01 00:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
  ],
};

/* ─────── Operación Académica: crece → crece fuerte → empieza recuperación ── */
const ACADEMICA: QaCoordinationScenario = {
  scope: 'academica',
  pattern:
    'Reportados 4/8/12/5 · Solucionados 1/4/5/8 → activos 3 → 7 → 14 → 11 (con casos viejos)',
  rows: [
    // Top 5 de antigüedad (títulos inconfundibles): O01, O06, O09, O13, O15.
    {
      key: 'O01',
      title: 'Demora histórica en homologaciones',
      created: '07-02 09:00',
      status: 'IN_PROGRESS',
      sev: HIGH,
      cat: 'ACAS',
    },
    {
      key: 'O02',
      title: 'Lentitud del portal de inscripciones',
      created: '07-09 10:30',
      closed: '07-27 15:00',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'O03',
      title: 'Error en la carga masiva de horarios',
      created: '07-16 08:45',
      closed: '09-15 16:10',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'O04',
      title: 'Falla de acceso a ACAS para tutores',
      created: '07-29 11:00',
      closed: '08-14 12:30',
      sev: MEDIUM,
      cat: 'ACAS',
    },
    {
      key: 'O05',
      title: 'Intermitencia de internet en evaluación presencial',
      created: '08-04 09:20',
      closed: '08-21 10:00',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'O06',
      title: 'Fallo prolongado en la generación de certificados',
      created: '08-07 14:15',
      status: 'OPEN',
      sev: CRITICAL,
      affects: 'bellasArtes',
    },
    {
      key: 'O07',
      title: 'Actas de grado pendientes de firma',
      created: '08-12 10:00',
      closed: '10-02 09:30',
      sev: HIGH,
      affects: 'empresarial',
    },
    {
      key: 'O08',
      title: 'Caída del aula virtual en parciales',
      created: '08-18 08:30',
      closed: '08-28 17:45',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'O09',
      title: 'Bloqueo antiguo en matrícula de reintegros',
      created: '08-24 09:40',
      status: 'IN_PROGRESS',
      sev: HIGH,
      cat: 'APLICATIVOS',
    },
    {
      key: 'O10',
      title: 'Programación de salones pendiente',
      created: '08-26 13:00',
      closed: '09-23 11:20',
      sev: MEDIUM,
      affects: 'ingenierias',
    },
    {
      key: 'O11',
      title: 'Usuarios duplicados en ACAS',
      created: '08-29 10:10',
      closed: '10-06 16:00',
      sev: MEDIUM,
      cat: 'ACAS',
    },
    {
      key: 'O12',
      title: 'Pérdida de conexión en salas de cómputo',
      created: '09-01 08:00',
      closed: '10-01 10:30',
      sev: HIGH,
      cat: 'INTERNET',
    },
    {
      key: 'O13',
      title: 'Notas de asignaturas transversales sin sincronizar',
      created: '09-03 11:30',
      status: 'OPEN',
      sev: HIGH,
      affects: 'transversales',
    },
    {
      key: 'O14',
      title: 'Diademas del laboratorio de idiomas dañadas',
      created: '09-07 09:15',
      closed: '09-19 14:40',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    {
      key: 'O15',
      title: 'Aulas sin conectividad en sede norte',
      created: '09-09 10:00',
      status: 'IN_PROGRESS',
      sev: CRITICAL,
      cat: 'INTERNET',
    },
    {
      key: 'O16',
      title: 'Errores en el reporte de asistencia docente',
      created: '09-11 15:30',
      closed: '10-03 10:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'O17',
      title: 'Microcortes de internet en biblioteca',
      created: '09-15 09:00',
      closed: '10-07 06:20',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'O18',
      title: 'Cursos sin docente asignado en ACAS',
      created: '09-18 10:40',
      closed: '10-06 11:00',
      sev: HIGH,
      cat: 'ACAS',
    },
    {
      key: 'O19',
      title: 'Validación de prerrequisitos pendiente',
      created: '09-21 08:30',
      status: 'OPEN',
      sev: MEDIUM,
      affects: 'ingenierias',
    },
    {
      key: 'O20',
      title: 'Aire acondicionado averiado en sala de juntas',
      created: '09-24 14:00',
      closed: '09-30 16:30',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'O21',
      title: 'Intermitencia de internet en evaluación virtual',
      created: '09-23 09:00',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'O22',
      title: 'Reportes de ACAS con columnas vacías',
      created: '09-29 10:20',
      status: 'OPEN',
      sev: LOW,
      cat: 'ACAS',
    },
    {
      key: 'O23',
      title: 'Red inalámbrica inestable en sede centro',
      created: '10-01 09:10',
      status: 'OPEN',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    // Semana 5–11 OCT (días irregulares): lun 2 rep / 0 cer · mar 1 / 2 · mié 0 / 2.
    {
      key: 'O24',
      title: 'Error de sincronización de notas del primer corte',
      created: '10-05 08:15',
      closed: '10-07 06:30',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'O25',
      title: 'Oferta de electivas sin publicar',
      created: '10-05 10:40',
      status: 'OPEN',
      sev: HIGH,
      affects: 'negocios',
    },
    {
      key: 'O26',
      title: 'Señalización de salones desactualizada',
      created: '10-06 09:30',
      status: 'OPEN',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    // ── RESOLUCIÓN (QA) ──
    // R · 18 horas, en la semana 28 SEP – 4 OCT (semana con varios cierres).
    {
      key: 'OR1',
      title: 'Aula virtual sin matrícula de un grupo',
      created: '09-29 15:00',
      closed: '09-30 09:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    // R · 1,5 días (36 h), misma semana.
    {
      key: 'OR2',
      title: 'Listas de asistencia duplicadas',
      created: '10-02 08:00',
      closed: '10-03 20:00',
      sev: LOW,
      cat: 'ACAS',
    },
    // R · 4 días, en AGO.
    {
      key: 'OR3',
      title: 'Salón asignado dos veces en la franja nocturna',
      created: '08-03 09:00',
      closed: '08-07 09:00',
      sev: MEDIUM,
      cat: 'ACAS',
    },
  ],
};

/* ─────────────── Hija tipo A · Bellas Artes: mejorando ─────────────────── */
const BELLAS_ARTES: QaCoordinationScenario = {
  scope: 'bellasArtes',
  pattern: 'A · mejorando: activos 4 → 6 → 3 → 1 (cierra más de lo que entra)',
  rows: [
    {
      key: 'B01',
      title: 'Iluminación del teatro sin mantenimiento',
      created: '07-06 09:00',
      closed: '09-08 10:00',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    {
      key: 'B02',
      title: 'Humedad en el taller de artes plásticas',
      created: '07-13 10:30',
      closed: '09-12 15:00',
      sev: HIGH,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'B03',
      title: 'Inscripción a talleres libres con errores',
      created: '07-20 14:00',
      closed: '08-25 11:00',
      sev: LOW,
      cat: 'APLICATIVOS',
    },
    {
      key: 'B04',
      title: 'Horarios de ensayo cruzados',
      created: '07-27 09:45',
      closed: '10-01 16:00',
      sev: MEDIUM,
      affects: 'transversales',
    },
    {
      key: 'B05',
      title: 'Sin internet en el aula de producción audiovisual',
      created: '08-05 11:10',
      closed: '09-17 09:30',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'B06',
      title: 'Instrumentos sin inventario actualizado',
      created: '08-17 08:40',
      closed: '09-24 14:20',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    {
      key: 'B07',
      title: 'Plataforma de portafolios artísticos lenta',
      created: '08-28 10:00',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'B08',
      title: 'Cabina de sonido con fallas eléctricas',
      created: '09-09 09:00',
      closed: '09-29 12:00',
      sev: MEDIUM,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'B09',
      title: 'Cámaras de fotografía sin préstamo disponible',
      created: '09-21 15:20',
      closed: '10-03 10:30',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    {
      key: 'B10',
      title: 'Wifi lento en sala de exposiciones',
      created: '10-02 09:00',
      closed: '10-06 17:00',
      sev: LOW,
      cat: 'INTERNET',
    },
  ],
};

/* ─────────────── Hija tipo B · Ingenierías: deteriorándose ─────────────── */
const INGENIERIAS: QaCoordinationScenario = {
  scope: 'ingenierias',
  pattern:
    'B · deteriorándose: activos 1 → 3 → 5 → 8 (entra más de lo que sale)',
  rows: [
    {
      key: 'I01',
      title: 'Licencias de software CAD vencidas',
      created: '07-10 09:00',
      closed: '07-24 14:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'I02',
      title: 'Servidores del laboratorio de redes sin soporte',
      created: '07-23 10:15',
      status: 'OPEN',
      sev: HIGH,
      cat: 'EQUIPOS',
    },
    {
      key: 'I03',
      title: 'Puertos de red deshabilitados en laboratorio',
      created: '08-06 08:30',
      closed: '08-27 16:40',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'I04',
      title: 'Notas de laboratorio sin reportar',
      created: '08-19 11:00',
      closed: '09-16 10:00',
      sev: MEDIUM,
      affects: 'academica',
    },
    {
      key: 'I05',
      title: 'Simuladores de ingeniería sin actualizar',
      created: '08-26 14:20',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'I06',
      title: 'Osciloscopios descalibrados',
      created: '09-04 09:10',
      closed: '09-25 11:30',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    {
      key: 'I07',
      title: 'Laboratorio de electrónica sin ventilación',
      created: '09-14 10:30',
      status: 'OPEN',
      sev: HIGH,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'I08',
      title: 'Horarios compartidos de cálculo sin confirmar',
      created: '09-22 08:45',
      status: 'OPEN',
      sev: MEDIUM,
      affects: 'negocios',
    },
    {
      key: 'I09',
      title: 'Acceso VPN intermitente para docentes',
      created: '09-28 15:10',
      closed: '10-05 09:00',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'I10',
      title: 'Caída del repositorio de proyectos de grado',
      created: '10-01 10:00',
      status: 'IN_PROGRESS',
      sev: CRITICAL,
      cat: 'APLICATIVOS',
    },
    {
      key: 'I11',
      title: 'Impresoras 3D fuera de servicio',
      created: '10-02 09:30',
      status: 'OPEN',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    {
      key: 'I12',
      title: 'Pérdida de paquetes en la red de laboratorios',
      created: '10-05 11:15',
      status: 'OPEN',
      sev: HIGH,
      cat: 'INTERNET',
    },
    {
      key: 'I13',
      title: 'Tomas eléctricas dañadas en sala 302',
      created: '10-06 08:50',
      status: 'OPEN',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    // ── RESOLUCIÓN (QA): AGO pocos y rápidos frente a SEP lentos ──
    // R · 18 horas.
    {
      key: 'IR1',
      title: 'Clave del laboratorio de cómputo vencida',
      created: '08-11 15:00',
      closed: '08-12 09:00',
      sev: LOW,
      cat: 'APLICATIVOS',
    },
    // R · 2,5 días (60 h, rango 1–3 d).
    {
      key: 'IR2',
      title: 'Osciloscopio sin calibración',
      created: '08-18 09:00',
      closed: '08-20 21:00',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    // R · 10 días, en SEP.
    {
      key: 'IR3',
      title: 'Software de simulación sin licencia de red',
      created: '09-01 09:00',
      closed: '09-11 09:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
  ],
};

/* ─────────────── Hija tipo C · Transversales: estable ──────────────────── */
const TRANSVERSALES: QaCoordinationScenario = {
  scope: 'transversales',
  pattern: 'C · estable: activos 1 → 2 → 1 → 2 (entradas ≈ cierres)',
  rows: [
    {
      key: 'T01',
      title: 'Banco de preguntas de inglés sin cargar',
      created: '07-07 09:00',
      closed: '07-18 11:00',
      sev: LOW,
      cat: 'APLICATIVOS',
    },
    {
      key: 'T02',
      title: 'Clases virtuales de inglés con cortes',
      created: '07-15 10:20',
      closed: '08-04 15:30',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'T03',
      title: 'Solicitudes de validación de inglés represadas',
      created: '07-24 13:00',
      closed: '07-31 10:00',
      sev: LOW,
      cat: 'TICKETS',
    },
    {
      key: 'T04',
      title: 'Plataforma de cátedra institucional lenta',
      created: '08-03 09:30',
      closed: '08-20 16:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'T05',
      title: 'Audífonos insuficientes en laboratorio de idiomas',
      created: '08-12 11:00',
      closed: '08-29 10:30',
      sev: LOW,
      cat: 'EQUIPOS',
    },
    {
      key: 'T06',
      title: 'Electiva de apreciación artística sin docente',
      created: '08-21 08:40',
      closed: '09-11 14:00',
      sev: MEDIUM,
      affects: 'bellasArtes',
    },
    {
      key: 'T07',
      title: 'Enlaces de clases grabadas rotos',
      created: '08-28 10:10',
      closed: '09-05 09:20',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'T08',
      title: 'Exámenes de suficiencia sin calificar en plataforma',
      created: '09-08 09:00',
      closed: '09-26 15:40',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'T09',
      title: 'Matrículas de cátedra transversal sin reflejar',
      created: '09-23 10:30',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'T10',
      title: 'Videollamadas de tutoría sin audio',
      created: '10-02 08:50',
      closed: '10-06 10:20',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'T11',
      title: 'Certificados de inglés sin generar',
      created: '10-05 09:40',
      status: 'OPEN',
      sev: LOW,
      cat: 'TICKETS',
    },
  ],
};

/* ─────────────── Hija · Negocios: pico en agosto y descarga ────────────── */
const NEGOCIOS: QaCoordinationScenario = {
  scope: 'negocios',
  pattern: 'Pico de agosto: activos 1 → 5 → 2 → 2',
  rows: [
    {
      key: 'N01',
      title: 'Simulador financiero sin licencias suficientes',
      created: '07-17 09:00',
      closed: '09-03 10:00',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'N02',
      title: 'Conexión inestable en la sala de bolsa',
      created: '08-04 10:30',
      closed: '08-18 14:00',
      sev: LOW,
      cat: 'INTERNET',
    },
    {
      key: 'N03',
      title: 'Convenios de práctica sin actualizar',
      created: '08-10 09:15',
      status: 'OPEN',
      sev: HIGH,
      affects: 'empresarial',
    },
    {
      key: 'N04',
      title: 'Pantallas de cotización fuera de servicio',
      created: '08-14 11:40',
      closed: '09-09 16:20',
      sev: MEDIUM,
      cat: 'EQUIPOS',
    },
    {
      key: 'N05',
      title: 'Error en la plataforma de casos empresariales',
      created: '08-21 08:30',
      closed: '09-18 10:00',
      sev: HIGH,
      cat: 'APLICATIVOS',
    },
    {
      key: 'N06',
      title: 'Sala de trabajo de estudiantes sin mobiliario',
      created: '08-27 14:00',
      closed: '09-22 09:30',
      sev: LOW,
      cat: 'INFRAESTRUCTURA',
    },
    {
      key: 'N07',
      title: 'Caídas de internet en aulas híbridas',
      created: '09-10 10:00',
      closed: '09-30 15:00',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'N08',
      title: 'Reportes de prácticas profesionales incompletos',
      created: '09-25 09:20',
      status: 'IN_PROGRESS',
      sev: MEDIUM,
      cat: 'APLICATIVOS',
    },
    {
      key: 'N09',
      title: 'Calculadoras financieras sin préstamo',
      created: '10-03 10:10',
      closed: '10-06 12:00',
      sev: LOW,
      cat: 'EQUIPOS',
    },
  ],
};

/* ─────────── Hija · Transformación Empresarial: termina sin activos ─────── */
const EMPRESARIAL: QaCoordinationScenario = {
  scope: 'empresarial',
  pattern: 'Se limpia: activos 1 → 1 → 2 → 0 (Antigüedad vacía en octubre)',
  rows: [
    {
      key: 'E01',
      title: 'Registro de emprendimientos con errores',
      created: '07-08 09:30',
      closed: '07-25 15:00',
      sev: LOW,
      cat: 'APLICATIVOS',
    },
    {
      key: 'E02',
      title: 'Sin internet en la incubadora de proyectos',
      created: '07-21 10:00',
      closed: '08-12 11:30',
      sev: MEDIUM,
      cat: 'INTERNET',
    },
    {
      key: 'E03',
      title: 'Mentores empresariales sin agendar',
      created: '08-18 09:00',
      closed: '09-15 16:00',
      sev: MEDIUM,
      affects: 'negocios',
    },
    {
      key: 'E04',
      title: 'Plataforma de ruedas de negocio caída',
      created: '09-08 11:20',
      closed: '10-02 10:00',
      sev: HIGH,
      cat: 'APLICATIVOS',
    },
    {
      key: 'E05',
      title: 'Kits de prototipado incompletos',
      created: '09-24 08:50',
      closed: '10-05 14:30',
      sev: LOW,
      cat: 'EQUIPOS',
    },
  ],
};

export const QA_DIRECTOR_H2_SCENARIO: readonly QaCoordinationScenario[] = [
  GENERAL,
  ACADEMICA,
  BELLAS_ARTES,
  INGENIERIAS,
  TRANSVERSALES,
  NEGOCIOS,
  EMPRESARIAL,
];

/* ═══════════════════════ Construcción determinista ═══════════════════════ */

/** UUID determinista con prefijo fijo (formato v4 válido: 4xxx-8xxx). */
export function qaId(name: string): string {
  const h = createHash('sha1')
    .update(`${QA_SCENARIO_KEY}:${name}`)
    .digest('hex');
  return `${QA_ID_PREFIX}4${h.slice(0, 3)}-8${h.slice(3, 6)}-${h.slice(6, 18)}`;
}

/** 'MM-DD HH:mm' (Bogotá, 2026) → instante. Colombia: UTC−5 sin DST. */
export function qaInstant(local: string): Date {
  const [md, hm] = local.split(' ');
  return new Date(`2026-${md}T${hm}:00-05:00`);
}

export const QA_ANCHOR = qaInstant(QA_ANCHOR_LOCAL.slice(5));

const LEARNINGS: Record<QaCategoryCode | 'INTER', readonly string[]> = {
  INTERNET: [
    'Se documentó el procedimiento de recuperación del servicio con el proveedor.',
    'Se configuró monitoreo del canal para detectar degradación antes de la jornada.',
  ],
  ACAS: [
    'Se depuraron los usuarios y se dejó un control semanal de consistencia en ACAS.',
    'Se acordó con soporte ACAS una ventana fija para cambios de configuración.',
  ],
  APLICATIVOS: [
    'Se corrigió la configuración y se agregó una prueba previa a cada publicación.',
    'Se dejó un responsable de validar la sincronización después de cada carga.',
  ],
  EQUIPOS: [
    'Se programó mantenimiento preventivo trimestral de los equipos.',
    'Se actualizó el inventario y el protocolo de préstamo.',
  ],
  INFRAESTRUCTURA: [
    'Se escaló a planta física y se registró el plan de mantenimiento correctivo.',
    'Se definió un punto de contacto con infraestructura para reportes urgentes.',
  ],
  TICKETS: [
    'Se ajustaron las reglas de enrutamiento de la mesa de ayuda.',
    'Se publicó una guía corta para categorizar solicitudes.',
  ],
  INTER: [
    'Se acordó un responsable y una fecha de entrega fija entre ambas coordinaciones.',
    'Se definió un punto de control semanal entre las coordinaciones involucradas.',
  ],
};

export type QaSituationRecord = {
  id: string;
  key: string;
  scope: QaScopeKey;
  title: string;
  description: string;
  reportKind: 'INTERNAL' | 'INTER_COORDINATION';
  categoryCode: QaCategoryCode | null;
  affectedScope: QaScopeKey;
  severity: Sev;
  status: SituationStatus;
  createdAt: Date;
  occurredAt: Date;
  /** Paso a «En atención» (IN_PROGRESS o CLOSED). */
  inProgressAt: Date | null;
  closedAt: Date | null;
  learning: string | null;
  affectedProcess: string | null;
  pendingDelivery: string | null;
};

/**
 * Expande el escenario a registros completos. Pura y determinista: no lee
 * reloj, base de datos ni azar.
 */
export function buildQaDirectorH2Records(): QaSituationRecord[] {
  const records: QaSituationRecord[] = [];
  let index = 0;
  for (const coordination of QA_DIRECTOR_H2_SCENARIO) {
    for (const row of coordination.rows) {
      const createdAt = qaInstant(row.created);
      const closedAt = row.closed ? qaInstant(row.closed) : null;
      const end = closedAt ?? QA_ANCHOR;
      const status = closedAt
        ? SituationStatus.CLOSED
        : row.status === 'IN_PROGRESS'
          ? SituationStatus.IN_PROGRESS
          : SituationStatus.OPEN;
      // Paso a «En atención»: 30 % del tramo hasta el cierre (o el ancla).
      const inProgressAt =
        status === SituationStatus.OPEN
          ? null
          : new Date(
              createdAt.getTime() +
                Math.round((end.getTime() - createdAt.getTime()) * 0.3),
            );
      const inter = row.affects !== undefined;
      const affected = row.affects ?? coordination.scope;
      const learningPool = LEARNINGS[inter ? 'INTER' : (row.cat ?? 'TICKETS')];
      records.push({
        id: qaId(`situation:${row.key}`),
        key: row.key,
        scope: coordination.scope,
        title: row.title,
        description: inter
          ? `${QA_SCOPE[affected].label} reporta que espera una entrega de ${QA_SCOPE[coordination.scope].label}: ${row.title.toLowerCase()}.`
          : `Se reporta en ${QA_SCOPE[coordination.scope].label}: ${row.title.toLowerCase()}.`,
        reportKind: inter ? 'INTER_COORDINATION' : 'INTERNAL',
        categoryCode: inter ? null : (row.cat ?? null),
        affectedScope: affected,
        severity: row.sev,
        status,
        createdAt,
        // Ocurrió entre 1 y 6 horas antes del registro (nunca después).
        occurredAt: new Date(
          createdAt.getTime() - ((index % 6) + 1) * 3_600_000,
        ),
        inProgressAt,
        closedAt,
        learning: closedAt ? learningPool[index % learningPool.length] : null,
        affectedProcess: inter
          ? `Operación de ${QA_SCOPE[affected].label} que depende de esta entrega.`
          : null,
        pendingDelivery: inter ? row.title : null,
      });
      index += 1;
    }
  }
  return records;
}

/* ═══════════════════════ Flujo mensual (verificación) ═══════════════════ */

export const QA_MONTHS = [
  { key: 'JUL', start: '2026-07-01', endExclusive: '2026-08-01' },
  { key: 'AGO', start: '2026-08-01', endExclusive: '2026-09-01' },
  { key: 'SEP', start: '2026-09-01', endExclusive: '2026-10-01' },
  // Octubre en curso: corte al final del día ancla (7 oct).
  { key: 'OCT', start: '2026-10-01', endExclusive: '2026-10-08' },
] as const;

const bogota = (ymd: string) => new Date(`${ymd}T00:00:00-05:00`).getTime();

/**
 * created / closed (eventos) y activos al cierre (stock) por mes, con los
 * MISMOS cortes que Carga: created < T AND (closed IS NULL OR closed >= T).
 */
export function qaMonthlyFlow(
  records: readonly Pick<QaSituationRecord, 'createdAt' | 'closedAt'>[],
): Array<{ month: string; created: number; closed: number; active: number }> {
  return QA_MONTHS.map((month) => {
    const from = bogota(month.start);
    const to = bogota(month.endExclusive);
    const inside = (d: Date | null) =>
      d !== null && d.getTime() >= from && d.getTime() < to;
    return {
      month: month.key,
      created: records.filter((r) => inside(r.createdAt)).length,
      closed: records.filter((r) => inside(r.closedAt)).length,
      active: records.filter(
        (r) =>
          r.createdAt.getTime() < to &&
          (r.closedAt === null || r.closedAt.getTime() >= to),
      ).length,
    };
  });
}
