import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import {
  AIAnalysisSchemaVersion,
  ExecutivePriorityLevel,
  HypothesisLikelihood,
  MissingInformationPriority,
} from '../../ai-analysis/enums/ai-analysis.enums';
import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';
import { SituationAIAnalysisRecord } from '../../ai-orchestration/entities/situation-ai-analysis-record.entity';
import { SituationAnalysisSession } from '../../ai-analysis-sessions/entities/situation-analysis-session.entity';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { EvidenceType } from '../../common/enums/situation-evidence.enums';
import {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';
import {
  RecommendationPriority,
  RecommendationSource,
  RecommendationStatus,
} from '../../common/enums/situation-recommendation.enums';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { SituationEvidence } from '../../situation-evidence/entities/situation-evidence.entity';
import { SituationAffectedCoordination } from '../../situation-impact/entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from '../../situation-impact/entities/situation-impact-assessment.entity';
import { SituationRecommendation } from '../../situation-recommendations/entities/situation-recommendation.entity';
import { SituationTimelineEntry } from '../../situation-timeline/entities/situation-timeline-entry.entity';
import { Situation } from '../../situations/entities/situation.entity';
import { SituationRelatedCoordination } from '../../situations/entities/situation-related-coordination.entity';
import {
  computeDueAt,
  SLA_POLICY_CODE,
} from '../../situations/situation-sla.policy';
import { User } from '../../users/entities/user.entity';
import {
  recipeForMockIndex,
  resolveIslandMockProfile,
  type IslandMockProfile,
  type MockSituationRecipe,
} from './seed-situations-mock.recipes';

/** Prefijo estable para poder limpiar y re-inyectar el dataset mock. */
export const MOCK_SEED_MARKER = '[MOCK-SEED]';

const DEFAULT_COUNT = 80;

const TITLE_TEMPLATES = [
  'Interrupción parcial del portal de servicios',
  'Inconsistencias en la inscripción de estudiantes',
  'Degradación en notificaciones automáticas',
  'Retraso en sincronización de calificaciones',
  'Falla intermitente en autenticación institucional',
  'Desfase de cupos académicos reportados',
  'Caída temporal del módulo de reportes',
  'Errores en la carga de evidencias documentales',
  'Latencia elevada en consulta de horarios',
  'Incidencia en el flujo de matrícula',
  'Bloqueo de acceso a recursos de biblioteca',
  'Desalineación de datos entre sistemas académicos',
  'Falla en envío de recordatorios de pago',
  'Problema de disponibilidad en aula virtual',
  'Inconsistencia en estados de solicitud administrativa',
  'Interrupción del tablero operativo de coordinación',
  'Error en la generación de certificados',
  'Retraso en actualización de estados de trámite',
  'Falla en integración con sistema de pagos',
  'Degradación del servicio de mensajería interna',
] as const;

const DESCRIPTION_TEMPLATES = [
  'Se reporta afectación operativa con impacto en atención a usuarios y seguimiento académico.',
  'La coordinación detectó irregularidades al validar información crítica del proceso.',
  'El evento genera ruido operacional y requiere trazabilidad para contener el impacto.',
  'Usuarios reportan demoras y respuestas inconsistentes en el flujo habitual.',
  'La incidencia aparece después de un cambio reciente en la configuración del servicio.',
] as const;

const RECOMMENDATION_TEMPLATES = [
  {
    title: 'Validar el flujo afectado con el área origen',
    description:
      'Confirmar alcance, usuarios impactados y ventana de contención.',
  },
  {
    title: 'Publicar comunicado interno de seguimiento',
    description:
      'Informar estado, responsable y próxima actualización esperada.',
  },
  {
    title: 'Revisar logs y evidencias de captura',
    description:
      'Cruzar horarios de falla con cambios recientes y dependencias.',
  },
  {
    title: 'Escalar a soporte técnico si persiste',
    description: 'Activar contención y documentar decisión en el expediente.',
  },
] as const;

function daysAgo(days: number, hour = 10, minute = 0): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length];
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function coordinationsWithProfile(
  items: readonly Coordination[],
  profile: IslandMockProfile,
): Coordination[] {
  return items.filter(
    (item) => resolveIslandMockProfile(item.code) === profile,
  );
}

