import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationTimelineEntry } from '../entities/situation-timeline-entry.entity';

@Injectable()
export class SituationTimelineRepository extends Repository<SituationTimelineEntry> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationTimelineEntry, dataSource.createEntityManager());
  }

  findBySituationId(situationId: string): Promise<SituationTimelineEntry[]> {
    return this.find({
      where: { situationId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }
}
