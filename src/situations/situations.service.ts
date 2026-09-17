import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import {
  computeDueAt,
  computeSlaHealth,
  resolveDueAtOnSeverityChange,
  SLA_POLICY_CODE,
  wasClosedOnTime,
} from './situation-sla.policy';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { User } from '../users/entities/user.entity';
import {
  CreateSituationDto,
  IncidentCategorySummaryDto,
  ListSituationsQueryDto,
  RelatedCoordinationResponseDto,
  ResolveSituationDto,
  SituationResolutionResponseDto,
  SituationResponseDto,
  SituationsListResponseDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { Situation } from './entities/situation.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationResolution } from './entities/situation-resolution.entity';
import {
  SituationsRepository,
  type SituationSearchFilters,
} from './repositories/situations.repository';
import { isFutureOccurredAt } from './occurred-at.validation';
import {
  isForwardSituationTransition,
  requiresStatusComment,
  SITUATION_STATUS_LABEL_ES,
} from './situation-status.transitions';

/**
 * Estados desde los que se puede SOLUCIONAR un problema en una sola operación.
 *
 * `OPEN` e `IN_PROGRESS` son el flujo vigente. `RESOLVED` es un valor LEGADO al
 * que ninguna transición conduce ya; se acepta aquí únicamente para que las
 * filas históricas que quedaron en él puedan cerrarse. No se reactiva como paso
 * del flujo: nada lo produce.
 */
const RESOLVABLE_STATUSES: readonly SituationStatus[] = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
  SituationStatus.RESOLVED,
];

