import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async record(input: RecordAuditInput): Promise<AuditLog | null> {
    try {
      const entry = this.auditLogsRepository.create({
        actorUserId: input.actor?.sub ?? null,
        actorRole: input.actor?.roleCode ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        requestId: this.requestContext.getRequestId(),
        metadata: input.metadata ?? null,
      });

      return await this.auditLogsRepository.save(entry);
    } catch (error) {
      this.logger.error(
        `No fue posible persistir audit log action=${input.action} resource=${input.resourceType}:${input.resourceId ?? 'n/a'}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