function pickOrigin(
  coordinations: readonly Coordination[],
  profile: IslandMockProfile,
  index: number,
): Coordination {
  const pool = coordinationsWithProfile(coordinations, profile);
  if (pool.length > 0) return pick(pool, index);
  const fallback = coordinationsWithProfile(coordinations, 'normal');
  return pick(fallback.length > 0 ? fallback : coordinations, index);
}

function buildMockTimeline(
  recipe: MockSituationRecipe,
  index: number,
): {
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  dueAt: Date;
  slaBreachedAt: Date | null;
} {
  const isFinal =
    recipe.status === SituationStatus.CLOSED ||
    recipe.status === SituationStatus.RESOLVED;

  if (isFinal) {
    const occurredAt = daysAgo(
      (index % 30) + 10,
      8 + (index % 8),
      (index * 7) % 60,
    );
    const createdAt = new Date(occurredAt.getTime() + 35 * 60_000);
    const resolvedAt = new Date(
      createdAt.getTime() + (12 + (index % 48)) * 60 * 60_000,
    );
    const closedAt =
      recipe.status === SituationStatus.CLOSED
        ? new Date(resolvedAt.getTime() + 2 * 60 * 60_000)
        : null;
    return {
      occurredAt,
      createdAt,
      updatedAt: resolvedAt,
      resolvedAt,
      closedAt,
      dueAt: computeDueAt(recipe.severity, createdAt),
      slaBreachedAt: null,
    };
  }

  if (recipe.sla === 'overdue') {
    const occurredAt = daysAgo(
      6 + (index % 8),
      8 + (index % 10),
      (index * 7) % 60,
    );
    const createdAt = new Date(occurredAt.getTime() + 35 * 60_000);
    const dueAt = computeDueAt(recipe.severity, createdAt);
    return {
      occurredAt,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
      closedAt: null,
      dueAt,
      slaBreachedAt: dueAt,
    };
  }

  const hoursBack =
    recipe.sla === 'at_risk'
      ? recipe.severity === SituationSeverity.CRITICAL
        ? 20
        : recipe.severity === SituationSeverity.HIGH
          ? 60
          : 120
      : recipe.severity === SituationSeverity.CRITICAL
        ? 4
        : recipe.severity === SituationSeverity.HIGH
          ? 12
          : 24;
  const createdAt = hoursAgo(hoursBack + (index % 3));
  const occurredAt = new Date(createdAt.getTime() - 40 * 60_000);
  return {
    occurredAt,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    closedAt: null,
    dueAt: computeDueAt(recipe.severity, createdAt),
    slaBreachedAt: null,
  };
}

function toOperationalSeverity(
  severity: SituationSeverity,
): OperationalSeverity {
  switch (severity) {
    case SituationSeverity.CRITICAL:
      return OperationalSeverity.CRITICAL;
    case SituationSeverity.HIGH:
      return OperationalSeverity.HIGH;
    case SituationSeverity.MEDIUM:
      return OperationalSeverity.MEDIUM;
    case SituationSeverity.LOW:
      return OperationalSeverity.LOW;
    default: {
      const exhaustive: never = severity;
      return exhaustive;
    }
  }
}

function toRecommendationPriority(
  severity: SituationSeverity,
): RecommendationPriority {
  switch (severity) {
    case SituationSeverity.CRITICAL:
      return RecommendationPriority.CRITICAL;
    case SituationSeverity.HIGH:
      return RecommendationPriority.HIGH;
    case SituationSeverity.MEDIUM:
      return RecommendationPriority.MEDIUM;
    case SituationSeverity.LOW:
      return RecommendationPriority.LOW;
    default: {
      const exhaustive: never = severity;
      return exhaustive;
    }
  }
}

