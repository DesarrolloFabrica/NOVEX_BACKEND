import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationImpactAssessment } from '../entities/situation-impact-assessment.entity';

@Injectable()
export class SituationImpactRepository extends Repository<SituationImpactAssessment> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationImpactAssessment, dataSource.createEntityManager());
  }

  findBySituationId(
    situationId: string,
  ): Promise<SituationImpactAssessment | null> {
    return this.findOne({
      where: { situationId },
      relations: {
        affectedCoordinations: {
          coordination: true,
        },
      },
    });
  }
}
