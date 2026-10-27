import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SituationSweepService } from './sweep/situation-sweep.service';

/**
 * RESPALDO EN PROCESO del barrido de situaciones.
 *
 * La fuente confiable en producción será Cloud Scheduler llamando a
 * `POST /internal/jobs/situation-sweep`: Cloud Run con `min-instances=0`
 * no garantiza que este cron llegue a ejecutarse, y con varias instancias
 * correría en paralelo. Se conserva detrás de `situationSweep.cronEnabled`
 * (env `SITUATION_SWEEP_CRON_ENABLED`, activo por defecto para no cambiar el
 * comportamiento de SLA de la versión anterior). El ESCALAMIENTO de severidad
 * solo corre con `SEVERITY_ESCALATION_ENABLED=true`, apagado por defecto;
 * antes compartía este interruptor. Coincidir con el disparador externo es
 * inocuo: el barrido toma un lock advisory y todas sus escrituras son
 * idempotentes.
 */
@Injectable()
export class SituationSlaScheduler {
  private readonly logger = new Logger(SituationSlaScheduler.name);
  private running = false;

  constructor(
    private readonly sweepService: SituationSweepService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async processSlaSignals(): Promise<void> {
    if (!this.isEnabled() || this.running) {
      return;
    }
    this.running = true;
    try {
      await this.sweepService.run(new Date(), {
        escalate: this.escalationEnabled(),
      });
    } catch (error) {
      this.logger.error(
        'Situation sweep (cron) failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /** El escalamiento tiene su propia bandera (apagada por defecto). */
  private escalationEnabled(): boolean {
    return (
      this.configService.get<boolean>('situationSweep.escalationEnabled') ===
      true
    );
  }

  private isEnabled(): boolean {
    return (
      this.configService.get<boolean>('situationSweep.cronEnabled') ?? true
    );
  }
}
