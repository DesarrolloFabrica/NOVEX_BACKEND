import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import {
  CONSEQUENCE_OPEN_STATUSES,
  OperationalScopeService,
} from '../auth/services/operational-scope.service';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationReportKind } from '../common/enums/situation.enums';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import {
  CreateSituationConsequenceDto,
  SituationConsequenceResponseDto,
} from './dto/situation.dto';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { toConsequenceResponse } from './situation-detail.mappers';
import {
  SeverityEscalationService,
  type MaterializedEscalation,
} from './severity-escalation/severity-escalation.service';

/**
 * AFECTACIONES de un problema INTERNAL vivo: solo se AÑADEN.
 *
 * CONCURRENCIA CON EL CIERRE. La fila de la situación se bloquea con
 * `FOR UPDATE`, el mismo bloqueo que toma `SituationsService.resolve`:
 *   - si la resolución llega primero, esta petición espera, relee `CLOSED` y
 *     responde 409;
 *   - si la afectación llega primero, se persiste y la resolución espera a su
 *     commit para cerrar.
 * Nunca queda una afectación registrada después del cierre.
 */
@Injectable()
export class SituationConsequencesService {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    private readonly scopeService: OperationalScopeService,
    private readonly timelineService: SituationTimelineService,
    private readonly auditLogService: AuditLogService,
    private readonly severityEscalationService: SeverityEscalationService,
  ) {}

  async addConsequence(
    situationId: string,
    dto: CreateSituationConsequenceDto,
    actor: AuthPayload,
  ): Promise<SituationConsequenceResponseDto> {
    // Segunda barrera del texto: el DTO ya recorta y valida.
    const description = dto.description?.trim() ?? '';
    if (description.length === 0) {
      throw new BadRequestException('La afectación no puede estar vacía.');
    }

    const now = new Date();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : now;
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('La fecha de la afectación no es válida.');
    }
    // Instante real, no «fin del día»: una afectación no puede ser futura.
    if (occurredAt.getTime() > now.getTime()) {
      throw new BadRequestException(
        'La fecha de la afectación no puede ser futura.',
      );
    }

    let escalations: MaterializedEscalation[] = [];
    const consequenceId = await this.situationsRepository.manager.transaction(
      async (manager: EntityManager) => {
        // Fila desnuda: las relaciones eager impedirían el FOR UPDATE (ver
        // SituationsService.resolve).
        const situation = await manager.findOne(Situation, {
          where: { id: situationId },
          loadEagerRelations: false,
          lock: { mode: 'pessimistic_write' },
        });
        if (!situation) {
          throw new NotFoundException(
            `Situación no encontrada: ${situationId}`,
          );
        }

        this.scopeService.assertSituationReadable(actor, situation);

        if (situation.reportKind !== SituationReportKind.INTERNAL) {
          throw new BadRequestException(
            'Las afectaciones solo aplican a problemas internos.',
          );
        }
        if (!CONSEQUENCE_OPEN_STATUSES.includes(situation.status)) {
          throw new ConflictException(
            'El problema está cerrado: el cierre congela sus afectaciones.',
          );
        }

        this.scopeService.assertCanAddConsequence(actor, situation);

        if (occurredAt.getTime() < situation.occurredAt.getTime()) {
          throw new BadRequestException(
            'La afectación no puede ser anterior a la ocurrencia del problema.',
          );
        }

        // Mantiene el historial al día antes de añadir (no-op sin política).
        escalations =
          await this.severityEscalationService.materializeDueEscalations({
            manager,
            situation,
            now,
          });

        const consequence = await manager.save(
          SituationConsequence,
          manager.create(SituationConsequence, {
            situationId: situation.id,
            description,
            occurredAt,
            createdAt: now,
            createdByUserId: actor.sub,
          }),
        );

        await this.timelineService.createEntry(
          {
            situationId: situation.id,
            userId: actor.sub,
            eventType: TimelineEventType.CONSEQUENCE_ADDED,
            title: 'Afectación registrada',
            description: 'Se registró una nueva afectación del problema.',
            // Sin el texto: su único almacén es situation_consequences.
            metadata: {
              consequenceId: consequence.id,
              occurredAt: consequence.occurredAt.toISOString(),
            },
          },
          manager,
        );

        return consequence.id;
      },
    );

    await this.auditLogService.record({
      actor,
      action: AuditAction.SITUATION_CONSEQUENCE_ADDED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: situationId,
      metadata: {
        consequenceId,
        occurredAt: occurredAt.toISOString(),
        descriptionLength: description.length,
      },
    });
    await this.severityEscalationService.recordAudit(escalations);

    return this.loadConsequence(consequenceId);
  }

  private async loadConsequence(
    consequenceId: string,
  ): Promise<SituationConsequenceResponseDto> {
    const manager = this.situationsRepository.manager;
    const consequence = await manager.findOne(SituationConsequence, {
      where: { id: consequenceId },
      relations: { createdByUser: true },
    });
    if (!consequence) {
      throw new NotFoundException(
        'No fue posible cargar la afectación creada.',
      );
    }
    const history = await manager.find(SituationSeverityChange, {
      where: { situationId: consequence.situationId },
    });
    return toConsequenceResponse(consequence, history);
  }
}
