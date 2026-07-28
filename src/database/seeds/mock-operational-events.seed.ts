import { INTELLIGENCE_CONTRACT_VERSION } from '../../intelligence/contracts/executive-intelligence-report.contract';
import {
  IndicatorDirection,
  OperationalEventStatus,
  RecommendedActionExecutionStatus,
  RiskLevel,
} from '../../common/enums/operational.enums';
import { MaterializeActionSeedOverride } from '../../recommended-actions/recommended-actions.service';

export const MOCK_SEED_SOURCE = 'seed';

export const MOCK_AREAS = [
  {
    code: 'TEC',
    name: 'Tecnologia',
    description:
      'Soporte de plataformas, infraestructura y servicios digitales.',
  },
  {
    code: 'REG',
    name: 'Registro y Control',
    description:
      'Gestion de matriculas, historia academica y registros institucionales.',
  },
  {
    code: 'ACA',
    name: 'Coordinacion Academica',
    description:
      'Programacion academica, carga docente y seguimiento curricular.',
  },
  {
    code: 'FIN',
    name: 'Financiera',
    description: 'Pagos, conciliaciones y habilitaciones administrativas.',
  },
  {
    code: 'BIEN',
    name: 'Bienestar Universitario',
    description: 'Atencion, acompanamiento y comunicaciones a estudiantes.',
  },
  {
    code: 'DIR',
    name: 'Direccion de Operaciones',
    description: 'Coordinacion ejecutiva y priorizacion transversal.',
    isGlobal: true,
  },
];

export const MOCK_CATEGORIES = [
  {
    code: 'PLATFORM_OUTAGE',
    name: 'Caida de plataforma critica',
    description: 'Indisponibilidad o falla severa de un sistema institucional.',
  },
  {
    code: 'ACADEMIC_INCONSISTENCY',
    name: 'Inconsistencia academica',
    description:
      'Errores de programacion, cupos, horarios o configuracion curricular.',
  },
  {
    code: 'TECH_DEGRADATION',
    name: 'Degradacion tecnologica',
    description: 'Lentitud o intermitencia con impacto acotado.',
  },
  {
    code: 'RESOLVED_SERVICE_EVENT',
    name: 'Incidente operacional resuelto',
    description:
      'Situacion cerrada con evidencia de mitigacion y resultado final.',
  },
];

