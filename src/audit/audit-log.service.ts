import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { RequestContextService } from '../common/request-context/request-context.service';
import { AuditAction } from './audit-action.enum';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditInput {
  actor?: Pick<AuthPayload, 'sub' | 'roleCode'> | null;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * AUDITORÍA OBLIGATORIA de una acción crítica (Fase 01B.1). Se escribe con
   * el `manager` de la MISMA transacción que la acción y NO traga errores: si
   * el registro no se puede persistir, la transacción entera se revierte y la
   * acción no se confirma. Úsese para crear, avanzar, cerrar, anular y
   * trasladar situaciones, evidencias, usuarios y análisis IA completados.
   *
   * Nunca guardar aquí contenidos completos (expedientes, prompts, textos de
   * aprendizaje o motivos): solo identificadores, estados, valores anteriores
   * y nuevos, y longitudes.
   */
  async recordCritical(
    input: RecordAuditInput,
    manager: EntityManager,
  ): Promise<AuditLog> {
    const entry = manager.create(AuditLog, this.toEntry(input));
    return manager.save(AuditLog, entry);
  }

  /**
   * Registro OBSERVACIONAL (mejor esfuerzo): si falla, se registra en el log y
   * la operación sigue. Solo para eventos no críticos (fallos de IA, acciones
   * del sistema, compatibilidad).
   */
  async record(input: RecordAuditInput): Promise<AuditLog | null> {
    try {
      const entry = this.auditLogsRepository.create(this.toEntry(input));

      return await this.auditLogsRepository.save(entry);
    } catch (error) {
      this.logger.error(
        `No fue posible persistir audit log action=${input.action} resource=${input.resourceType}:${input.resourceId ?? 'n/a'}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private toEntry(input: RecordAuditInput): Partial<AuditLog> {
    return {
      actorUserId: input.actor?.sub ?? null,
      actorRole: input.actor?.roleCode ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: this.requestContext.getRequestId(),
      metadata: input.metadata ?? null,
    };
  }
}
