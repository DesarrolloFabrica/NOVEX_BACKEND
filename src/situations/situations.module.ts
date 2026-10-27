import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { User } from '../users/entities/user.entity';
import { Situation } from './entities/situation.entity';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationResolution } from './entities/situation-resolution.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { SituationsRepository } from './repositories/situations.repository';
import {
  PRODUCTION_SEVERITY_ESCALATION_POLICIES,
  SEVERITY_ESCALATION_POLICIES,
} from './severity-escalation/severity-escalation.policy';
import { SeverityEscalationService } from './severity-escalation/severity-escalation.service';
import { SituationsController } from './situations.controller';
import { SituationAccessService } from './situation-access.service';
import { SituationConsequencesService } from './situation-consequences.service';
import { SituationSlaScheduler } from './situation-sla.scheduler';
import { SituationsService } from './situations.service';
import { GoogleIdTokenVerifier } from './sweep/google-id-token.verifier';
import { SchedulerOidcGuard } from './sweep/scheduler-oidc.guard';
import { SituationSweepController } from './sweep/situation-sweep.controller';
import { SituationSweepService } from './sweep/situation-sweep.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Situation,
      SituationRelatedCoordination,
      SituationResolution,
      SituationSeverityChange,
      SituationConsequence,
      Coordination,
      IncidentCategory,
      User,
    ]),
    AuthModule,
    forwardRef(() => SituationTimelineModule),
  ],
  controllers: [SituationsController, SituationSweepController],
  providers: [
    SituationsService,
    SituationsRepository,
    SituationAccessService,
    SituationConsequencesService,
    SeverityEscalationService,
    // Registro productivo VACÍO: ninguna política activa hasta la calibración.
    {
      provide: SEVERITY_ESCALATION_POLICIES,
      useValue: PRODUCTION_SEVERITY_ESCALATION_POLICIES,
    },
    SituationSweepService,
    SituationSlaScheduler,
    GoogleIdTokenVerifier,
    SchedulerOidcGuard,
  ],
  exports: [
    SituationsService,
    SituationsRepository,
    SituationAccessService,
    TypeOrmModule,
  ],
})
export class SituationsModule {}