function buildAnalysisResult(input: {
  title: string;
  categoryCode: string;
  categoryName: string;
  severity: SituationSeverity;
  coordinationCode: string;
  affected: Array<{ code: string; level: ImpactLevel }>;
  analyzedAt: Date;
}): AIAnalysisResult {
  const operationalSeverity = toOperationalSeverity(input.severity);
  const confidence =
    input.severity === SituationSeverity.CRITICAL
      ? 0.91
      : input.severity === SituationSeverity.HIGH
        ? 0.84
        : input.severity === SituationSeverity.MEDIUM
          ? 0.76
          : 0.68;

  return {
    schemaVersion: AIAnalysisSchemaVersion.V1,
    analyzedAt: input.analyzedAt.toISOString(),
    provider: 'mock-seed',
    executiveSummary: {
      headline: `Lectura asistida: ${input.title}`,
      summary:
        'Análisis mock generado para pruebas locales del Centro Operacional. Resume impacto, urgencia y siguiente paso sugerido.',
      keyPoints: [
        'El caso requiere seguimiento institucional documentado.',
        'Hay señales de impacto cruzado entre áreas.',
        'La contención debe priorizarse según severidad declarada.',
      ],
    },
    incidentClassification: {
      categoryCode: input.categoryCode,
      categoryName: input.categoryName,
      operationalSeverity,
      tags: ['mock', 'seed-local', input.categoryCode.toLowerCase()],
    },
    rootCause: {
      summary: 'Hipótesis mock basada en patrones operativos recurrentes.',
      hypotheses: [
        {
          statement: 'Cambio reciente en configuración o dependencia externa.',
          likelihood: HypothesisLikelihood.MEDIUM,
          supportingEvidence: ['Reporte de usuarios', 'Correlación temporal'],
        },
      ],
    },
    impactAssessment: {
      operationalSeverity,
      confidence,
      estimatedDurationMinutes:
        input.severity === SituationSeverity.CRITICAL
          ? 240
          : input.severity === SituationSeverity.HIGH
            ? 180
            : 90,
      summary:
        'Impacto estimado para validar concentración operativa por área.',
      reasoning:
        'Se proyecta afectación a procesos dependientes mientras el expediente permanece activo.',
      affectedCoordinations: input.affected.map((item) => ({
        coordinationCode: item.code,
        impactLevel: item.level,
        description: `Impacto mock sobre ${item.code}.`,
      })),
      propagation: input.affected.slice(0, 2).map((item, depth) => ({
        coordinationCode: item.code,
        depth: depth + 1,
        impactLevel: item.level,
        description: `Propagación simulada hacia ${item.code}.`,
      })),
    },
    recommendations: RECOMMENDATION_TEMPLATES.slice(0, 3).map((item) => ({
      title: item.title,
      description: item.description,
      priority: toRecommendationPriority(input.severity),
    })),
    immediateRisks: [
      {
        title: 'Pérdida de trazabilidad si no se documenta',
        description:
          'Sin actualización oportuna se dificulta la auditoría ejecutiva.',
        severity: operationalSeverity,
      },
    ],
    futureRisks: [
      {
        title: 'Escalamiento a otras coordinaciones',
        description: 'Si persiste, puede ampliar la carga operativa cruzada.',
        likelihood: HypothesisLikelihood.MEDIUM,
        timeframe: '24-72 horas',
      },
    ],
    missingInformation: [
      {
        topic: 'Alcance de usuarios',
        question:
          '¿Cuántos usuarios reportaron el incidente en la última hora?',
        priority: MissingInformationPriority.MEDIUM,
      },
    ],
    executiveConclusion: {
      conclusion:
        'El expediente debe permanecer bajo seguimiento con foco en contención.',
      recommendedNextStep: `Revisar el caso originado en ${input.coordinationCode} y cerrar brechas de información.`,
    },
    confidence: {
      overall: confidence,
      factors: [
        { name: 'Completitud del registro', score: 0.8 },
        { name: 'Consistencia temporal', score: confidence },
      ],
    },
    executiveDecision: {
      decision: 'Contener y documentar',
      urgencyLevel: operationalSeverity,
      recommendedActionTime: 'Hoy',
      initialResponsible: input.coordinationCode,
    },
    executivePriority: {
      level:
        input.severity === SituationSeverity.CRITICAL
          ? ExecutivePriorityLevel.CRITICA
          : input.severity === SituationSeverity.HIGH
            ? ExecutivePriorityLevel.ALTA
            : input.severity === SituationSeverity.MEDIUM
              ? ExecutivePriorityLevel.MEDIA
              : ExecutivePriorityLevel.BAJA,
      justification: 'Prioridad derivada de severidad y carga simulada.',
    },
  };
}