@Injectable()
export class SituationsService {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(SituationRelatedCoordination)
    private readonly relatedCoordinationsRepository: Repository<SituationRelatedCoordination>,
    @InjectRepository(SituationResolution)
    private readonly resolutionsRepository: Repository<SituationResolution>,
    private readonly timelineService: SituationTimelineService,
    private readonly scopeService: OperationalScopeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listIncidentCategories(): Promise<IncidentCategorySummaryDto[]> {
    const categories = await this.categoriesRepository.find({
      order: { isSelectable: 'DESC', name: 'ASC' },
    });

    return categories.map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      isSelectable: category.isSelectable,
      icon: category.icon,
    }));
  }

  async create(
    dto: CreateSituationDto,
    actor: AuthPayload,
  ): Promise<SituationResponseDto> {
    const coordinationId = this.scopeService.resolveCreateCoordinationId(
      actor,
      dto.coordinationId,
    );

    const [coordination, category, relatedCoordinations] = await Promise.all([
      coordinationId ? this.ensureCoordination(coordinationId) : null,
      this.ensureCategory(dto.categoryId),
      this.resolveRelatedCoordinations(
        dto.relatedCoordinationIds ?? [],
        coordinationId,
      ),
    ]);

    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('La fecha de ocurrencia no es válida.');
    }
    if (isFutureOccurredAt(occurredAt)) {
      throw new BadRequestException(
        'La fecha de ocurrencia no puede ser futura.',
      );
    }

    const createdAt = new Date();
    const situation = this.situationsRepository.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      coordinationId: coordination?.id ?? null,
      coordination,
      createdByUserId: actor.sub,
      categoryId: category.id,
      category,
      severity: dto.severity,
      status: SituationStatus.OPEN,
      assignedUserId: null,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      dueAt: computeDueAt(dto.severity, createdAt),
      slaPolicyCode: SLA_POLICY_CODE,
      slaBreachedAt: null,
      lastSlaReminderAt: null,
      occurredAt: occurredAt,
      relatedCoordinations: relatedCoordinations.map((item, index) =>
        this.relatedCoordinationsRepository.create({
          coordinationId: item.id,
          coordination: item,
          displayOrder: index,
        }),
      ),
    });

    const saved = await this.situationsRepository.save(situation);
    const withRelations = await this.situationsRepository.findByIdWithRelations(
      saved.id,
    );
    if (!withRelations) {
      throw new NotFoundException('No fue posible cargar la situación creada.');
    }

    await this.auditLogService.record({
      actor,
      action: AuditAction.SITUATION_CREATED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: withRelations.id,
      metadata: {
        status: withRelations.status,
        severity: withRelations.severity,
        categoryId: withRelations.categoryId,
        dueAt: withRelations.dueAt,
        slaPolicyCode: withRelations.slaPolicyCode,
      },
    });

    return this.toResponse(withRelations, actor);
  }

  async list(
    query: ListSituationsQueryDto,
    actor: AuthPayload,
  ): Promise<SituationsListResponseDto> {
    this.scopeService.assertPermission(actor, 'SITUATIONS_VIEW');

    /*
     * DOS MODOS DE LISTADO, con alcances distintos:
     *
     *   MIS REPORTES (`mine=true`)  Los casos que creó QUIEN pide, en cualquier
     *                               coordinación. La autoría la pone el
     *                               servidor con `actor.sub`; el cliente solo
     *                               enciende el interruptor. El alcance de
     *                               coordinación NO se aplica aquí, porque ver
     *                               lo que uno mismo reportó no es leer los
     *                               problemas de otra área: es leer los suyos.
     *
     *   LISTADO NORMAL             Sin cambios: un coordinador sigue viendo
     *                               solo su coordinación, y el resto de roles
     *                               lo que ya veían. Esta fase NO abre la
     *                               lectura general de problemas ajenos.
     */
    const { mine, ...rest } = query;

    /*
     * PEDIR OTRA ÁREA DEVUELVE LO QUE UNO PUEDE LEER DE ELLA, NI MÁS NI MENOS.
     *
     * `resolveSituationListCoordinationId` sustituye la coordinación pedida por
     * la del actor cuando está acotado por área, y esa sustitución silenciosa le
     * devolvería los problemas de SU área presentados bajo el rótulo de otra:
     * algo falso. Por eso no se usa aquí.
     *
     * Pero responder con una página vacía también engañaba, de otra forma: un
     * coordinador SÍ puede leer los reportes que él mismo hizo en otra área
     * —`assertSituationReadable` se lo permite, y el detalle se abre sin
     * problema—, así que verlos desaparecer de la lista mientras el panel
     * derecho los muestra era una contradicción en la misma pantalla.
     *
     * La lista se restringe entonces a la INTERSECCIÓN: los problemas de la
     * coordinación pedida QUE ADEMÁS reportó el propio actor. No se abre nada
     * nuevo —es exactamente lo que ya podía leer uno a uno— y la respuesta se
     * marca `own-only` para que la interfaz no presente ese conteo como el
     * total del área.
     */
    const lecturaRestringida =
      !mine &&
      Boolean(query.coordinationId) &&
      this.scopeService.isCoordinationScoped(actor) &&
      query.coordinationId !== actor.coordinationId;

    const scopedQuery: SituationSearchFilters = mine
      ? { ...rest, createdByUserId: actor.sub }
      : lecturaRestringida
        ? { ...rest, createdByUserId: actor.sub }
        : {
            ...rest,
            coordinationId:
              this.scopeService.resolveSituationListCoordinationId(
                actor,
                query.coordinationId,
              ),
          };

    const page = scopedQuery.page ?? 1;
    const limit = scopedQuery.limit ?? 50;
    const [items, total] = await this.situationsRepository.search(scopedQuery);

    return {
      items: items.map((item) => this.toResponse(item, actor)),
      total,
      page,
      limit,
      // El alcance viaja con los datos: una lista vacía no significa lo mismo
      // cuando se leyó todo que cuando solo se leyó lo propio.
      scope: lecturaRestringida ? 'own-only' : 'complete',
    };
  }

  async getById(id: string, actor: AuthPayload): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    // LECTURA: alcance de coordinación O reporte propio. Ver un caso propio de
    // otra área no concede ninguna operación sobre él; eso lo siguen decidiendo
    // `assertCanUpdateSituation` y `assertCanResolveSituation`.
    this.scopeService.assertSituationReadable(actor, situation);
    return this.toResponse(situation, actor);
  }

  async update(
    id: string,
    dto: UpdateSituationDto,
    actor: AuthPayload,
  ): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    this.scopeService.assertCanUpdateSituation(actor, situation);

    /*
     * CIERRE FUERA DE ESTA RUTA.
     *
     * Cerrar un problema es ahora una operación con reglas propias —solo el
     * coordinador del área responsable, y siempre con aprendizaje— y esas
     * reglas no se pueden aplicar desde aquí, porque `assertCanUpdateSituation`
     * autoriza por AUTORÍA o por área, que es un criterio más amplio. Si el
     * PATCH genérico siguiera admitiendo `CLOSED`, el autor de un reporte
     * podría cerrarlo sin ser coordinador y sin registrar ningún aprendizaje.
     *
     * Se bloquea el DESTINO, no el endpoint: el resto de campos y la transición
     * a `IN_PROGRESS` siguen funcionando igual que antes.
     */
    if (dto.status === SituationStatus.CLOSED) {
      throw new ForbiddenException(
        'El cierre se registra en POST /situations/:id/resolution, con el aprendizaje correspondiente.',
      );
    }

    if (
      situation.status === SituationStatus.CLOSED &&
      dto.status !== undefined
    ) {
      throw new BadRequestException(
        'La situación está cerrada y no admite nuevas modificaciones de estado.',
      );
    }

    if (dto.coordinationId !== undefined) {
      if (this.scopeService.isCoordinationScoped(actor)) {
        throw new ForbiddenException(
          'No puede reasignar la coordinación de la situación.',
        );
      }

      const coordination = await this.ensureCoordination(dto.coordinationId);
      situation.coordinationId = coordination.id;
      situation.coordination = coordination;
    }

    if (dto.categoryId !== undefined) {
      const category = await this.ensureCategory(dto.categoryId);
      situation.categoryId = category.id;
      situation.category = category;
    }

    if (dto.title !== undefined) {
      situation.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      situation.description = dto.description.trim();
    }
    if (dto.severity !== undefined) {
      const previousSeverity = situation.severity;
      situation.severity = dto.severity;
      if (dto.severity !== previousSeverity) {
        situation.dueAt = resolveDueAtOnSeverityChange({
          previousSeverity,
          nextSeverity: dto.severity,
          status: situation.status,
          createdAt: situation.createdAt,
          currentDueAt: situation.dueAt,
        });
        situation.slaPolicyCode = SLA_POLICY_CODE;
      }
    }
    if (dto.occurredAt !== undefined) {
      const occurredAt = new Date(dto.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new BadRequestException('La fecha de ocurrencia no es válida.');
      }
      if (isFutureOccurredAt(occurredAt)) {
        throw new BadRequestException(
          'La fecha de ocurrencia no puede ser futura.',
        );
      }
      situation.occurredAt = occurredAt;
    }

    const previousStatus = situation.status;
    const changedFields = this.collectChangedFields(dto);
    let statusTransitionApplied = false;
    let statusComment: string | null = null;

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.assertValidStatusTransition(previousStatus, dto.status);
      statusComment = this.resolveStatusComment(dto.status, dto.statusComment);
      await this.applyStatusTransition(
        situation,
        dto.status,
        statusComment,
        actor.sub,
      );
      statusTransitionApplied = true;
    } else if (dto.statusComment !== undefined) {
      situation.lastStatusComment = dto.statusComment.trim();
    }

    await this.situationsRepository.save(situation);

    if (statusTransitionApplied) {
      await this.recordStatusTransitionTimeline({
        situationId: situation.id,
        actorUserId: actor.sub,
        previousStatus,
        nextStatus: situation.status,
        statusComment,
        assignedUserName: situation.assignedUser?.fullName ?? null,
        evidenceIds: dto.evidenceIds ?? [],
        dueAt: situation.dueAt,
        slaBreachedAt: situation.slaBreachedAt,
        closedOnTime:
          situation.status === SituationStatus.CLOSED
            ? wasClosedOnTime(situation.dueAt, situation.closedAt)
            : null,
      });

      await this.auditLogService.record({
        actor,
        action: AuditAction.SITUATION_STATUS_CHANGED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: situation.id,
        metadata: {
          previousStatus,
          nextStatus: situation.status,
          statusComment,
          dueAt: situation.dueAt,
          slaBreachedAt: situation.slaBreachedAt,
          closedOnTime:
            situation.status === SituationStatus.CLOSED
              ? wasClosedOnTime(situation.dueAt, situation.closedAt)
              : null,
        },
      });
    } else if (changedFields.length > 0) {
      await this.auditLogService.record({
        actor,
        action: AuditAction.SITUATION_UPDATED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: situation.id,
        metadata: { changedFields },
      });
    }

    return this.getById(id, actor);
  }

  /**
   * SOLUCIONAR UN PROBLEMA: cierre y aprendizaje en UNA sola operación atómica.
   *
   * AUTORIZACIÓN. Se decide con `assertCanResolveSituation`, la política única
   * del sistema, y se evalúa contra la coordinación responsable PERSISTIDA que
   * se acaba de leer con bloqueo; nunca contra una coordinación enviada por el
   * cliente, porque el cuerpo de la petición solo trae el aprendizaje. El
   * permiso `SITUATIONS_CLOSE` que exige el controlador es condición necesaria
   * pero NO suficiente: tenerlo no exime de coordinar el área responsable.
   *
   * UNA SOLA PETICIÓN. Se admite `OPEN` además de `IN_PROGRESS`, así que el
   * cliente no encadena dos llamadas. Deliberadamente NO se simula el paso por
   * «En atención» ni se asigna un responsable: `assignedUserId` se queda como
   * estuviera, porque inventar una asignación falsearía el historial.
   *
   * TRANSACCIÓN. El cambio de estado, el aprendizaje y el evento de la línea de
   * tiempo comparten transacción: o se guardan los tres o ninguno. La auditoría
   * se escribe DESPUÉS del commit, a propósito: es un registro observacional y
   * un fallo suyo no debe deshacer una resolución ya confirmada.
   *
   * CONCURRENCIA. Dos defensas, en este orden:
   *   1. `pessimistic_write` sobre la fila de la situación. La segunda petición
   *      espera al commit de la primera, vuelve a leer, ve `CLOSED` y se
   *      rechaza con 409 sin tocar nada.
   *   2. La clave primaria de `situation_resolutions`. Si dos escrituras
   *      llegaran a coincidir pese al bloqueo, la base rechaza la segunda.
   * En ningún caso se sobrescribe el aprendizaje ni cambia la autoría de la
   * resolución ya registrada, y el evento de cierre se emite una sola vez.
   */
  async resolve(
    id: string,
    dto: ResolveSituationDto,
    actor: AuthPayload,
  ): Promise<SituationResponseDto> {
    // Segunda barrera del aprendizaje vacío: el DTO ya recorta y valida, pero
    // el servicio no da por hecho que su única entrada sea el controlador.
    const learning = dto.learning?.trim() ?? '';
    if (learning.length === 0) {
      throw new BadRequestException('El aprendizaje no puede estar vacío.');
    }

    const previousStatus = await this.situationsRepository.manager.transaction(
      async (manager: EntityManager) => {
        /*
         * BLOQUEO SOBRE LA FILA DESNUDA.
         *
         * `loadEagerRelations: false` es imprescindible, no una optimización:
         * `Situation` declara `coordination`, `createdByUser`, `assignedUser` y
         * `category` como EAGER, así que TypeORM las une con LEFT JOIN aunque no
         * se pidan, y PostgreSQL rechaza la consulta con
         *
         *   FOR UPDATE cannot be applied to the nullable side of an outer join
         *
         * Omitir `relations` no basta: las eager se añaden igual. El detalle
         * completo se recarga al final, ya fuera de la transacción.
         */
        const situation = await manager.findOne(Situation, {
          where: { id },
          loadEagerRelations: false,
          lock: { mode: 'pessimistic_write' },
        });

        if (!situation) {
          throw new NotFoundException(`Situación no encontrada: ${id}`);
        }

        this.scopeService.assertCanResolveSituation(actor, situation);

        if (!RESOLVABLE_STATUSES.includes(situation.status)) {
          throw new ConflictException(
            'El problema ya fue solucionado y no admite una nueva resolución.',
          );
        }

        const statusBefore = situation.status;
        const now = new Date();

        situation.status = SituationStatus.CLOSED;
        situation.closedAt = now;
        // `resolvedAt` se conserva si la fila legada ya lo traía.
        situation.resolvedAt = situation.resolvedAt ?? now;
        /*
         * COMENTARIO DE TRANSICIÓN ≠ APRENDIZAJE. `lastStatusComment` describe
         * la ÚLTIMA transición y se sobrescribe en cada cambio de estado; el
         * aprendizaje es el registro definitivo del cierre y vive en su propia
         * tabla. Esta operación no aporta comentario de transición, así que se
         * deja explícitamente en null: copiar ahí el aprendizaje lo expondría a
         * ser borrado por la siguiente escritura, y arrastrar el comentario de
         * una transición anterior lo haría leer como el motivo del cierre.
         */
        situation.lastStatusComment = null;

        await manager.save(Situation, situation);

        try {
          await manager.insert(SituationResolution, {
            situationId: situation.id,
            learning,
            resolvedByUserId: actor.sub,
          });
        } catch (error) {
          // Violación de clave primaria: otra resolución ganó la carrera.
          if (error instanceof QueryFailedError) {
            throw new ConflictException(
              'El problema ya fue solucionado y no admite una nueva resolución.',
            );
          }
          throw error;
        }

        await this.timelineService.createEntry(
          {
            situationId: situation.id,
            userId: actor.sub,
            eventType: TimelineEventType.CLOSED,
            title: 'Problema solucionado',
            description: `El estado cambió de ${SITUATION_STATUS_LABEL_ES[statusBefore]} a ${SITUATION_STATUS_LABEL_ES[SituationStatus.CLOSED]}. Aprendizaje registrado.`,
            metadata: {
              field: 'status',
              previousValue: statusBefore,
              newValue: SituationStatus.CLOSED,
              previousLabel: SITUATION_STATUS_LABEL_ES[statusBefore],
              newLabel: SITUATION_STATUS_LABEL_ES[SituationStatus.CLOSED],
              /*
               * `commentKind: 'learning'` distingue este evento del cierre
               * antiguo, cuyo texto era un motivo de transición. El aprendizaje
               * NO se copia al metadata: su único almacén es
               * `situation_resolutions`.
               */
              commentKind: 'learning',
              statusComment: null,
              resolvedByUserId: actor.sub,
              dueAt: situation.dueAt,
              closedOnTime: wasClosedOnTime(situation.dueAt, situation.closedAt),
              slaBreachedAt: situation.slaBreachedAt,
            },
          },
          manager,
        );

        return statusBefore;
      },
    );

    await this.auditLogService.record({
      actor,
      action: AuditAction.SITUATION_RESOLVED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: id,
      metadata: {
        previousStatus,
        nextStatus: SituationStatus.CLOSED,
        // Se audita QUE hubo aprendizaje y su tamaño, no su contenido: el texto
        // tiene un único almacén y la auditoría no debe volverse un segundo
        // lugar donde buscarlo.
        learningLength: learning.length,
      },
    });

    return this.getById(id, actor);
  }

  private collectChangedFields(dto: UpdateSituationDto): string[] {
    const fields: string[] = [];
    if (dto.title !== undefined) fields.push('title');
    if (dto.description !== undefined) fields.push('description');
    if (dto.severity !== undefined) fields.push('severity');
    if (dto.categoryId !== undefined) fields.push('categoryId');
    if (dto.coordinationId !== undefined) fields.push('coordinationId');
    if (dto.occurredAt !== undefined) fields.push('occurredAt');
    if (dto.statusComment !== undefined) fields.push('statusComment');
    return fields;
  }

  private assertValidStatusTransition(
    from: SituationStatus,
    to: SituationStatus,
  ): void {
    if (!isForwardSituationTransition(from, to)) {
      throw new BadRequestException(
        `Transición no permitida: ${SITUATION_STATUS_LABEL_ES[from]} → ${SITUATION_STATUS_LABEL_ES[to]}. Solo se admite el siguiente estado del ciclo operativo.`,
      );
    }
  }

  private resolveStatusComment(
    nextStatus: SituationStatus,
    rawComment?: string,
  ): string | null {
    const trimmed = rawComment?.trim() ?? '';
    if (requiresStatusComment(nextStatus) && trimmed.length === 0) {
      throw new BadRequestException('Motivo de cierre es obligatorio.');
    }
    return trimmed.length > 0 ? trimmed : null;
  }

  private async applyStatusTransition(
    situation: Situation,
    nextStatus: SituationStatus,
    statusComment: string | null,
    actorUserId?: string | null,
  ): Promise<void> {
    situation.status = nextStatus;
    situation.lastStatusComment = statusComment;

    if (nextStatus === SituationStatus.IN_PROGRESS) {
      if (!actorUserId) {
        throw new BadRequestException(
          'Se requiere un usuario autenticado para pasar la situación a En atención.',
        );
      }
      const assignedUser = await this.usersRepository.findOne({
        where: { id: actorUserId },
      });
      if (!assignedUser) {
        throw new NotFoundException(`Usuario no encontrado: ${actorUserId}`);
      }
      situation.assignedUserId = assignedUser.id;
      situation.assignedUser = assignedUser;
    }

    if (nextStatus === SituationStatus.RESOLVED) {
      situation.resolvedAt = new Date();
    }

    if (nextStatus === SituationStatus.CLOSED) {
      situation.closedAt = new Date();
      if (!situation.resolvedAt) {
        situation.resolvedAt = situation.closedAt;
      }
    }
  }

  private async recordStatusTransitionTimeline(input: {
    situationId: string;
    actorUserId: string | null;
    previousStatus: SituationStatus;
    nextStatus: SituationStatus;
    statusComment: string | null;
    assignedUserName: string | null;
    evidenceIds: string[];
    dueAt: Date | null;
    slaBreachedAt: Date | null;
    closedOnTime: boolean | null;
  }): Promise<void> {
    const fromLabel = SITUATION_STATUS_LABEL_ES[input.previousStatus];
    const toLabel = SITUATION_STATUS_LABEL_ES[input.nextStatus];
    const eventType =
      input.nextStatus === SituationStatus.CLOSED
        ? TimelineEventType.CLOSED
        : TimelineEventType.STATUS_CHANGED;

    const title =
      input.nextStatus === SituationStatus.CLOSED
        ? 'Situación cerrada'
        : 'Estado actualizado';

    const descriptionParts = [`El estado cambió de ${fromLabel} a ${toLabel}.`];
    if (
      input.nextStatus === SituationStatus.IN_PROGRESS &&
      input.assignedUserName
    ) {
      descriptionParts.push(`Responsable: ${input.assignedUserName}.`);
    }
    if (input.statusComment) {
      const commentLabel =
        input.nextStatus === SituationStatus.CLOSED ? 'Motivo' : 'Nota';
      descriptionParts.push(`${commentLabel}: ${input.statusComment}`);
    }

    await this.timelineService.createEntry({
      situationId: input.situationId,
      userId: input.actorUserId,
      eventType,
      title,
      description: descriptionParts.join(' '),
      metadata: {
        field: 'status',
        previousValue: input.previousStatus,
        newValue: input.nextStatus,
        previousLabel: fromLabel,
        newLabel: toLabel,
        statusComment: input.statusComment,
        commentKind:
          input.nextStatus === SituationStatus.CLOSED ? 'closure' : 'note',
        assignedUserName: input.assignedUserName,
        /** Estructura preparada para evidencias futuras. */
        evidenceIds: input.evidenceIds,
        evidencesAttached: false,
        dueAt: input.dueAt,
        closedOnTime: input.closedOnTime,
        slaBreachedAt: input.slaBreachedAt,
      },
    });
  }

  private async ensureCoordination(id: string): Promise<Coordination> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id, isActive: true },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${id}`);
    }
    return coordination;
  }

  private async ensureCategory(id: string): Promise<IncidentCategory> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría no encontrada: ${id}`);
    }
    return category;
  }

  private async resolveRelatedCoordinations(
    relatedCoordinationIds: string[],
    originCoordinationId: string | null,
  ): Promise<Coordination[]> {
    const uniqueIds = [
      ...new Set(relatedCoordinationIds.map((id) => id.trim())),
    ]
      .filter((id) => id.length > 0)
      .filter((id) => id !== originCoordinationId);

    if (uniqueIds.length === 0) {
      return [];
    }

    const found = await this.coordinationsRepository.find({
      where: { id: In(uniqueIds), isActive: true },
    });

    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((item) => item.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Coordinación relacionada no encontrada: ${missing.join(', ')}`,
      );
    }

    const byId = new Map(found.map((item) => [item.id, item]));
    return uniqueIds.map((id) => byId.get(id)!);
  }

  private toRelatedCoordinationResponse(
    item: SituationRelatedCoordination,
  ): RelatedCoordinationResponseDto {
    return {
      id: item.id,
      coordinationId: item.coordinationId,
      coordinationCode: item.coordination.code,
      coordinationName: item.coordination.name,
      coordinationShortName: item.coordination.shortName,
      displayOrder: item.displayOrder,
    };
  }

  private toResolutionResponse(
    situation: Situation,
  ): SituationResolutionResponseDto | null {
    const resolution = situation.resolution;
    if (!resolution) return null;

    return {
      learning: resolution.learning,
      resolvedByUserId: resolution.resolvedByUserId,
      resolvedByUserName: resolution.resolvedByUser?.fullName ?? '',
      // La FECHA no se duplica en la tabla de aprendizaje: sale del campo que
      // ya tenía esa semántica en el dominio.
      resolvedAt: situation.resolvedAt ?? null,
      recordedAt: resolution.createdAt,
    };
  }

  /**
   * `actor` entra aquí solo para resolver `canResolve` con la MISMA política
   * que autoriza la escritura. Es una pista para la interfaz, nunca la
   * autorización: el endpoint vuelve a comprobarla contra la coordinación
   * responsable persistida en cada resolución.
   */
  private toResponse(
    situation: Situation,
    actor: AuthPayload,
  ): SituationResponseDto {
    const related = [...(situation.relatedCoordinations ?? [])].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    return {
      id: situation.id,
      title: situation.title,
      description: situation.description,
      coordinationId: situation.coordinationId,
      coordinationCode: situation.coordination?.code ?? null,
      coordinationName: situation.coordination?.name ?? null,
      createdByUserId: situation.createdByUserId,
      createdByUserName: situation.createdByUser.fullName,
      assignedUserId: situation.assignedUserId ?? null,
      assignedUserName: situation.assignedUser?.fullName ?? null,
      categoryId: situation.categoryId,
      categoryCode: situation.category.code,
      categoryName: situation.category.name,
      categoryIcon: situation.category.icon,
      severity: situation.severity,
      status: situation.status,
      lastStatusComment: situation.lastStatusComment ?? null,
      resolvedAt: situation.resolvedAt ?? null,
      closedAt: situation.closedAt ?? null,
      dueAt: situation.dueAt ?? null,
      slaPolicyCode: situation.slaPolicyCode ?? null,
      slaBreachedAt: situation.slaBreachedAt ?? null,
      slaHealth: computeSlaHealth(
        situation.dueAt,
        situation.status,
        new Date(),
        situation.severity,
      ),
      closedOnTime:
        situation.status === SituationStatus.CLOSED
          ? wasClosedOnTime(situation.dueAt, situation.closedAt)
          : null,
      occurredAt: situation.occurredAt,
      createdAt: situation.createdAt,
      updatedAt: situation.updatedAt,
      relatedCoordinations: related.map((item) =>
        this.toRelatedCoordinationResponse(item),
      ),
      resolution: this.toResolutionResponse(situation),
      canResolve:
        RESOLVABLE_STATUSES.includes(situation.status) &&
        this.scopeService.canResolveSituation(actor, situation),
    };
  }
}
