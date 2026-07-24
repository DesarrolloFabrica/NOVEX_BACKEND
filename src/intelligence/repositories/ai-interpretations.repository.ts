import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AIInterpretation } from '../entities/ai-interpretation.entity';

@Injectable()
export class AIInterpretationsRepository extends Repository<AIInterpretation> {
  constructor(private readonly dataSource: DataSource) {
    super(AIInterpretation, dataSource.createEntityManager());
  }

  findByEventId(eventId: string): Promise<AIInterpretation[]> {
    return this.find({
      where: { eventId },
      relations: {
        category: true,
        affectedAreas: true,
        suggestedIndicators: true,
      },
      order: { interpretedAt: 'DESC' },
    });
  }

  findCurrentForEvent(
    eventId: string,
    interpretationId: string,
  ): Promise<AIInterpretation | null> {
    return this.findOne({
      where: { id: interpretationId, eventId },
      relations: {
        category: true,
        affectedAreas: true,
        suggestedIndicators: true,
      },
    });
  }
}
