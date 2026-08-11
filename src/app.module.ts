import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AIAnalysisSessionsModule } from './ai-analysis-sessions/ai-analysis-sessions.module';

import { AIOrchestrationModule } from './ai-orchestration/ai-orchestration.module';

import { AIPromptEngineModule } from './ai-prompt-engine/ai-prompt-engine.module';

import { AIAnalysisModule } from './ai-analysis/ai-analysis.module';

import { AuthModule } from './auth/auth.module';
import { AuthorizationEnrichmentGuard } from './auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { THROTTLE_LIMITS } from './configuration/throttle.constants';

import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';

import { ConfigurationModule } from './configuration/configuration.module';

import { typeOrmAsyncConfig } from './configuration/database.config';

import { CoordinationsModule } from './coordinations/coordinations.module';

import { DashboardModule } from './dashboard/dashboard.module';

import { DatabaseSeedsModule } from './database/seeds/database-seeds.module';

import { IntelligenceModule } from './intelligence/intelligence.module';

import { OperationalAreasModule } from './operational-areas/operational-areas.module';

import { OperationalEventsModule } from './operational-events/operational-events.module';

import { PermissionsModule } from './permissions/permissions.module';

import { RbacModule } from './rbac/rbac.module';

import { RecommendedActionsModule } from './recommended-actions/recommended-actions.module';

import { RolesModule } from './roles/roles.module';

import { SituationRecommendationsModule } from './situation-recommendations/situation-recommendations.module';

import { SituationImpactModule } from './situation-impact/situation-impact.module';

import { SituationEvidenceModule } from './situation-evidence/situation-evidence.module';

import { SituationTimelineModule } from './situation-timeline/situation-timeline.module';

import { SituationsModule } from './situations/situations.module';

import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigurationModule,

    ThrottlerModule.forRoot([
      THROTTLE_LIMITS.default,
      THROTTLE_LIMITS.auth,
      THROTTLE_LIMITS.gemini,
    ]),

    CommonModule,

    AuditModule,

    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),

    OperationalAreasModule,

    CoordinationsModule,

    SituationsModule,

    SituationTimelineModule,

    SituationEvidenceModule,

    SituationImpactModule,

    SituationRecommendationsModule,

    AIAnalysisModule,

    AIPromptEngineModule,

    AIOrchestrationModule,

    AIAnalysisSessionsModule,

    OperationalEventsModule,

    IntelligenceModule,

    RecommendedActionsModule,

    DashboardModule,

    AuthModule,

    RolesModule,

    PermissionsModule,

    RbacModule,

    UsersModule,

    DatabaseSeedsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AuthorizationEnrichmentGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
