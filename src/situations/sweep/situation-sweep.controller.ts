import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { SchedulerOidcGuard } from './scheduler-oidc.guard';
import { SituationSweepService } from './situation-sweep.service';

/**
 * Trabajos internos disparados por Cloud Scheduler.
 *
 * `@Public` solo apaga los guards de SESIÓN de usuario (JWT y enriquecimiento
 * de permisos): la ruta queda protegida exclusivamente por `SchedulerOidcGuard`.
 * No hay forma de invocarla con el JWT de un usuario de NOVEX.
 *
 * Despliegue previsto (no activado en esta fase):
 *   gcloud scheduler jobs create http novex-situation-sweep \
 *     --schedule="*\/15 * * * *" --http-method=POST \
 *     --uri="https://<backend>/api/v1/internal/jobs/situation-sweep" \
 *     --oidc-service-account-email="<cuenta>@<proyecto>.iam.gserviceaccount.com" \
 *     --oidc-token-audience="https://<backend>" \
 *     --attempt-deadline=120s --max-retry-attempts=1
 * con SCHEDULER_OIDC_AUDIENCE y SCHEDULER_OIDC_SERVICE_ACCOUNT_EMAIL iguales a
 * esos valores en el servicio.
 */
@Controller('internal/jobs')
@Public()
@SkipThrottle()
export class SituationSweepController {
  constructor(private readonly sweepService: SituationSweepService) {}

  @Post('situation-sweep')
  @HttpCode(200)
  @UseGuards(SchedulerOidcGuard)
  run() {
    return this.sweepService.run(new Date());
  }
}
