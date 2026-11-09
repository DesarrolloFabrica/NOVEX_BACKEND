import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import {
  OperationalScopeService,
  SITUATION_CLOSED_CODE,
} from '../auth/services/operational-scope.service';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import {
  CancelSituationDto,
  SITUATION_ADMIN_REASON_MAX_LENGTH,
  SITUATION_ADMIN_REASON_MIN_LENGTH,
  SituationDetailResponseDto,
} from './dto/situation.dto';
import { SituationCancellation } from './entities/situation-cancellation.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SITUATION_STATUS_LABEL_ES } from './situation-status.transitions';
import { SituationsService } from './situations.service';

/** Código de negocio: la situación ya estaba anulada. */
export const SITUATION_ALREADY_CANCELLED_CODE = 'SITUATION_ALREADY_CANCELLED';

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
