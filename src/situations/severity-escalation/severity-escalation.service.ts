import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditResourceType } from '../../audit/audit-action.enum';
import { AuditLogService } from '../../audit/audit-log.service';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import {
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../../common/enums/situation.enums';
import { SituationTimelineService } from '../../situation-timeline/situation-timeline.service';
import { SituationSeverityChange } from '../entities/situation-severity-change.entity';
import { Situation } from '../entities/situation.entity';
import {
  planDueEscalations,
  SEVERITY_ESCALATION_POLICIES,
  type SeverityEscalationPolicy,
} from './severity-escalation.policy';

/** Lo que se escribió, para auditarlo después del commit. */
export interface MaterializedEscalation {
  situationId: string;
  severityChangeId: string;
  fromSeverity: SituationSeverity;
  toSeverity: SituationSeverity;
  policyCode: string;
  ruleKey: string;
  effectiveAt: Date;
}

/**
 * Materializa los escalamientos AUTO_TIME que ya deberían regir.
 *
 * Una situación con `severity_escalation_policy_code` NULO es un no-op: hoy
 * son todas. El motor existe para que activar una política sea solo asignar
 * su código a los casos nuevos.
 *
 * Contrato de uso: se invoca DENTRO de una transacción que ya tiene la fila de
 * la situación bloqueada (`FOR UPDATE`), y recibe esa misma entidad. Por eso
 * actualiza también `situation.severity` en memoria: si el llamador la guarda
 * después con `save()`, no debe devolver la severidad anterior a la base.
 *
 * Escritura:
 *   - fila AUTO_TIME con `ON CONFLICT DO NOTHING` sobre el índice único
 *     (situation_id, policy_code, rule_key): dos barridos concurrentes no
 *     duplican;
 *   - `situations.severity` con un UPDATE sin listeners: el subscriber del
 *     timeline no emite un SEVERITY_CHANGED espurio, y `due_at` NO se toca;
 *   - evento SEVERITY_ESCALATED en el timeline, en la misma transacción.
 * La auditoría la registra el llamador tras el commit (`recordAudit`).
 */
@Injectable()
export class SeverityEscalationService {
  private readonly logger = new Logger(SeverityEscalationService.name);
  private readonly policies: ReadonlyMap<string, SeverityEscalationPolicy>;

  constructor(
    @Inject(SEVERITY_ESCALATION_POLICIES)
    policies: readonly SeverityEscalationPolicy[],
    private readonly timelineService: SituationTimelineService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.policies = new Map(policies.map((policy) => [policy.code, policy]));
  }

  async materializeDueEscalations(input: {
    manager: EntityManager;
    situation: Situation;
    now: Date;
  }): Promise<MaterializedEscalation[]> {
    const { manager, situation, now } = input;
    const policyCode = situation.severityEscalationPolicyCode;
    if (!policyCode) {
      return [];
    }

    const policy = this.policies.get(policyCode);
    if (!policy) {
      this.logger.warn(
        `Política de escalamiento desconocida "${policyCode}" en ${situation.id}: no se escala.`,
      );
      return [];
    }

    const existing = await manager.find(SituationSeverityChange, {
      where: {
        situationId: situation.id,
        source: SituationSeverityChangeSource.AUTO_TIME,
        policyCode,
      },
      select: { id: true, ruleKey: true },
    });

    const planned = planDueEscalations({
      policy,
      reportedSeverity: situation.reportedSeverity,
      createdAt: situation.createdAt,
      closedAt: situation.closedAt,
      now,
      existingRuleKeys: new Set(
        existing
          .map((row) => row.ruleKey)
          .filter((key): key is string => !!key),
      ),
    });

    const written: MaterializedEscalation[] = [];
    for (const step of planned) {
      const insert = await manager
        .createQueryBuilder()
        .insert()
        .into(SituationSeverityChange)
        .values({
          situationId: situation.id,
          previousSeverity: step.fromSeverity,
          newSeverity: step.toSeverity,
          source: SituationSeverityChangeSource.AUTO_TIME,
          effectiveAt: step.effectiveAt,
          actorUserId: null,
          policyCode,
          ruleKey: step.ruleKey,
        })
        .orIgnore()
        .returning(['id'])
        .execute();

      const severityChangeId = (insert.raw as Array<{ id: string }>)[0]?.id;
      if (!severityChangeId) {
        // Otro barrido lo registró primero: idempotente, nada que hacer.
        continue;
      }

      await manager
        .createQueryBuilder()
        .update(Situation)
        .set({ severity: step.toSeverity })
        .where('id = :id', { id: situation.id })
        .callListeners(false)
        .execute();
      situation.severity = step.toSeverity;

      await this.timelineService.createEntry(
        {
          situationId: situation.id,
          userId: null,
          eventType: TimelineEventType.SEVERITY_ESCALATED,
          title: 'Severidad escalada',
          description: `La severidad subió de ${step.fromSeverity} a ${step.toSeverity} por permanencia sin resolver.`,
          metadata: {
            severityChangeId,
            previousValue: step.fromSeverity,
            newValue: step.toSeverity,
            source: SituationSeverityChangeSource.AUTO_TIME,
            policyCode,
            ruleKey: step.ruleKey,
            effectiveAt: step.effectiveAt.toISOString(),
          },
        },
        manager,
      );

      written.push({
        situationId: situation.id,
        severityChangeId,
        fromSeverity: step.fromSeverity,
        toSeverity: step.toSeverity,
        policyCode,
        ruleKey: step.ruleKey,
        effectiveAt: step.effectiveAt,
      });
    }

    return written;
  }

  /** Auditoría best-effort, siempre DESPUÉS del commit. Actor nulo: sistema. */
  async recordAudit(
    escalations: readonly MaterializedEscalation[],
  ): Promise<void> {
    for (const item of escalations) {
      await this.auditLogService.record({
        actor: null,
        action: AuditAction.SITUATION_SEVERITY_ESCALATED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: item.situationId,
        metadata: {
          severityChangeId: item.severityChangeId,
          previousSeverity: item.fromSeverity,
          newSeverity: item.toSeverity,
          source: SituationSeverityChangeSource.AUTO_TIME,
          policyCode: item.policyCode,
          ruleKey: item.ruleKey,
          effectiveAt: item.effectiveAt.toISOString(),
        },
      });
    }
  }
}
