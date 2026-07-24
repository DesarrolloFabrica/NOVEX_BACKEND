import { Module } from '@nestjs/common';
import { OperationalEventsModule } from '../operational-events/operational-events.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [OperationalEventsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
