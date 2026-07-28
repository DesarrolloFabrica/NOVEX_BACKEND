import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Situation } from '../situations/entities/situation.entity';
import {
  AffectedCoordinationResponseDto,
  SaveImpactAssessmentInput,
  SituationAffectedCoordinationsResponseDto,
  SituationImpactAssessmentResponseDto,
} from './dto/situation-impact.dto';
import { SituationAffectedCoordination } from './entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from './entities/situation-impact-assessment.entity';
import { SituationImpactRepository } from './repositories/situation-impact.repository';

@Injectable()
export class SituationImpactService {
  constructor(
    private readonly impactRepository: SituationImpactRepository,
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    @InjectRepository(SituationAffectedCoordination)
    private readonly affectedCoordinationsRepository: Repository<SituationAffectedCoordination>,
  ) {}

  async findBySituation(
    situationId: string,
  ): Promise<SituationImpactAssessmentResponseDto> {
    await this.ensureSituationExists(situationId);

    const assessment = await this.impactRepository.findBySituationId(situationId);
    if (!assessment) {
      throw new NotFoundException(
        `Evaluación de impacto no encontrada para la situación: ${situationId}`,
      );
    }

    return this.toAssessmentResponse(assessment);
  }

  async getAffectedCoordinationsBySituation(
    situationId: string,
  ): Promise<SituationAffectedCoordinationsResponseDto> {
    await this.ensureSituationExists(situationId);

    const assessment = await this.impactRepository.findBySituationId(situationId);
    if (!assessment) {
      return {
        situationId,
        impactAssessmentId: null,
        items: [],
        total: 0,
      };
    }

    const items = assessment.affectedCoordinations.map((item) =>
      this.toAffectedCoordinationResponse(item),
    );

    return {
      situationId,
      impactAssessmentId: assessment.id,
      items,
      total: items.length,
    };
  }

  async saveAssessment(
    input: SaveImpactAssessmentInput,
  ): Promise<SituationImpactAssessmentResponseDto> {
    await this.ensureSituationExists(input.situationId);

    const existing = await this.impactRepository.findBySituationId(input.situationId);
    if (existing) {
      throw new ConflictException(
        `Ya existe una evaluación de impacto para la situación: ${input.situationId}`,
      );
    }

    const assessment = this.impactRepository.create({
      situationId: input.situationId,
      operationalSeverity: input.operationalSeverity,
      confidence: String(input.confidence),
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      summary: input.summary.trim(),
      reasoning: input.reasoning.trim(),
      affectedCoordinations: input.affectedCoordinations.map((item) =>
        this.affectedCoordinationsRepository.create({
          coordinationId: item.coordinationId,
          impactLevel: item.impactLevel,
          description: item.description.trim(),
        }),
      ),
    });

    const saved = await this.impactRepository.save(assessment);
    const withRelations = await this.impactRepository.findBySituationId(
      saved.situationId,
    );

    return this.toAssessmentResponse(withRelations ?? saved);
  }

  async replaceAssessment(
    input: SaveImpactAssessmentInput,
  ): Promise<SituationImpactAssessmentResponseDto> {
    await this.ensureSituationExists(input.situationId);

    const existing = await this.impactRepository.findBySituationId(input.situationId);
    if (!existing) {
      throw new NotFoundException(
        `Evaluación de impacto no encontrada para la situación: ${input.situationId}`,
      );
    }

    await this.affectedCoordinationsRepository.delete({
      impactAssessmentId: existing.id,
    });

    existing.operationalSeverity = input.operationalSeverity;
    existing.confidence = String(input.confidence);
    existing.estimatedDurationMinutes = input.estimatedDurationMinutes;
    existing.summary = input.summary.trim();
    existing.reasoning = input.reasoning.trim();
    existing.affectedCoordinations = input.affectedCoordinations.map((item) =>
      this.affectedCoordinationsRepository.create({
        impactAssessmentId: existing.id,
        coordinationId: item.coordinationId,
        impactLevel: item.impactLevel,
        description: item.description.trim(),
      }),
    );

    await this.impactRepository.save(existing);
    const withRelations = await this.impactRepository.findBySituationId(
      input.situationId,
    );

    return this.toAssessmentResponse(withRelations ?? existing);
  }

  private async ensureSituationExists(situationId: string): Promise<void> {
    const exists = await this.situationsRepository.exist({
      where: { id: situationId },
    });
    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }

  private toAssessmentResponse(
    assessment: SituationImpactAssessment,
  ): SituationImpactAssessmentResponseDto {
    return {
      id: assessment.id,
      situationId: assessment.situationId,
      operationalSeverity: assessment.operationalSeverity,
      confidence: Number(assessment.confidence),
      estimatedDurationMinutes: assessment.estimatedDurationMinutes,
      summary: assessment.summary,
      reasoning: assessment.reasoning,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
    };
  }

  private toAffectedCoordinationResponse(
    item: SituationAffectedCoordination,
  ): AffectedCoordinationResponseDto {
    return {
      id: item.id,
      coordinationId: item.coordinationId,
      coordinationCode: item.coordination.code,
      coordinationName: item.coordination.name,
      impactLevel: item.impactLevel,
      description: item.description,
    };
  }
}
