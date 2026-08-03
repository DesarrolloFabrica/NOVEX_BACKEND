import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SituationsModule } from '../situations/situations.module';
import { Situation } from '../situations/entities/situation.entity';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { SituationEvidence } from './entities/situation-evidence.entity';
import { SituationEvidenceRepository } from './repositories/situation-evidence.repository';
import { SituationEvidenceController } from './situation-evidence.controller';
import { SituationEvidenceService } from './situation-evidence.service';
import { EvidenceStorageService } from './storage/evidence-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SituationEvidence, Situation]),
    AuthModule,
    SituationsModule,
    SituationTimelineModule,
  ],
  controllers: [SituationEvidenceController],
  providers: [
    SituationEvidenceService,
    SituationEvidenceRepository,
    EvidenceStorageService,
  ],
  exports: [SituationEvidenceService, SituationEvidenceRepository],
})
export class SituationEvidenceModule {}
