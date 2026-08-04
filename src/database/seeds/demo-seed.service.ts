import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

/**
 * Semillas de demostración deshabilitadas permanentemente.
 * No insertar situaciones, interpretaciones IA, acciones ni timeline automáticamente.
 */
@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  onApplicationBootstrap(): void {
    if (!this.isEnabled()) {
      return;
    }

    this.logger.warn(
      'DEMO_SEED_ENABLED=true detectado, pero DemoSeedService permanece deshabilitado en el producto.',
    );
  }

  private isEnabled(): boolean {
    return process.env.DEMO_SEED_ENABLED === 'true';
  }
}
