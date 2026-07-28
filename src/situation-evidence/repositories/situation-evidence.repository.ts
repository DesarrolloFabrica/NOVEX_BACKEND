import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SituationEvidence } from '../entities/situation-evidence.entity';

@Injectable()
export class SituationEvidenceRepository extends Repository<SituationEvidence> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationEvidence, dataSource.createEntityManager());
  }

  findBySituationId(situationId: string): Promise<SituationEvidence[]> {
    return this.find({
      where: { situationId },
      relations: { uploadedByUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByIdAndSituationId(
    id: string,
    situationId: string,
  ): Promise<SituationEvidence | null> {
    return this.findOne({
      where: { id, situationId },
      relations: { uploadedByUser: true },
    });
  }
}
