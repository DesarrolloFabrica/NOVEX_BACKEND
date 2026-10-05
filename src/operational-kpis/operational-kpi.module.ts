import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CoordinationsModule } from '../coordinations/coordinations.module';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { SituationAffectedCoordination } from '../situation-impact/entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from '../situation-impact/entities/situation-impact-assessment.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { Situation } from '../situations/entities/situation.entity';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiController } from './operational-kpi.controller';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiPeriodRepository } from './operational-kpi-period.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import { OperationalKpiService } from './operational-kpi.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Situation,
      Coordination,
      SituationImpactAssessment,
      SituationAffectedCoordination,
      IncidentCategory,
    ]),
    AuthModule,
    CoordinationsModule,
  ],
  controllers: [OperationalKpiController],
  providers: [
    OperationalKpiService,
    OperationalOverviewRepository,
    OperationalKpiHistoryRepository,
    OperationalKpiBreakdownRepository,
    OperationalKpiPeriodRepository,
    OperationalKpiRelationsRepository,
  ],
  exports: [OperationalKpiService],
})
export class OperationalKpiModule {}