export const MOCK_OPERATIONAL_EVENTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Caida critica del SGP durante matricula',
    description:
      'Durante la ventana de matricula ordinaria, el SGP dejo de responder para estudiantes y personal de apoyo. Se reportan transacciones incompletas, pagos no reflejados y bloqueo de consultas de cupos.',
    reportedById: 'seed-director-operaciones',
    reportedByName: 'Direccion de Operaciones',
    reportedAt: '2026-07-22T08:15:00.000Z',
    sourceAreaCode: 'REG',
    status: OperationalEventStatus.OPEN,
    observations:
      'Mayor volumen de solicitudes entre aspirantes de primer ingreso y estudiantes antiguos con orden financiera aprobada.',
    attachmentNames: [
      'traza-sgp-08-15.log',
      'reporte-matricula-turno-manana.pdf',
    ],
    lastUpdateAt: '2026-07-22T10:15:00.000Z',
    categoryCode: 'PLATFORM_OUTAGE',
    affectedAreaCodes: ['TEC', 'REG', 'FIN', 'ACA', 'BIEN'],
    interpretation: {
      impactSeverity: 5,
      affectationPercentage: 92,
      impactInternal: 95,
      impactExternal: 78,
      impactStudents: 96,
      riskLevel: RiskLevel.CRITICAL,
      riskScore: 94,
      executiveSummary:
        'El SGP presenta indisponibilidad critica en plena matricula, con impacto transversal sobre registro, tecnologia, financiera y coordinaciones academicas. La continuidad del proceso requiere contencion inmediata y comunicacion centralizada.',
      narrative:
        'La falla compromete el flujo completo de matricula: consulta de cupos, confirmacion financiera, registro de asignaturas y atencion a estudiantes. El riesgo se considera critico porque el incidente ocurre en una ventana de alta demanda y ya genera reprocesos manuales.',
      detectedPatterns: [
        'Indisponibilidad en hora pico de matricula',
        'Transacciones incompletas en procesos financieros y academicos',
        'Escalamiento simultaneo desde varias areas',
      ],
      recommendations: [
        'Activar sala tecnica de crisis con responsables de SGP, base de datos y mesa de ayuda.',
        'Publicar mensaje institucional con estado del servicio y siguiente corte de actualizacion.',
        'Congelar reprocesos manuales no validados hasta recuperar consistencia transaccional.',
        'Priorizar matriculas de estudiantes con pago confirmado y riesgo de perdida de cupo.',
        'Preparar ventana extendida de matricula si la recuperacion supera dos horas.',
      ],
      modelLabel: 'seed-executive-analysis-v2',
      confidence: 0.93,
      suggestedIndicators: [
        {
          code: 'SGP_UNAVAILABLE_MIN',
          label: 'Minutos de indisponibilidad SGP',
          value: 120,
          unit: 'min',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
        {
          code: 'MATRICULA_TX_PENDING',
          label: 'Transacciones de matricula pendientes',
          value: 740,
          unit: 'casos',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
        {
          code: 'STUDENT_IMPACT_INDEX',
          label: 'Impacto estimado en estudiantes',
          value: 96,
          unit: '%',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
      ],
      executiveReport: {
        contractVersion: INTELLIGENCE_CONTRACT_VERSION,
        incidentSummary: {
          executiveTitle: 'Indisponibilidad critica del SGP en matricula',
          executiveSummary:
            'El sistema de gestion presenta caida en la ventana de mayor demanda de matricula. El incidente afecta confirmacion financiera, registro academico y atencion estudiantil, por lo que exige comando operativo inmediato.',
        },
        riskAssessment: {
          riskScore: 94,
          riskLevel: RiskLevel.CRITICAL,
          severity: 5,
          certainty: {
            level: 'high',
            percentage: 93,
            explanation:
              'Hay reportes convergentes de varias areas, evidencia de transacciones incompletas y afectacion directa al periodo de matricula.',
          },
        },
        impactAnalysis: {
          internalImpactPercentage: 95,
          externalImpactPercentage: 78,
          studentImpactPercentage: 96,
          affectedProcesses: [
            'Matricula academica',
            'Validacion financiera',
            'Consulta de cupos',
            'Atencion de mesa de ayuda',
            'Comunicacion institucional',
          ],
          estimatedAffectedStudents: 3200,
          estimatedAffectedAreas: 5,
        },
        affectedAreas: [
          {
            name: 'Tecnologia',
            affectationLevel: RiskLevel.CRITICAL,
            reason:
              'Debe recuperar disponibilidad, revisar base de datos y sostener monitoreo minuto a minuto.',
          },
          {
            name: 'Registro y Control',
            affectationLevel: RiskLevel.CRITICAL,
            reason:
              'No puede confirmar inscripciones ni resolver inconsistencias de cupos en tiempo real.',
          },
          {
            name: 'Financiera',
            affectationLevel: RiskLevel.HIGH,
            reason:
              'Existen pagos aprobados que no se reflejan en el flujo de matricula.',
          },
          {
            name: 'Coordinacion Academica',
            affectationLevel: RiskLevel.HIGH,
            reason:
              'La asignacion de grupos queda detenida y aumenta la presion por cupos.',
          },
          {
            name: 'Bienestar Universitario',
            affectationLevel: RiskLevel.MODERATE,
            reason:
              'Debe contener inquietudes estudiantiles y orientar canales de atencion.',
          },
        ],
        rootCause: {
          detectedCauses: [
            'Caida del servicio SGP durante alta concurrencia',
            'Transacciones incompletas entre modulo financiero y academico',
          ],
          hypotheses: [
            'Saturacion de conexiones hacia base de datos',
            'Bloqueo en cola de integracion de pagos',
            'Regla de cupos ejecutandose sobre datos parcialmente confirmados',
          ],
          dependencies: [
            'SGP',
            'Base de datos academica',
            'Pasarela financiera',
            'Mesa de ayuda',
          ],
        },
        decisionFactors: [
          'El incidente ocurre en una ventana institucional no aplazable.',
          'La afectacion combina disponibilidad tecnica y riesgo reputacional.',
          'Varias areas dependen del mismo sistema para cerrar el proceso.',
          'El volumen estudiantil estimado supera la capacidad de manejo manual.',
        ],
        recommendedActions: [
          {
            priority: 'immediate',
            action:
              'Conformar sala tecnica con lider de tecnologia, registro, financiera y operaciones.',
            reason:
              'La recuperacion requiere decisiones coordinadas y una unica version del estado.',
            suggestedArea: 'Direccion de Operaciones',
            recommendedTime: '15 minutos',
          },
          {
            priority: 'immediate',
            action:
              'Ejecutar diagnostico de disponibilidad, conexiones y cola de pagos antes de reabrir transacciones.',
            reason:
              'Reabrir sin consistencia puede duplicar o perder registros de matricula.',
            suggestedArea: 'Tecnologia',
            recommendedTime: '30 minutos',
          },
          {
            priority: 'high',
            action:
              'Definir lista priorizada de estudiantes con pago confirmado y cupo en riesgo.',
            reason:
              'Permite proteger casos sensibles mientras se estabiliza la plataforma.',
            suggestedArea: 'Registro y Control',
            recommendedTime: '1 hora',
          },
          {
            priority: 'high',
            action:
              'Emitir comunicado con hora exacta del siguiente corte operativo.',
            reason:
              'Reduce saturacion de canales y preserva confianza durante la contingencia.',
            suggestedArea: 'Bienestar Universitario',
            recommendedTime: '20 minutos',
          },
          {
            priority: 'medium',
            action:
              'Preparar extension de ventana de matricula con criterios academicos y financieros.',
            reason:
              'Mitiga el impacto si la recuperacion tecnica supera el umbral esperado.',
            suggestedArea: 'Coordinacion Academica',
            recommendedTime: '2 horas',
          },
        ],
        operationalConsequences: [
          'Aumento de estudiantes sin horario confirmado al cierre de jornada.',
          'Reprocesos financieros por pagos no reflejados.',
          'Escalamiento masivo a mesa de ayuda y coordinaciones.',
          'Riesgo reputacional por comunicacion fragmentada.',
        ],
        operationalIndicators: [
          {
            name: 'Disponibilidad SGP',
            explanation:
              'Mide el porcentaje de tiempo util en que el SGP responde durante matricula.',
            unit: '%',
            suggestedValue: 42,
            trend: 'down',
          },
          {
            name: 'Transacciones pendientes de conciliacion',
            explanation:
              'Casos donde pago o inscripcion no tiene confirmacion completa.',
            unit: 'casos',
            suggestedValue: 740,
            trend: 'up',
          },
          {
            name: 'Saturacion de mesa de ayuda',
            explanation:
              'Demanda de atencion relacionada con bloqueo de matricula.',
            unit: '%',
            suggestedValue: 88,
            trend: 'up',
          },
        ],
        timelineSuggestions: [
          {
            horizon: '30 minutos',
            checkpoint:
              'Confirmar causa tecnica dominante y estado de cola transaccional.',
          },
          {
            horizon: '1 hora',
            checkpoint:
              'Publicar decision sobre continuidad, ventana extendida o pausa controlada.',
          },
          {
            horizon: '2 horas',
            checkpoint:
              'Validar consistencia de registros recuperados antes de cierre parcial.',
          },
        ],
        executiveConclusion: {
          gravity:
            'Critica por afectar el proceso institucional central de matricula.',
          urgency: 'immediate',
          recommendation:
            'Mantener comando operativo centralizado hasta recuperar disponibilidad y consistencia; no delegar la comunicacion a canales aislados.',
        },
        dataGaps: [
          'Numero exacto de transacciones duplicadas aun no confirmado.',
          'Causa raiz tecnica pendiente de validacion en logs de base de datos.',
        ],
      },
    },
    timeline: [
      [
        'event_registered',
        '2026-07-22T08:15:00.000Z',
        'Se registra caida del SGP durante matricula.',
        'Direccion de Operaciones',
      ],
      [
        'interpretation_generated',
        '2026-07-22T08:17:00.000Z',
        'IA genera analisis critico y prioriza respuesta transversal.',
        'Asistente Ejecutivo Operacional',
      ],
      [
        'status_change',
        '2026-07-22T08:20:00.000Z',
        'Asignado a Tecnologia con acompanamiento de Registro y Financiera.',
        'Coordinacion de Sala',
      ],
      [
        'note',
        '2026-07-22T09:05:00.000Z',
        'Se confirma cola de transacciones pendientes y saturacion de mesa de ayuda.',
        'Tecnologia',
      ],
      [
        'note',
        '2026-07-22T09:40:00.000Z',
        'Mitigacion parcial: se habilita consulta, pero no inscripcion masiva.',
        'Registro y Control',
      ],
      [
        'note',
        '2026-07-22T10:15:00.000Z',
        'Se mantiene incidente abierto hasta validar consistencia de pagos y cupos.',
        'Direccion de Operaciones',
      ],
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Inconsistencias en programacion academica',
    description:
      'La coordinacion detecta grupos con cruce de horarios y salones asignados por encima de capacidad en dos programas. La situacion afecta la publicacion final de horarios.',
    reportedById: 'seed-coord-academica',
    reportedByName: 'Coordinacion Academica',
    reportedAt: '2026-07-22T11:10:00.000Z',
    sourceAreaCode: 'ACA',
    status: OperationalEventStatus.MONITORING,
    observations:
      'Los cruces se concentran en asignaturas de alta demanda y requieren validacion antes de notificar a estudiantes.',
    attachmentNames: ['matriz-cruces-horarios.xlsx'],
    lastUpdateAt: '2026-07-22T12:05:00.000Z',
    categoryCode: 'ACADEMIC_INCONSISTENCY',
    affectedAreaCodes: ['ACA', 'REG'],
    interpretation: {
      impactSeverity: 3,
      affectationPercentage: 48,
      impactInternal: 58,
      impactExternal: 18,
      impactStudents: 52,
      riskLevel: RiskLevel.MODERATE,
      riskScore: 56,
      executiveSummary:
        'La programacion academica presenta inconsistencias moderadas que pueden retrasar la publicacion de horarios. El impacto principal recae en la coordinacion academica y requiere depuracion antes de escalar a estudiantes.',
      narrative:
        'El evento no compromete toda la operacion institucional, pero si puede generar cambios de ultimo momento, reprocesos y consultas masivas si se publica sin validacion.',
      detectedPatterns: [
        'Cruces horarios en asignaturas de alta demanda',
        'Capacidad fisica inferior al cupo configurado',
      ],
      recommendations: [
        'Bloquear publicacion de los grupos observados hasta validar capacidad real.',
        'Revisar reglas de asignacion con Registro y Control antes del cierre del dia.',
        'Preparar mensaje preventivo solo para coordinadores de programa.',
      ],
      modelLabel: 'seed-executive-analysis-v2',
      confidence: 0.84,
      suggestedIndicators: [
        {
          code: 'ACA_GROUPS_TO_REVIEW',
          label: 'Grupos academicos por revisar',
          value: 18,
          unit: 'grupos',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
        {
          code: 'SCHEDULE_CONFLICT_RATE',
          label: 'Tasa de cruces horarios',
          value: 12,
          unit: '%',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
      ],
      executiveReport: {
        contractVersion: INTELLIGENCE_CONTRACT_VERSION,
        incidentSummary: {
          executiveTitle: 'Inconsistencias moderadas en programacion academica',
          executiveSummary:
            'Se identifican cruces de horario y salones con capacidad insuficiente antes de la publicacion final. La situacion es contenible si se depura en coordinacion academica y registro.',
        },
        riskAssessment: {
          riskScore: 56,
          riskLevel: RiskLevel.MODERATE,
          severity: 3,
          certainty: {
            level: 'high',
            percentage: 84,
            explanation:
              'La evidencia proviene de matriz academica concreta y el alcance esta acotado a programas y grupos especificos.',
          },
        },
        impactAnalysis: {
          internalImpactPercentage: 58,
          externalImpactPercentage: 18,
          studentImpactPercentage: 52,
          affectedProcesses: [
            'Programacion academica',
            'Asignacion de aulas',
            'Publicacion de horarios',
          ],
          estimatedAffectedStudents: 620,
          estimatedAffectedAreas: 2,
        },
        affectedAreas: [
          {
            name: 'Coordinacion Academica',
            affectationLevel: RiskLevel.MODERATE,
            reason:
              'Debe validar cruces, cupos y disponibilidad docente antes de publicar.',
          },
          {
            name: 'Registro y Control',
            affectationLevel: RiskLevel.LOW,
            reason:
              'Requiere confirmar que los cambios no alteren reglas de matricula.',
          },
        ],
        rootCause: {
          detectedCauses: [
            'Cruces horarios detectados en matriz de programacion',
            'Cupos configurados por encima de capacidad fisica',
          ],
          hypotheses: [
            'Actualizacion parcial de disponibilidad de aulas',
            'Duplicidad de criterios entre programa y registro',
          ],
          dependencies: [
            'Matriz de horarios',
            'Catalogo de aulas',
            'Reglas de cupos',
          ],
        },
        decisionFactors: [
          'El incidente fue detectado antes de la publicacion masiva.',
          'El alcance esta concentrado en una coordinacion.',
          'La correccion tardia afectaria experiencia estudiantil.',
        ],
        recommendedActions: [
          {
            priority: 'high',
            action:
              'Validar manualmente los grupos con cruce antes de liberar horarios.',
            reason:
              'Evita publicar informacion que luego requiera reproceso estudiantil.',
            suggestedArea: 'Coordinacion Academica',
            recommendedTime: '4 horas',
          },
          {
            priority: 'medium',
            action:
              'Cruzar cupos configurados contra capacidad fisica disponible.',
            reason:
              'La causa puede estar en parametros de aula, no en demanda academica.',
            suggestedArea: 'Registro y Control',
            recommendedTime: '1 dia',
          },
          {
            priority: 'scheduled',
            action:
              'Documentar regla de aprobacion para cambios posteriores a publicacion.',
            reason: 'Reduce ambiguedad si aparecen ajustes de ultimo momento.',
            suggestedArea: 'Direccion de Operaciones',
            recommendedTime: '48 horas',
          },
        ],
        operationalConsequences: [
          'Consultas estudiantiles por horarios modificados.',
          'Reasignaciones de aula con baja disponibilidad.',
          'Reprocesos de coordinacion en cierre de programacion.',
        ],
        operationalIndicators: [
          {
            name: 'Grupos con observacion',
            explanation:
              'Cantidad de grupos que requieren validacion antes de publicacion.',
            unit: 'grupos',
            suggestedValue: 18,
            trend: 'stable',
          },
          {
            name: 'Estudiantes potencialmente afectados',
            explanation:
              'Estimacion de estudiantes inscritos o interesados en grupos observados.',
            unit: 'estudiantes',
            suggestedValue: 620,
            trend: 'up',
          },
        ],
        timelineSuggestions: [
          {
            horizon: '4 horas',
            checkpoint:
              'Tener listado depurado de grupos que pueden publicarse.',
          },
          {
            horizon: '24 horas',
            checkpoint: 'Confirmar que no quedan salones sobrecapacidad.',
          },
        ],
        executiveConclusion: {
          gravity:
            'Moderada, con riesgo de ruido operativo si se publica sin depurar.',
          urgency: 'medium',
          recommendation:
            'Mantener el evento en monitoreo hasta cerrar la matriz academica validada por coordinacion y registro.',
        },
        dataGaps: [
          'Confirmacion final de disponibilidad docente por cada grupo observado.',
          'Validacion de cupos reales en aulas compartidas.',
        ],
      },
    },
    timeline: [
      [
        'event_registered',
        '2026-07-22T11:10:00.000Z',
        'Se reportan cruces y sobrecupos en programacion academica.',
        'Coordinacion Academica',
      ],
      [
        'interpretation_generated',
        '2026-07-22T11:12:00.000Z',
        'IA clasifica riesgo moderado y recomienda depuracion previa a publicacion.',
        'Asistente Ejecutivo Operacional',
      ],
      [
        'status_change',
        '2026-07-22T11:25:00.000Z',
        'Evento pasa a monitoreo con responsable academico asignado.',
        'Direccion de Operaciones',
      ],
      [
        'note',
        '2026-07-22T12:05:00.000Z',
        'Se consolidan 18 grupos para revision prioritaria.',
        'Registro y Control',
      ],
    ],
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Lentitud intermitente del LMS',
    description:
      'Docentes reportan tiempos de carga altos en el LMS al abrir material de dos cursos virtuales. El servicio responde, pero con demoras perceptibles.',
    reportedById: 'seed-mesa-ayuda',
    reportedByName: 'Mesa de Ayuda Tecnologia',
    reportedAt: '2026-07-22T14:35:00.000Z',
    sourceAreaCode: 'TEC',
    status: OperationalEventStatus.OPEN,
    observations:
      'No hay caida total ni perdida de informacion. Se observa mayor latencia en contenidos multimedia.',
    attachmentNames: ['captura-lms-latencia.png'],
    lastUpdateAt: '2026-07-22T15:05:00.000Z',
    categoryCode: 'TECH_DEGRADATION',
    affectedAreaCodes: ['TEC', 'ACA'],
    interpretation: {
      impactSeverity: 2,
      affectationPercentage: 22,
      impactInternal: 28,
      impactExternal: 12,
      impactStudents: 24,
      riskLevel: RiskLevel.LOW,
      riskScore: 28,
      executiveSummary:
        'El LMS presenta lentitud acotada sin indisponibilidad total. El riesgo es bajo y requiere monitoreo tecnico focalizado para evitar deterioro.',
      narrative:
        'La situacion afecta la experiencia de cursos puntuales, pero no bloquea la continuidad academica. Las acciones deben concentrarse en medicion, cache y comunicacion a docentes afectados.',
      detectedPatterns: [
        'Latencia en contenidos multimedia',
        'Afectacion limitada a pocos cursos',
      ],
      recommendations: [
        'Medir latencia por recurso y curso afectado durante la siguiente hora.',
        'Limpiar cache de contenidos multimedia con mayor demora.',
      ],
      modelLabel: 'seed-executive-analysis-v2',
      confidence: 0.78,
      suggestedIndicators: [
        {
          code: 'LMS_AVG_LOAD_SECONDS',
          label: 'Tiempo promedio de carga LMS',
          value: 8,
          unit: 'seg',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
      ],
      executiveReport: {
        contractVersion: INTELLIGENCE_CONTRACT_VERSION,
        incidentSummary: {
          executiveTitle: 'Lentitud menor en LMS',
          executiveSummary:
            'El LMS mantiene disponibilidad, pero presenta demoras en cursos virtuales especificos. El impacto es bajo y puede manejarse con monitoreo tecnico focalizado.',
        },
        riskAssessment: {
          riskScore: 28,
          riskLevel: RiskLevel.LOW,
          severity: 2,
          certainty: {
            level: 'medium',
            percentage: 78,
            explanation:
              'Los reportes son consistentes, aunque aun falta medicion automatica amplia de latencia por segmento.',
          },
        },
        impactAnalysis: {
          internalImpactPercentage: 28,
          externalImpactPercentage: 12,
          studentImpactPercentage: 24,
          affectedProcesses: [
            'Acceso a contenidos virtuales',
            'Soporte docente',
          ],
          estimatedAffectedStudents: 140,
          estimatedAffectedAreas: 2,
        },
        affectedAreas: [
          {
            name: 'Tecnologia',
            affectationLevel: RiskLevel.LOW,
            reason:
              'Debe validar desempeno y aplicar acciones tecnicas menores.',
          },
          {
            name: 'Coordinacion Academica',
            affectationLevel: RiskLevel.LOW,
            reason:
              'Necesita informar a docentes de cursos puntuales si persiste la lentitud.',
          },
        ],
        rootCause: {
          detectedCauses: [
            'Demoras al abrir contenidos multimedia en cursos especificos',
          ],
          hypotheses: [
            'Cache vencida o recurso pesado en repositorio de contenidos',
            'Pico de consumo en franja de clase virtual',
          ],
          dependencies: [
            'LMS',
            'Repositorio de contenidos',
            'Red institucional',
          ],
        },
        decisionFactors: [
          'No hay caida total del servicio.',
          'La afectacion esta limitada a cursos y recursos concretos.',
          'El incidente puede deteriorarse si coincide con evaluaciones virtuales.',
        ],
        recommendedActions: [
          {
            priority: 'medium',
            action:
              'Tomar muestra de tiempos de carga por curso y tipo de recurso.',
            reason:
              'Permite distinguir problema de plataforma, red o contenido puntual.',
            suggestedArea: 'Tecnologia',
            recommendedTime: '1 hora',
          },
          {
            priority: 'scheduled',
            action:
              'Informar a docentes afectados que mantengan material alterno si la latencia supera diez segundos.',
            reason:
              'Reduce interrupcion pedagogica sin activar crisis institucional.',
            suggestedArea: 'Coordinacion Academica',
            recommendedTime: 'Durante la jornada',
          },
        ],
        operationalConsequences: [
          'Molestia puntual en docentes y estudiantes de cursos virtuales.',
          'Aumento leve de tickets si no se comunica estado.',
        ],
        operationalIndicators: [
          {
            name: 'Tiempo promedio de carga',
            explanation:
              'Segundos promedio para abrir contenidos LMS reportados.',
            unit: 'segundos',
            suggestedValue: 8,
            trend: 'stable',
          },
        ],
        timelineSuggestions: [
          {
            horizon: '1 hora',
            checkpoint: 'Confirmar si la latencia baja tras limpieza de cache.',
          },
          {
            horizon: 'Fin de jornada',
            checkpoint: 'Cerrar si no hay nuevos reportes docentes.',
          },
        ],
        executiveConclusion: {
          gravity: 'Baja, con afectacion limitada y servicio disponible.',
          urgency: 'low',
          recommendation:
            'Atender desde tecnologia sin escalar a crisis; mantener observacion por si aumenta el volumen de cursos afectados.',
        },
        dataGaps: [
          'Medicion automatica de latencia por sede o red de origen.',
          'Numero exacto de estudiantes activos en los cursos afectados.',
        ],
      },
    },
    timeline: [
      [
        'event_registered',
        '2026-07-22T14:35:00.000Z',
        'Mesa de ayuda registra lentitud LMS en cursos virtuales.',
        'Mesa de Ayuda Tecnologia',
      ],
      [
        'interpretation_generated',
        '2026-07-22T14:37:00.000Z',
        'IA genera analisis de riesgo bajo con recomendaciones acotadas.',
        'Asistente Ejecutivo Operacional',
      ],
      [
        'note',
        '2026-07-22T14:50:00.000Z',
        'Se identifica mayor demora en recursos multimedia.',
        'Tecnologia',
      ],
      [
        'note',
        '2026-07-22T15:05:00.000Z',
        'Se agenda monitoreo de latencia hasta cierre de jornada.',
        'Mesa de Ayuda Tecnologia',
      ],
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Conciliacion de pagos de matricula resuelta',
    description:
      'Se habia presentado retraso en la conciliacion de pagos de matricula para estudiantes con transacciones aprobadas. El equipo financiero ejecuto verificacion y normalizo los registros pendientes.',
    reportedById: 'seed-financiera',
    reportedByName: 'Coordinacion Financiera',
    reportedAt: '2026-07-21T08:05:00.000Z',
    sourceAreaCode: 'FIN',
    status: OperationalEventStatus.RESOLVED,
    observations:
      'La conciliacion finalizo con validacion cruzada entre financiera, registro y tecnologia. No quedan pagos aprobados sin reflejar.',
    attachmentNames: ['acta-cierre-conciliacion.pdf'],
    lastUpdateAt: '2026-07-21T10:15:00.000Z',
    categoryCode: 'RESOLVED_SERVICE_EVENT',
    affectedAreaCodes: ['FIN', 'REG', 'TEC'],
    interpretation: {
      impactSeverity: 4,
      affectationPercentage: 68,
      impactInternal: 72,
      impactExternal: 45,
      impactStudents: 70,
      riskLevel: RiskLevel.HIGH,
      riskScore: 76,
      executiveSummary:
        'El incidente de conciliacion financiera ya fue resuelto. Durante su ventana activa tuvo riesgo alto por bloqueo potencial de matriculas, pero el resultado final confirma normalizacion y cierre operativo.',
      narrative:
        'La situacion permite validar la vista de incidente cerrado: muestra historial completo, acciones realizadas, resultado final y conclusion ejecutiva sin mantenerlo en cola critica.',
      detectedPatterns: [
        'Retraso de conciliacion en pagos aprobados',
        'Resolucion con validacion cruzada entre tres areas',
      ],
      recommendations: [
        'Conservar acta de cierre y muestra de pagos normalizados para auditoria.',
        'Automatizar alerta temprana cuando pagos aprobados superen treinta minutos sin reflejo academico.',
        'Revisar bitacora de integracion antes de la proxima ventana de matricula.',
      ],
      modelLabel: 'seed-executive-analysis-v2',
      confidence: 0.9,
      suggestedIndicators: [
        {
          code: 'PAYMENTS_RECONCILED',
          label: 'Pagos conciliados tras mitigacion',
          value: 186,
          unit: 'pagos',
          direction: IndicatorDirection.HIGHER_IS_BETTER,
        },
        {
          code: 'RESOLUTION_TIME_MIN',
          label: 'Tiempo total de resolucion',
          value: 130,
          unit: 'min',
          direction: IndicatorDirection.HIGHER_IS_WORSE,
        },
      ],
      executiveReport: {
        contractVersion: INTELLIGENCE_CONTRACT_VERSION,
        incidentSummary: {
          executiveTitle:
            'Incidente financiero cerrado con normalizacion completa',
          executiveSummary:
            'La conciliacion de pagos pendientes fue resuelta y validada entre financiera, registro y tecnologia. El cierre reduce el riesgo operativo, aunque deja una mejora preventiva para alertas tempranas.',
        },
        riskAssessment: {
          riskScore: 76,
          riskLevel: RiskLevel.HIGH,
          severity: 4,
          certainty: {
            level: 'high',
            percentage: 90,
            explanation:
              'El cierre cuenta con acta, muestra de pagos normalizados y confirmacion de las areas dependientes.',
          },
        },
        impactAnalysis: {
          internalImpactPercentage: 72,
          externalImpactPercentage: 45,
          studentImpactPercentage: 70,
          affectedProcesses: [
            'Conciliacion financiera',
            'Habilitacion de matricula',
            'Validacion de pagos',
          ],
          estimatedAffectedStudents: 186,
          estimatedAffectedAreas: 3,
        },
        affectedAreas: [
          {
            name: 'Financiera',
            affectationLevel: RiskLevel.HIGH,
            reason:
              'Fue responsable de validar pagos aprobados y cerrar conciliacion.',
          },
          {
            name: 'Registro y Control',
            affectationLevel: RiskLevel.MODERATE,
            reason: 'Dependia del reflejo de pagos para habilitar matriculas.',
          },
          {
            name: 'Tecnologia',
            affectationLevel: RiskLevel.MODERATE,
            reason:
              'Apoyo revision de integracion entre pagos y sistema academico.',
          },
        ],
        rootCause: {
          detectedCauses: [
            'Retraso en reflejo de pagos aprobados hacia matricula',
            'Necesidad de validacion cruzada manual',
          ],
          hypotheses: [
            'Demora en job de conciliacion',
            'Latencia temporal de integracion financiera',
          ],
          dependencies: ['Pasarela de pagos', 'Modulo financiero', 'SGP'],
        },
        decisionFactors: [
          'La afectacion ya fue mitigada y verificada.',
          'El riesgo fue alto durante el bloqueo de pagos.',
          'El cierre deja aprendizaje aplicable a matricula.',
        ],
        recommendedActions: [
          {
            priority: 'scheduled',
            action:
              'Archivar acta de cierre junto con muestra de pagos conciliados.',
            reason:
              'Permite auditoria posterior y evita reapertura sin evidencia.',
            suggestedArea: 'Financiera',
            recommendedTime: '24 horas',
          },
          {
            priority: 'medium',
            action:
              'Configurar alerta cuando la conciliacion supere treinta minutos.',
            reason: 'Detecta acumulacion antes de que afecte matricula masiva.',
            suggestedArea: 'Tecnologia',
            recommendedTime: '5 dias',
          },
          {
            priority: 'scheduled',
            action:
              'Actualizar protocolo de comunicacion entre financiera y registro.',
            reason:
              'Acelera confirmacion de estudiantes habilitados en futuras ventanas.',
            suggestedArea: 'Registro y Control',
            recommendedTime: '1 semana',
          },
        ],
        operationalConsequences: [
          'Sin accion futura, el patron podria repetirse en la proxima matricula.',
          'La ausencia de alerta temprana elevaria nuevamente tickets estudiantiles.',
        ],
        operationalIndicators: [
          {
            name: 'Pagos normalizados',
            explanation:
              'Cantidad de pagos aprobados que quedaron reflejados tras la mitigacion.',
            unit: 'pagos',
            suggestedValue: 186,
            trend: 'down',
          },
          {
            name: 'Tiempo de resolucion',
            explanation:
              'Duracion total entre registro del incidente y cierre operativo.',
            unit: 'minutos',
            suggestedValue: 130,
            trend: 'stable',
          },
        ],
        timelineSuggestions: [
          {
            horizon: '24 horas',
            checkpoint:
              'Verificar que no existan pagos aprobados sin reflejo en matricula.',
          },
          {
            horizon: '1 semana',
            checkpoint:
              'Confirmar implementacion de alerta temprana de conciliacion.',
          },
        ],
        executiveConclusion: {
          gravity:
            'Alta en su fase activa, actualmente cerrada con evidencia suficiente.',
          urgency: 'low',
          recommendation:
            'Mantener cerrado el incidente y convertir las acciones preventivas en compromiso operativo antes de la siguiente matricula.',
        },
        dataGaps: [
          'Detalle tecnico exacto del job que causo el retraso.',
          'Umbral historico de conciliacion normal por franja horaria.',
        ],
      },
    },
    timeline: [
      [
        'event_registered',
        '2026-07-21T08:05:00.000Z',
        'Financiera registra pagos aprobados sin reflejo academico.',
        'Coordinacion Financiera',
      ],
      [
        'interpretation_generated',
        '2026-07-21T08:07:00.000Z',
        'IA genera analisis de riesgo alto por posible bloqueo de matricula.',
        'Asistente Ejecutivo Operacional',
      ],
      [
        'status_change',
        '2026-07-21T08:20:00.000Z',
        'Asignado a Financiera con apoyo de Registro y Tecnologia.',
        'Direccion de Operaciones',
      ],
      [
        'note',
        '2026-07-21T09:05:00.000Z',
        'Se ejecuta conciliacion controlada de pagos pendientes.',
        'Financiera',
      ],
      [
        'note',
        '2026-07-21T09:40:00.000Z',
        'Registro confirma habilitacion de estudiantes afectados.',
        'Registro y Control',
      ],
      [
        'status_change',
        '2026-07-21T10:15:00.000Z',
        'Incidente resuelto con acta de cierre y acciones preventivas.',
        'Direccion de Operaciones',
      ],
    ],
  },
] as const;

/**
 * Estados iniciales de ejecución para demos del Centro de Ejecución Operativa.
 * Se aplican solo al materializar por primera vez (idempotente).
 */
export const MOCK_ACTION_EXECUTION_OVERRIDES: Record<
  string,
  MaterializeActionSeedOverride[]
> = {
  '11111111-1111-4111-8111-111111111111': [
    {
      actionIndex: 0,
      status: RecommendedActionExecutionStatus.IN_PROGRESS,
      startedAt: '2026-07-22T08:45:00.000Z',
      assignedToUserName: 'Direccion de Operaciones',
      assignedToUserId: 'seed-director-operaciones',
    },
    {
      actionIndex: 1,
      status: RecommendedActionExecutionStatus.EXECUTED,
      startedAt: '2026-07-22T08:40:00.000Z',
      completedAt: '2026-07-22T09:20:00.000Z',
      observation: 'Diagnostico completado; se estabilizo cola de pagos.',
      assignedToUserName: 'Tecnologia',
      assignedToUserId: 'seed-tecnologia',
    },
    {
      actionIndex: 2,
      status: RecommendedActionExecutionStatus.PENDING,
    },
    {
      actionIndex: 3,
      status: RecommendedActionExecutionStatus.PENDING,
    },
    {
      actionIndex: 4,
      status: RecommendedActionExecutionStatus.NOT_EXECUTABLE,
      completedAt: '2026-07-22T10:00:00.000Z',
      statusNote:
        'No se autorizo extension de ventana hasta confirmar recuperacion tecnica.',
      assignedToUserName: 'Coordinacion Academica',
      assignedToUserId: 'seed-academica',
    },
  ],
  '22222222-2222-4222-8222-222222222222': [
    {
      actionIndex: 0,
      status: RecommendedActionExecutionStatus.IN_PROGRESS,
      startedAt: '2026-07-23T14:20:00.000Z',
    },
    {
      actionIndex: 1,
      status: RecommendedActionExecutionStatus.PENDING,
    },
    {
      actionIndex: 2,
      status: RecommendedActionExecutionStatus.PENDING,
    },
  ],
  '33333333-3333-4333-8333-333333333333': [
    {
      actionIndex: 0,
      status: RecommendedActionExecutionStatus.PENDING,
    },
    {
      actionIndex: 1,
      status: RecommendedActionExecutionStatus.PENDING,
    },
  ],
  '44444444-4444-4444-8444-444444444444': [
    {
      actionIndex: 0,
      status: RecommendedActionExecutionStatus.EXECUTED,
      startedAt: '2026-07-21T09:10:00.000Z',
      completedAt: '2026-07-21T10:00:00.000Z',
      observation: 'Acta archivada con muestra de pagos conciliados.',
    },
    {
      actionIndex: 1,
      status: RecommendedActionExecutionStatus.IN_PROGRESS,
      startedAt: '2026-07-22T11:00:00.000Z',
    },
    {
      actionIndex: 2,
      status: RecommendedActionExecutionStatus.PENDING,
    },
  ],
};

export type MockOperationalEventSeed = (typeof MOCK_OPERATIONAL_EVENTS)[number];
export type MockTimelineSeed = MockOperationalEventSeed['timeline'][number];
