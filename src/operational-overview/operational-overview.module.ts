import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CoordinationsModule } from '../coordinations/coordinations.module';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { SituationAffectedCoordination } from '../situation-impact/entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from '../situation-impact/entities/situation-impact-assessment.entity';
import { Situation } from '../situations/entities/situation.entity';
import { OperationalOverviewController } from './operational-overview.controller';
import { OperationalOverviewService } from './operational-overview.service';
import { OperationalOverviewRepository } from './repositories/operational-overview.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Situation,
      Coordination,
      SituationImpactAssessment,
      SituationAffectedCoordination,
    ]),
    AuthModule,
    CoordinationsModule,
  ],
  controllers: [OperationalOverviewController],
  providers: [OperationalOverviewService, OperationalOverviewRepository],
  exports: [OperationalOverviewService],
})
export class OperationalOverviewModule {}
