import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { Situation } from './entities/situation.entity';
import { computeSlaHealth, getWarningLeadMs } from './situation-sla.policy';

const ACTIVE_STATUSES = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
  SituationStatus.RESOLVED,
];

/** Evita spam de avisos: mínimo 12 h entre reminders de la misma situación. */
const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class SituationSlaScheduler {
  private readonly logger = new Logger(SituationSlaScheduler.name);
  private running = false;

  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    private readonly timelineService: SituationTimelineService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async processSlaSignals(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const breached = await this.markBreaches(now);
      const warned = await this.emitWarnings(now);
      if (breached > 0 || warned > 0) {
        this.logger.log(`SLA sweep: ${breached} breached, ${warned} warnings`);
      }
    } catch (error) {
      this.logger.error(
        'SLA sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async markBreaches(now: Date): Promise<number> {
    const overdue = await this.situationsRepository.find({
      where: {
        status: In(ACTIVE_STATUSES),
        dueAt: LessThan(now),
        slaBreachedAt: IsNull(),
      },
      take: 200,
    });

    let count = 0;
    for (const situation of overdue) {
      if (!situation.dueAt) continue;
      situation.slaBreachedAt = situation.dueAt;
      await this.situationsRepository.save(situation);
      await this.timelineService.createEntry({
        situationId: situation.id,
        userId: null,
        eventType: TimelineEventType.SLA_BREACHED,
        title: 'Plazo operativo vencido',
        description:
          'La situación superó su fecha límite de resolución. Se requiere actualización de estado o cierre documentado.',
        metadata: {
          dueAt: situation.dueAt.toISOString(),
          severity: situation.severity,
          status: situation.status,
          slaHealth: 'overdue',
        },
      });
      count += 1;
    }
    return count;
  }

  private async emitWarnings(now: Date): Promise<number> {
    const candidates = await this.situationsRepository.find({
      where: {
        status: In(ACTIVE_STATUSES),
        dueAt: Not(IsNull()),
        slaBreachedAt: IsNull(),
      },
      take: 300,
    });

    let count = 0;
    for (const situation of candidates) {
      if (!situation.dueAt) continue;

      const health = computeSlaHealth(
        situation.dueAt,
        situation.status,
        now,
        situation.severity,
      );
      if (health !== 'at_risk') continue;

      const warningStart = new Date(
        situation.dueAt.getTime() - getWarningLeadMs(situation.severity),
      );
      if (now < warningStart || now > situation.dueAt) continue;

      if (
        situation.lastSlaReminderAt &&
        now.getTime() - situation.lastSlaReminderAt.getTime() <
          REMINDER_COOLDOWN_MS
      ) {
        continue;
      }

      situation.lastSlaReminderAt = now;
      await this.situationsRepository.save(situation);
      await this.timelineService.createEntry({
        situationId: situation.id,
        userId: null,
        eventType: TimelineEventType.SLA_WARNING,
        title: 'Plazo próximo a vencer',
        description:
          'El plazo operativo de esta situación está por vencer. Se recomienda avanzar el estado o documentar el cierre.',
        metadata: {
          dueAt: situation.dueAt.toISOString(),
          severity: situation.severity,
          status: situation.status,
          slaHealth: 'at_risk',
        },
      });
      count += 1;
    }
    return count;
  }
}
