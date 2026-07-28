import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationRecommendation } from '../entities/situation-recommendation.entity';

@Injectable()
export class SituationRecommendationsRepository extends Repository<SituationRecommendation> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationRecommendation, dataSource.createEntityManager());
  }

  findBySituationId(situationId: string): Promise<SituationRecommendation[]> {
    return this.find({
      where: { situationId },
      relations: { assignedUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByIdWithRelations(id: string): Promise<SituationRecommendation | null> {
    return this.findOne({
      where: { id },
      relations: { assignedUser: true },
    });
  }
}
