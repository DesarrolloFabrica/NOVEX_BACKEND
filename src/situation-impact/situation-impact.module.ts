import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SituationsModule } from '../situations/situations.module';
import { Situation } from '../situations/entities/situation.entity';
import { SituationAffectedCoordination } from './entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from './entities/situation-impact-assessment.entity';
import { SituationImpactRepository } from './repositories/situation-impact.repository';
import { SituationImpactController } from './situation-impact.controller';
import { SituationImpactService } from './situation-impact.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SituationImpactAssessment,
      SituationAffectedCoordination,
      Situation,
    ]),
    AuthModule,
    SituationsModule,
  ],
  controllers: [SituationImpactController],
  providers: [SituationImpactService, SituationImpactRepository],
  exports: [SituationImpactService, SituationImpactRepository],
})
export class SituationImpactModule {}
