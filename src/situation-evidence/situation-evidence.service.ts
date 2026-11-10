import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import {
  ADMIN_ROLE_CODE,
  OperationalScopeService,
} from '../auth/services/operational-scope.service';
import { EvidenceType } from '../common/enums/situation-evidence.enums';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { isUniqueViolation } from '../common/utils/database-errors';
import { Situation } from '../situations/entities/situation.entity';
import { SituationAccessService } from '../situations/situation-access.service';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import {
  CreateSituationEvidenceDto,
  RetireSituationEvidenceDto,
  SituationEvidenceResponseDto,
  SituationEvidencesListResponseDto,
} from './dto/situation-evidence.dto';
import { SituationEvidence } from './entities/situation-evidence.entity';
import { SituationEvidenceRepository } from './repositories/situation-evidence.repository';
import { EvidenceStorageService } from './storage/evidence-storage.service';

/** 409 al retirar una evidencia ya retirada. */
export const EVIDENCE_ALREADY_RETIRED_CODE = 'EVIDENCE_ALREADY_RETIRED';

@Injectable()
export class SituationEvidenceService {
  constructor(
    private readonly evidenceRepository: SituationEvidenceRepository,
    private readonly situationAccessService: SituationAccessService,
    private readonly storageService: EvidenceStorageService,
    private readonly timelineService: SituationTimelineService,
    private readonly auditLogService: AuditLogService,
    private readonly scopeService: OperationalScopeService,
  ) {}

  /**
   * ALTA DE EVIDENCIA (Fase 01B.1). En una transacción:
   *   1. la situación se lee con bloqueo compartido (FOR SHARE): dos altas
   *      conviven, pero un cierre, anulación o traslado espera o es esperado;
   *   2. una repetición con la misma `clientKey` devuelve la existente, aun si
   *      el caso cambió de estado después (idempotencia del primer intento);
   *   3. solo un caso activo (OPEN / IN_PROGRESS) admite evidencias nuevas:
   *      CLOSED y CANCELLED son inmutables (409);
   *   4. evidencia, línea de tiempo y auditoría obligatoria se confirman juntas.
   */
  async create(
    situationId: string,
    dto: CreateSituationEvidenceDto,
    actor: AuthPayload,
  ): Promise<SituationEvidenceResponseDto> {
    const fileFields = this.resolveFileFields(situationId, dto);

    let savedId: string;
    try {
      savedId = await this.evidenceRepository.manager.transaction(
        async (manager) => {
          const situation = await this.lockSituation(manager, situationId);

          if (dto.clientKey) {
            const existing = await manager.findOne(SituationEvidence, {
              where: { situationId, clientKey: dto.clientKey },
              loadEagerRelations: false,
            });
            if (existing) {
              return existing.id;
            }
          }

          this.scopeService.assertSituationWorkable(situation);

          const saved = await manager.save(
            SituationEvidence,
            manager.create(SituationEvidence, {
              situationId,
              uploadedByUserId: actor.sub,
              type: dto.type,
              title: dto.title.trim(),
              description: dto.description.trim(),
              fileName: fileFields.fileName,
              storagePath: fileFields.storagePath,
              mimeType: fileFields.mimeType,
              fileSize: fileFields.fileSize,
              clientKey: dto.clientKey ?? null,
            }),
          );

          await this.timelineService.createEntry(
            {
              situationId,
              userId: actor.sub,
              eventType: TimelineEventType.ATTACHMENT_ADDED,
              title: 'Evidencia agregada',
              description: `Se agregó la evidencia "${saved.title}" (${saved.type}).`,
              metadata: {
                evidenceId: saved.id,
                type: saved.type,
                fileName: saved.fileName,
                storagePath: saved.storagePath,
              },
            },
            manager,
          );

          await this.auditLogService.recordCritical(
            {
              actor,
              action: AuditAction.SITUATION_EVIDENCE_ADDED,
              resourceType: AuditResourceType.SITUATION,
              resourceId: situationId,
              metadata: {
                evidenceId: saved.id,
                type: saved.type,
                hasFile: saved.fileName !== null,
                fileSize: saved.fileSize,
              },
            },
            manager,
          );

          return saved.id;
        },
      );
    } catch (error) {
      if (!dto.clientKey || !isUniqueViolation(error)) {
        throw error;
      }
      // Otra solicitud con la misma clave insertó primero.
      const concurrent = await this.findByClientKey(situationId, dto.clientKey);
      if (!concurrent) {
        throw error;
      }
      return this.toResponse(concurrent);
    }

    const withUser = await this.evidenceRepository.findByIdAndSituationId(
      savedId,
      situationId,
    );
    if (!withUser) {
      throw new NotFoundException(`Evidencia no encontrada: ${savedId}`);
    }
    return this.toResponse(withUser);
  }

