import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SituationEvidence } from '../entities/situation-evidence.entity';

@Injectable()
export class SituationEvidenceRepository extends Repository<SituationEvidence> {
  constructor(private readonly dataSource: DataSource) {
    super(SituationEvidence, dataSource.createEntityManager());
  }

  /**
   * Por defecto solo evidencias ACTIVAS (Fase 01B.2): las retiradas no se
   * presentan como activas ni llegan al contexto de Gemini, que usa este
   * mismo método. El historial completo exige `includeRetired`.
   */
  findBySituationId(
    situationId: string,
    options: { includeRetired?: boolean } = {},
  ): Promise<SituationEvidence[]> {
    return this.find({
      where: options.includeRetired
        ? { situationId }
        : { situationId, retiredAt: IsNull() },
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
