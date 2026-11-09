import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import {
  OperationalScopeService,
  SITUATION_CANCELLED_CODE,
  SITUATION_CLOSED_CODE,
} from '../auth/services/operational-scope.service';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import {
  CancelSituationDto,
  SITUATION_ADMIN_REASON_MAX_LENGTH,
  SITUATION_ADMIN_REASON_MIN_LENGTH,
  SituationDetailResponseDto,
  TransferSituationCoordinationDto,
} from './dto/situation.dto';
import { SituationCancellation } from './entities/situation-cancellation.entity';
import { SituationCoordinationTransfer } from './entities/situation-coordination-transfer.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SITUATION_STATUS_LABEL_ES } from './situation-status.transitions';
import { SituationsService } from './situations.service';

/** Código de negocio: la situación ya estaba anulada. */
export const SITUATION_ALREADY_CANCELLED_CODE = 'SITUATION_ALREADY_CANCELLED';

/** Códigos de negocio del traslado. */
export const TRANSFER_ERROR_CODES = {
  COORDINATION_CHANGED: 'COORDINATION_CHANGED',
  SAME_COORDINATION: 'TRANSFER_SAME_COORDINATION',
  DESTINATION_INACTIVE: 'TRANSFER_DESTINATION_INACTIVE',
  DESTINATION_IS_AFFECTED: 'TRANSFER_DESTINATION_IS_AFFECTED',
} as const;

/**
 * ACCIONES ADMINISTRATIVAS SOBRE SITUACIONES (Fase 01B.1).
 *
 * Solo ADMIN, con permiso específico y motivo obligatorio. Ninguna acción
 * borra información: la situación, su autor, su fecha de registro, su línea de
 * tiempo, sus afectaciones, recomendaciones y análisis se conservan.
 *
 * CONCURRENCIA. Cada acción lee la fila con `pessimistic_write` dentro de
 * una transacción, igual que el PATCH, la resolución y las afectaciones; así
 * una anulación, un traslado, un cierre o una edición simultáneos se
 * serializan y el segundo decide sobre el estado que dejó el primero.
 *
 * TRAZABILIDAD. Registro de dominio append-only + evento de línea de tiempo +
 * auditoría obligatoria, los tres en la misma transacción.
 */
@Injectable()
export class SituationAdministrationService {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    private readonly situationsService: SituationsService,
    private readonly scopeService: OperationalScopeService,
    private readonly timelineService: SituationTimelineService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

  /**
   * ANULAR una situación errónea o duplicada.
   *
   *   OPEN / IN_PROGRESS / RESOLVED (legado)  → CANCELLED
   *   CANCELLED                               → 409 SITUATION_ALREADY_CANCELLED
   *   CLOSED                                  → 409 SITUATION_CLOSED
   *
   * Un caso CLOSED ya tiene solución y aprendizaje; anularlo reescribiría su
   * historia en los indicadores. Queda fuera hasta una decisión de producto
   * (documentada en docs/seguridad-y-permisos.md).
   *
   * Efectos: deja de contar en indicadores, vidas, integridad, vencimientos,
   * recurrencia y tiempos de resolución. Afectaciones, recomendaciones y
   * análisis se conservan tal cual y quedan congelados (ninguna escritura
   * nueva los admite). `closed_at` NO se fija: anular no es cerrar.
   */
  async cancel(
    id: string,
    dto: CancelSituationDto,
    actor: AuthPayload,
  ): Promise<SituationDetailResponseDto> {
    this.scopeService.assertCanAdministerSituation(actor, 'SITUATIONS_CANCEL');
    const reason = this.normalizeReason(dto.reason);

    await this.situationsRepository.manager.transaction(async (manager) => {
      const situation = await this.lockSituation(manager, id);

      if (situation.status === SituationStatus.CANCELLED) {
        throw new ConflictException({
          code: SITUATION_ALREADY_CANCELLED_CODE,
          message: 'La situación ya estaba anulada.',
        });
      }
      if (situation.status === SituationStatus.CLOSED) {
        throw new ConflictException({
          code: SITUATION_CLOSED_CODE,
          message:
            'Una situación cerrada no se anula: ya tiene solución y aprendizaje registrados.',
        });
      }

      const previousStatus = situation.status;

      // Escritura PARCIAL: solo el estado. No dispara el subscriber de campos
      // (no hay evento UPDATED duplicado) y no toca autor, fechas ni SLA.
      await manager.update(
        Situation,
        { id },
        {
          status: SituationStatus.CANCELLED,
        },
      );

      await manager.insert(SituationCancellation, {
        situationId: id,
        reason,
        previousStatus,
        cancelledByUserId: actor.sub,
      });

      await this.timelineService.createEntry(
        {
          situationId: id,
          userId: actor.sub,
          eventType: TimelineEventType.CANCELLED,
          title: 'Situación anulada',
          description: `La administración anuló la situación (estado anterior: ${SITUATION_STATUS_LABEL_ES[previousStatus]}). Motivo: ${reason}`,
          metadata: { previousStatus },
        },
        manager,
      );

      await this.auditLogService.recordCritical(
        {
          actor,
          action: AuditAction.SITUATION_CANCELLED,
          resourceType: AuditResourceType.SITUATION,
          resourceId: id,
          metadata: {
            previousStatus,
            nextStatus: SituationStatus.CANCELLED,
            reportKind: situation.reportKind,
            coordinationId: situation.coordinationId,
            affectedCoordinationId: situation.affectedCoordinationId,
            reasonLength: reason.length,
          },
        },
        manager,
      );
    });

    return this.situationsService.getById(id, actor);
  }