  /**
   * LECTURA DE EVIDENCIAS (Fase 01B.2). La autorización vive en el servicio,
   * no solo en el controlador, para que ninguna ruta ni consumidor la omita:
   *   - leer el caso (`requireAccessibleSituation`) basta para las ACTIVAS;
   *     fuera de alcance o inexistente: 404;
   *   - `includeRetired` exige además poder operar el caso o ser ADMIN
   *     (`assertCanViewRetiredEvidence`).
   */
  async findBySituation(
    situationId: string,
    actor: AuthPayload,
    options: { includeRetired?: boolean } = {},
  ): Promise<SituationEvidencesListResponseDto> {
    const situation =
      await this.situationAccessService.requireAccessibleSituation(
        actor,
        situationId,
      );
    const includeRetired = options.includeRetired === true;
    if (includeRetired && !this.canViewRetiredEvidence(actor, situation)) {
      throw new NotFoundException('Historial de evidencias no encontrado.');
    }

    const items = await this.evidenceRepository.findBySituationId(situationId, {
      includeRetired,
    });

    return {
      situationId,
      items: items.map((item) => this.toResponse(item)),
      total: items.length,
    };
  }

  /**
   * Consulta individual. Una evidencia ACTIVA sigue la regla de lectura del
   * caso. Una RETIRADA exige el mismo permiso que `includeRetired`; sin él se
   * responde 404, igual que si no existiera: conocer el id no revela la
   * evidencia, su retiro ni su motivo.
   */
  async getById(
    situationId: string,
    evidenceId: string,
    actor: AuthPayload,
  ): Promise<SituationEvidenceResponseDto> {
    const situation =
      await this.situationAccessService.requireAccessibleSituation(
        actor,
        situationId,
      );

    const evidence = await this.evidenceRepository.findByIdAndSituationId(
      evidenceId,
      situationId,
    );
    if (
      !evidence ||
      (evidence.retiredAt && !this.canViewRetiredEvidence(actor, situation))
    ) {
      throw new NotFoundException(`Evidencia no encontrada: ${evidenceId}`);
    }
    return this.toResponse(evidence);
  }

