import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationAnalysisSession } from '../entities/situation-analysis-session.entity';

@Injectable()
export class SituationAnalysisSessionRepository extends Repository<SituationAnalysisSession> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationAnalysisSession, dataSource.createEntityManager());
  }

  findBySituationId(situationId: string): Promise<SituationAnalysisSession[]> {
    return this.find({
      where: { situationId },
      order: { version: 'ASC' },
    });
  }

  findBySituationIdAndVersion(
    situationId: string,
    version: number,
  ): Promise<SituationAnalysisSession | null> {
    return this.findOne({ where: { situationId, version } });
  }

  findLatestBySituationId(
    situationId: string,
  ): Promise<SituationAnalysisSession | null> {
    return this.findOne({
      where: { situationId },
      order: { version: 'DESC' },
    });
  }

  async getNextVersion(situationId: string): Promise<number> {
    const latest = await this.findLatestBySituationId(situationId);
    return (latest?.version ?? 0) + 1;
  }
}