  /**
   * TRASLADAR la coordinación responsable.
   *
   * Reglas:
   *   - estado OPEN / IN_PROGRESS / RESOLVED; CLOSED o CANCELLED → 409;
   *   - `expectedCurrentCoordinationId` (opcional) distinto del vigente → 409
   *     COORDINATION_CHANGED (el administrador decidió sobre un dato viejo);
   *   - destino existente (404) y activo (400), distinto del actual (400);
   *   - INTERNAL: la afectada se traslada con la responsable (invariante
   *     afectada = responsable). El reporte sigue siendo INTERNAL: no se
   *     convierte en INTER;
   *   - INTER: solo cambia la responsable y debe seguir siendo distinta de la
   *     afectada (400 TRANSFER_DESTINATION_IS_AFFECTED).
   *
   * Se conservan autor, fechas y severidad. Si estaba IN_PROGRESS, vuelve a
   * OPEN y se retira la asignación; ambos valores quedan en el historial.
   * `due_at` se conserva porque la promesa SLA nace con el reporte.
   */
  async transferCoordination(
    id: string,
    dto: TransferSituationCoordinationDto,
    actor: AuthPayload,
  ): Promise<SituationDetailResponseDto> {
    this.scopeService.assertCanAdministerSituation(
      actor,
      'SITUATIONS_TRANSFER',
    );
    const reason = this.normalizeReason(dto.reason);

    await this.situationsRepository.manager.transaction(async (manager) => {
      const situation = await this.lockSituation(manager, id);

      if (situation.status === SituationStatus.CANCELLED) {
        throw new ConflictException({
          code: SITUATION_CANCELLED_CODE,
          message: 'Una situación anulada no se traslada.',
        });
      }
      if (situation.status === SituationStatus.CLOSED) {
        throw new ConflictException({
          code: SITUATION_CLOSED_CODE,
          message: 'Una situación cerrada no se traslada.',
        });
      }

      const fromCoordinationId = situation.coordinationId;
      if (
        dto.expectedCurrentCoordinationId !== undefined &&
        dto.expectedCurrentCoordinationId !== fromCoordinationId
      ) {
        throw new ConflictException({
          code: TRANSFER_ERROR_CODES.COORDINATION_CHANGED,
          message:
            'La coordinación responsable cambió desde que se consultó. Recargue la situación.',
        });
      }
      if (dto.toCoordinationId === fromCoordinationId) {
        throw new BadRequestException({
          code: TRANSFER_ERROR_CODES.SAME_COORDINATION,
          message: 'La coordinación destino es la responsable actual.',
        });
      }

      const destination = await manager.findOne(Coordination, {
        where: { id: dto.toCoordinationId },
      });
      if (!destination) {
        throw new NotFoundException('Coordinación destino no encontrada.');
      }
      if (!destination.isActive) {
        throw new BadRequestException({
          code: TRANSFER_ERROR_CODES.DESTINATION_INACTIVE,
          message: 'La coordinación destino no está activa.',
        });
      }

      const isInternal = situation.reportKind === SituationReportKind.INTERNAL;
      if (
        !isInternal &&
        dto.toCoordinationId === situation.affectedCoordinationId
      ) {
        throw new BadRequestException({
          code: TRANSFER_ERROR_CODES.DESTINATION_IS_AFFECTED,
          message:
            'En una dependencia entre coordinaciones, la responsable no puede ser la misma que la afectada.',
        });
      }

      const origin = fromCoordinationId
        ? await manager.findOne(Coordination, {
            where: { id: fromCoordinationId },
          })
        : null;

      const previousStatus = situation.status;
      const previousAssignedUserId = situation.assignedUserId ?? null;
      const nextStatus =
        previousStatus === SituationStatus.IN_PROGRESS
          ? SituationStatus.OPEN
          : previousStatus;
      const nextAssignedUserId =
        previousStatus === SituationStatus.IN_PROGRESS
          ? null
          : previousAssignedUserId;

      // Escritura PARCIAL bajo el bloqueo: sin evento UPDATED duplicado.
      await manager.update(
        Situation,
        { id },
        isInternal
          ? {
              coordinationId: destination.id,
              affectedCoordinationId: destination.id,
              status: nextStatus,
              assignedUserId: nextAssignedUserId,
            }
          : {
              coordinationId: destination.id,
              status: nextStatus,
              assignedUserId: nextAssignedUserId,
            },
      );

      await manager.insert(SituationCoordinationTransfer, {
        situationId: id,
        fromCoordinationId,
        toCoordinationId: destination.id,
        reason,
        statusAtTransfer: situation.status,
        reportKind: situation.reportKind,
        previousAssignedUserId,
        nextAssignedUserId,
        transferredByUserId: actor.sub,
      });

      await this.timelineService.createEntry(
        {
          situationId: id,
          userId: actor.sub,
          eventType: TimelineEventType.COORDINATION_TRANSFERRED,
          title: 'Coordinación responsable trasladada',
          description: `La administración trasladó la situación de ${origin?.name ?? 'sin coordinación'} a ${destination.name}. Motivo: ${reason}`,
          metadata: {
            fromCoordinationId,
            toCoordinationId: destination.id,
            reportKind: situation.reportKind,
            statusAtTransfer: situation.status,
            nextStatus,
            previousAssignedUserId,
            nextAssignedUserId,
          },
        },
        manager,
      );

      await this.auditLogService.recordCritical(
        {
          actor,
          action: AuditAction.SITUATION_COORDINATION_TRANSFERRED,
          resourceType: AuditResourceType.SITUATION,
          resourceId: id,
          metadata: {
            previousCoordinationId: fromCoordinationId,
            nextCoordinationId: destination.id,
            previousAffectedCoordinationId: situation.affectedCoordinationId,
            nextAffectedCoordinationId: isInternal
              ? destination.id
              : situation.affectedCoordinationId,
            reportKind: situation.reportKind,
            statusAtTransfer: situation.status,
            nextStatus,
            previousAssignedUserId,
            nextAssignedUserId,
            reasonLength: reason.length,
          },
        },
        manager,
      );
    });

    return this.situationsService.getById(id, actor);
  }

  /** Fila de la situación con bloqueo exclusivo; 404 si no existe. */
  private async lockSituation(
    manager: EntityManager,
    id: string,
  ): Promise<Situation> {
    const situation = await manager.findOne(Situation, {
      where: { id },
      loadEagerRelations: false,
      lock: { mode: 'pessimistic_write' },
    });
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }
    return situation;
  }

  /** Segunda barrera del motivo: el DTO ya recorta y valida. */
  private normalizeReason(raw: string | undefined): string {
    const reason = raw?.trim() ?? '';
    if (
      reason.length < SITUATION_ADMIN_REASON_MIN_LENGTH ||
      reason.length > SITUATION_ADMIN_REASON_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `El motivo debe tener entre ${SITUATION_ADMIN_REASON_MIN_LENGTH} y ${SITUATION_ADMIN_REASON_MAX_LENGTH} caracteres.`,
      );
    }
    return reason;
  }
}