export interface SituationsMockSeedResult {
  cleared: number;
  created: number;
  withAnalysis: number;
  withImpact: number;
  recommendations: number;
  evidences: number;
  timelineEntries: number;
}

export async function clearMockSituations(
  dataSource: DataSource,
): Promise<number> {
  const situations = await dataSource.getRepository(Situation).find({
    where: {},
    select: ['id', 'description'],
  });
  const mockIds = situations
    .filter((item) => item.description.startsWith(MOCK_SEED_MARKER))
    .map((item) => item.id);

  if (mockIds.length === 0) return 0;

  // Limpiar tablas satélite que no siempre tienen cascade desde situations.
  await dataSource.getRepository(SituationAIAnalysisRecord).delete({
    situationId: In(mockIds),
  });
  await dataSource.getRepository(SituationAnalysisSession).delete({
    situationId: In(mockIds),
  });
  await dataSource.getRepository(Situation).delete({ id: In(mockIds) });
  return mockIds.length;
}

export async function runSituationsMockSeed(
  dataSource: DataSource,
  options?: { count?: number; clearExisting?: boolean },
): Promise<SituationsMockSeedResult> {
  const count = Math.max(1, options?.count ?? DEFAULT_COUNT);
  const clearExisting = options?.clearExisting ?? true;

  const cleared = clearExisting ? await clearMockSituations(dataSource) : 0;

  const [users, categories, coordinations] = await Promise.all([
    dataSource.getRepository(User).find({
      take: 200,
      order: { createdAt: 'ASC' },
      relations: ['role', 'coordination'],
    }),
    dataSource.getRepository(IncidentCategory).find({
      order: { name: 'ASC' },
    }),
    dataSource.getRepository(Coordination).find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    }),
  ]);

  if (users.length === 0) {
    throw new Error(
      'No hay usuarios en la BD local. Ejecuta primero: npm run seed:operaciones',
    );
  }
  if (categories.length === 0) {
    throw new Error(
      'No hay categorías activas. Arranca el backend una vez para sembrar catálogos.',
    );
  }
  if (coordinations.length === 0) {
    throw new Error(
      'No hay coordinaciones activas. Ejecuta primero: npm run seed:operaciones',
    );
  }

  const usersByCoordination = new Map<string, User[]>();
  for (const user of users) {
    if (!user.coordinationId) continue;
    const bucket = usersByCoordination.get(user.coordinationId) ?? [];
    bucket.push(user);
    usersByCoordination.set(user.coordinationId, bucket);
  }

  const coordinatorUsers = users.filter(
    (user) => user.role?.code === 'COORDINADOR' && user.coordinationId,
  );
  if (coordinatorUsers.length === 0) {
    throw new Error(
      'No hay usuarios COORDINADOR con área asignada. Ejecuta: npm run seed:operaciones',
    );
  }

  let created = 0;
  let withAnalysis = 0;
  let withImpact = 0;
  let recommendations = 0;
  let evidences = 0;
  let timelineEntries = 0;

  for (let index = 0; index < count; index += 1) {
    const requestedRecipe = recipeForMockIndex(index);
    const origin = pickOrigin(
      coordinations,
      requestedRecipe.originProfile,
      index,
    );
    const recipe: MockSituationRecipe =
      resolveIslandMockProfile(origin.code) === requestedRecipe.originProfile
        ? requestedRecipe
        : {
            ...requestedRecipe,
            status: SituationStatus.CLOSED,
            sla: 'on_track',
            relateWithinProfile: false,
          };
    const { severity, status } = recipe;
    const timeline = buildMockTimeline(recipe, index);
    const {
      occurredAt,
      createdAt,
      updatedAt,
      resolvedAt,
      closedAt,
      dueAt,
      slaBreachedAt,
    } = timeline;
    const areaUsers = usersByCoordination.get(origin.id) ?? [];
    const creator =
      areaUsers.length > 0
        ? pick(areaUsers, index)
        : pick(coordinatorUsers, index);
    const assigneePool =
      areaUsers.length > 1
        ? areaUsers
        : areaUsers.length === 1
          ? areaUsers
          : [creator];
    const assignee = index % 4 === 0 ? null : pick(assigneePool, index + 1);
    const category = pick(categories, index);
    const title = `${pick(TITLE_TEMPLATES, index)} #${index + 1}`;
    const description = `${MOCK_SEED_MARKER} ${pick(DESCRIPTION_TEMPLATES, index)} Caso de prueba local #${index + 1} para validar densidad del Centro Operacional.`;

    const isFinal =
      status === SituationStatus.CLOSED || status === SituationStatus.RESOLVED;

    const situation = await dataSource.getRepository(Situation).save(
      dataSource.getRepository(Situation).create({
        id: randomUUID(),
        title: title.slice(0, 200),
        description,
        coordinationId: origin.id,
        createdByUserId: creator.id,
        assignedUserId: assignee?.id ?? null,
        categoryId: category.id,
        severity,
        status,
        lastStatusComment: isFinal
          ? 'Cierre simulado por seed mock local.'
          : index % 3 === 0
            ? 'En seguimiento por el área responsable.'
            : null,
        resolvedAt,
        closedAt,
        dueAt,
        slaPolicyCode: SLA_POLICY_CODE,
        slaBreachedAt,
        occurredAt,
        createdAt,
        updatedAt,
      }),
    );
    created += 1;

    const uniqueRelated =
      recipe.relateWithinProfile && !isFinal
        ? coordinationsWithProfile(coordinations, recipe.originProfile)
            .filter((item) => item.id !== origin.id)
            .slice(0, 1)
        : [];
    if (uniqueRelated.length > 0) {
      await dataSource.getRepository(SituationRelatedCoordination).save(
        uniqueRelated.map((item, order) =>
          dataSource.getRepository(SituationRelatedCoordination).create({
            situationId: situation.id,
            coordinationId: item.id,
            displayOrder: order,
          }),
        ),
      );
    }

    // Notas de captura (evidencias tipo NOTE), 1-3 por caso.
    const evidenceCount = 1 + (index % 3);
    for (
      let evidenceIndex = 0;
      evidenceIndex < evidenceCount;
      evidenceIndex += 1
    ) {
      await dataSource.getRepository(SituationEvidence).save(
        dataSource.getRepository(SituationEvidence).create({
          situationId: situation.id,
          uploadedByUserId: creator.id,
          type: EvidenceType.NOTE,
          title:
            evidenceIndex === 0
              ? 'Método de detección'
              : evidenceIndex === 1
                ? 'Afectados percibidos'
                : 'Notas adicionales',
          description:
            evidenceIndex === 0
              ? 'Reporte directo de la coordinación origen (mock).'
              : evidenceIndex === 1
                ? 'Estudiantes, docentes y personal administrativo (mock).'
                : 'Observaciones adicionales capturadas en el formulario (mock).',
          fileName: null,
          storagePath: null,
          mimeType: null,
          fileSize: null,
          createdAt,
        }),
      );
      evidences += 1;
    }

    await dataSource.getRepository(SituationTimelineEntry).save(
      dataSource.getRepository(SituationTimelineEntry).create({
        situationId: situation.id,
        userId: creator.id,
        eventType: TimelineEventType.SITUATION_CREATED,
        title: 'Situación registrada',
        description: `Se registró la situación "${situation.title}".`,
        metadata: {
          mock: true,
          status,
          severity,
        },
        createdAt,
      }),
    );
    timelineEntries += 1;

    if (status === SituationStatus.IN_PROGRESS || isFinal) {
      await dataSource.getRepository(SituationTimelineEntry).save(
        dataSource.getRepository(SituationTimelineEntry).create({
          situationId: situation.id,
          userId: assignee?.id ?? creator.id,
          eventType: TimelineEventType.STATUS_CHANGED,
          title: 'Estado actualizado',
          description: `La situación pasó a ${status}.`,
          metadata: { mock: true, status },
          createdAt: new Date(createdAt.getTime() + 90 * 60_000),
        }),
      );
      timelineEntries += 1;
    }

    const includeAnalysis = index % 5 !== 0;
    if (includeAnalysis) {
      const analyzedAt = new Date(createdAt.getTime() + 20 * 60_000);
      const affectedPool =
        uniqueRelated.length > 0
          ? uniqueRelated
          : [pick(coordinations, index + 4)];
      const affected = affectedPool
        .slice(0, 1 + (index % 2))
        .map((item, affectedIndex) => ({
          code: item.code,
          id: item.id,
          level:
            affectedIndex === 0
              ? severity === SituationSeverity.CRITICAL
                ? ImpactLevel.CRITICAL
                : ImpactLevel.HIGH
              : ImpactLevel.MEDIUM,
        }));

      const analysisResult = buildAnalysisResult({
        title: situation.title,
        categoryCode: category.code,
        categoryName: category.name,
        severity,
        coordinationCode: origin.code,
        affected: affected.map((item) => ({
          code: item.code,
          level: item.level,
        })),
        analyzedAt,
      });

      const session = await dataSource
        .getRepository(SituationAnalysisSession)
        .save(
          dataSource.getRepository(SituationAnalysisSession).create({
            situationId: situation.id,
            version: 1,
            provider: 'mock-seed',
            model: 'local-mock-v1',
            promptVersion: 'mock',
            analysisResult,
            promptSnapshot: 'prompt mock local',
            executionTimeMs: 900 + (index % 400),
            tokenEstimate: 800 + (index % 200),
            createdAt: analyzedAt,
          }),
        );

      await dataSource.getRepository(SituationAIAnalysisRecord).save(
        dataSource.getRepository(SituationAIAnalysisRecord).create({
          situationId: situation.id,
          currentSessionId: session.id,
          provider: 'mock-seed',
          analysisResult,
          createdAt: analyzedAt,
          updatedAt: analyzedAt,
        }),
      );
      withAnalysis += 1;

      const assessment = await dataSource
        .getRepository(SituationImpactAssessment)
        .save(
          dataSource.getRepository(SituationImpactAssessment).create({
            situationId: situation.id,
            operationalSeverity: toOperationalSeverity(severity),
            confidence: String(analysisResult.confidence.overall.toFixed(4)),
            estimatedDurationMinutes:
              analysisResult.impactAssessment.estimatedDurationMinutes,
            summary: analysisResult.impactAssessment.summary,
            reasoning: analysisResult.impactAssessment.reasoning,
            createdAt: analyzedAt,
            updatedAt: analyzedAt,
          }),
        );
      withImpact += 1;

      await dataSource.getRepository(SituationAffectedCoordination).save(
        affected.map((item) =>
          dataSource.getRepository(SituationAffectedCoordination).create({
            impactAssessmentId: assessment.id,
            coordinationId: item.id,
            impactLevel: item.level,
            description: `Afectación mock hacia ${item.code}.`,
          }),
        ),
      );

      const recommendationStatuses = [
        RecommendationStatus.PENDING,
        RecommendationStatus.IN_PROGRESS,
        RecommendationStatus.COMPLETED,
      ] as const;

      for (let recIndex = 0; recIndex < 3; recIndex += 1) {
        const template = pick(RECOMMENDATION_TEMPLATES, index + recIndex);
        const recStatus = pick(recommendationStatuses, index + recIndex);
        await dataSource.getRepository(SituationRecommendation).save(
          dataSource.getRepository(SituationRecommendation).create({
            situationId: situation.id,
            title: template.title,
            description: template.description,
            priority: toRecommendationPriority(severity),
            status: recStatus,
            generatedBy: RecommendationSource.AI,
            assignedUserId: assignee?.id ?? creator.id,
            dueAt: daysAgo(-((index % 5) + 1)),
            completedAt:
              recStatus === RecommendationStatus.COMPLETED
                ? new Date(analyzedAt.getTime() + 6 * 60 * 60_000)
                : null,
            executionNotes:
              recStatus === RecommendationStatus.COMPLETED
                ? 'Acción completada en simulación local.'
                : null,
            createdAt: analyzedAt,
            updatedAt: analyzedAt,
          }),
        );
        recommendations += 1;
      }

      await dataSource.getRepository(SituationTimelineEntry).save(
        dataSource.getRepository(SituationTimelineEntry).create({
          situationId: situation.id,
          userId: null,
          eventType: TimelineEventType.AI_ANALYZED,
          title: 'Análisis IA disponible',
          description: 'Se consolidó una lectura asistida mock del expediente.',
          metadata: { mock: true, provider: 'mock-seed' },
          createdAt: analyzedAt,
        }),
      );
      timelineEntries += 1;
    }
  }

  return {
    cleared,
    created,
    withAnalysis,
    withImpact,
    recommendations,
    evidences,
    timelineEntries,
  };
}
