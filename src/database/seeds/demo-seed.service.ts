import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  logLifecycleFinish,
  logLifecycleStart,
} from '../../common/bootstrap-observability';

/**
 * Semillas de demostración deshabilitadas permanentemente.
 * No insertar situaciones, interpretaciones IA, acciones ni timeline automáticamente.
 */
@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  onApplicationBootstrap(): void {
    logLifecycleStart('DemoSeedService');
    if (!this.isEnabled()) {
      logLifecycleFinish('DemoSeedService', 'skipped: demo seed disabled');
      return;
    }

    this.logger.warn(
      'DEMO_SEED_ENABLED=true detectado, pero DemoSeedService permanece deshabilitado en el producto.',
    );
    logLifecycleFinish('DemoSeedService', 'no-op');
  }

  private isEnabled(): boolean {
    return process.env.DEMO_SEED_ENABLED === 'true';
  }
}
