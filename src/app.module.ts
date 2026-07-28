import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { typeOrmAsyncConfig } from './configuration/database.config';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseSeedsModule } from './database/seeds/database-seeds.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { OperationalAreasModule } from './operational-areas/operational-areas.module';
import { OperationalEventsModule } from './operational-events/operational-events.module';
import { RecommendedActionsModule } from './recommended-actions/recommended-actions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigurationModule,
    CommonModule,
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    OperationalAreasModule,
    OperationalEventsModule,
    IntelligenceModule,
    RecommendedActionsModule,
    DashboardModule,
    UsersModule,
    DatabaseSeedsModule,
  ],
})
export class AppModule {}