  /**
   * Ver evidencias retiradas (y su motivo): ADMIN, o quien tiene permiso
   * explícito SITUATIONS_UPDATE y puede operar el caso (alcance de coordinación
   * + propiedad), es decir, quien podría haber retirado. Cualquier denegación
   * se oculta como 404 para no revelar la existencia de la retirada.
   */
  private canViewRetiredEvidence(
    actor: AuthPayload,
    situation: Situation,
  ): boolean {
    if (actor.roleCode === ADMIN_ROLE_CODE) {
      return true;
    }
    try {
      this.scopeService.assertPermission(actor, 'SITUATIONS_UPDATE');
      this.scopeService.assertSituationInScope(actor, situation);
      this.scopeService.assertCanOperateSituation(actor, situation);
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * RETIRO DE EVIDENCIA (Fase 01B.2). Sustituye al borrado físico: la fila se
   * conserva con fecha, autor y motivo. En una transacción:
   *   1. la situación se lee con bloqueo compartido (FOR SHARE);
   *   2. la evidencia se bloquea (FOR UPDATE): dos retiros concurrentes no
   *      pueden ganar ambos; una ya retirada responde 409;
   *   3. solo un caso activo admite retiros (CLOSED / CANCELLED / RESOLVED
   *      legado: 409), igual que las altas;
   *   4. retiro, línea de tiempo y auditoría obligatoria se confirman juntas.
   *      Ni la línea de tiempo ni la auditoría guardan el texto del motivo.
   */
  async retire(
    situationId: string,
    evidenceId: string,
    dto: RetireSituationEvidenceDto,
    actor: AuthPayload,
  ): Promise<SituationEvidenceResponseDto> {
    await this.evidenceRepository.manager.transaction(async (manager) => {
      const situation = await this.lockSituation(manager, situationId);

      const evidence = await manager.findOne(SituationEvidence, {
        where: { id: evidenceId, situationId },
        loadEagerRelations: false,
        lock: { mode: 'pessimistic_write' },
      });
      if (!evidence) {
        throw new NotFoundException(`Evidencia no encontrada: ${evidenceId}`);
      }
      if (evidence.retiredAt) {
        throw new ConflictException({
          code: EVIDENCE_ALREADY_RETIRED_CODE,
          message: 'La evidencia ya fue retirada.',
        });
      }

      this.scopeService.assertSituationWorkable(situation);

      const reason = dto.reason.trim();
      await manager.update(
        SituationEvidence,
        { id: evidenceId, situationId },
        {
          retiredAt: new Date(),
          retiredByUserId: actor.sub,
          retirementReason: reason,
        },
      );

      await this.timelineService.createEntry(
        {
          situationId,
          userId: actor.sub,
          eventType: TimelineEventType.ATTACHMENT_RETIRED,
          title: 'Evidencia retirada',
          description: `Se retiró la evidencia "${evidence.title}" (${evidence.type}).`,
          metadata: {
            evidenceId,
            type: evidence.type,
            reasonLength: reason.length,
          },
        },
        manager,
      );

      await this.auditLogService.recordCritical(
        {
          actor,
          action: AuditAction.SITUATION_EVIDENCE_RETIRED,
          resourceType: AuditResourceType.SITUATION,
          resourceId: situationId,
          metadata: {
            evidenceId,
            type: evidence.type,
            hadFile: evidence.fileName !== null,
            uploadedByUserId: evidence.uploadedByUserId,
            createdAt: evidence.createdAt,
            reasonLength: reason.length,
          },
        },
        manager,
      );
    });

    const retired = await this.evidenceRepository.findByIdAndSituationId(
      evidenceId,
      situationId,
    );
    if (!retired) {
      throw new NotFoundException(`Evidencia no encontrada: ${evidenceId}`);
    }
    return this.toResponse(retired);
  }

  /** Situación con bloqueo compartido; 404 si no existe. */
  private async lockSituation(
    manager: EntityManager,
    situationId: string,
  ): Promise<Situation> {
    const situation = await manager.findOne(Situation, {
      where: { id: situationId },
      loadEagerRelations: false,
      lock: { mode: 'pessimistic_read' },
    });
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
    return situation;
  }

  private resolveFileFields(
    situationId: string,
    dto: CreateSituationEvidenceDto,
  ): {
    fileName: string | null;
    storagePath: string | null;
    mimeType: string | null;
    fileSize: string | null;
  } {
    if (dto.type === EvidenceType.NOTE) {
      return {
        fileName: null,
        storagePath: null,
        mimeType: null,
        fileSize: null,
      };
    }

    const fileName = dto.fileName!.trim();
    const descriptor = this.storageService.resolveStorageDescriptor(
      situationId,
      fileName,
      dto.storagePath?.trim(),
    );

    return {
      fileName: descriptor.fileName,
      storagePath: descriptor.storagePath,
      mimeType: dto.mimeType!.trim(),
      fileSize: String(dto.fileSize!),
    };
  }

  private findByClientKey(
    situationId: string,
    clientKey: string,
  ): Promise<SituationEvidence | null> {
    return this.evidenceRepository.findOne({
      where: { situationId, clientKey },
    });
  }

  private toResponse(
    evidence: SituationEvidence,
  ): SituationEvidenceResponseDto {
    return {
      id: evidence.id,
      situationId: evidence.situationId,
      uploadedByUserId: evidence.uploadedByUserId,
      uploadedByUserName: evidence.uploadedByUser.fullName,
      type: evidence.type,
      title: evidence.title,
      description: evidence.description,
      fileName: evidence.fileName,
      storagePath: evidence.storagePath,
      mimeType: evidence.mimeType,
      fileSize: evidence.fileSize !== null ? Number(evidence.fileSize) : null,
      createdAt: evidence.createdAt,
      status: evidence.retiredAt ? 'RETIRED' : 'ACTIVE',
      retirement:
        evidence.retiredAt && evidence.retiredByUserId
          ? {
              retiredAt: evidence.retiredAt,
              retiredByUserId: evidence.retiredByUserId,
              reason: evidence.retirementReason ?? '',
            }
          : null,
    };
  }
}
