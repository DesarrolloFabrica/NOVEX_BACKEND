import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationAIAnalysisRecord } from '../entities/situation-ai-analysis-record.entity';

@Injectable()
export class SituationAIAnalysisRecordRepository extends Repository<SituationAIAnalysisRecord> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationAIAnalysisRecord, dataSource.createEntityManager());
  }

  findBySituationId(
    situationId: string,
  ): Promise<SituationAIAnalysisRecord | null> {
    return this.findOne({ where: { situationId } });
  }
}
