import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ImpactLevel } from '../common/enums/situation-impact.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { Situation } from '../situations/entities/situation.entity';
import {
  AffectedCoordinationResponseDto,
  ImpactCoordinationCandidateDto,
  SaveImpactAssessmentInput,
  SituationAffectedCoordinationsResponseDto,
  SituationImpactAssessmentResponseDto,
  SituationImpactContextResponseDto,
  SituationImpactSimulationResponseDto,
} from './dto/situation-impact.dto';
import { SituationAffectedCoordination } from './entities/situation-affected-coordination.entity';
import { SituationImpactAssessment } from './entities/situation-impact-assessment.entity';
import { SituationImpactRepository } from './repositories/situation-impact.repository';

const IMPACT_LEVEL_RANK: Record<ImpactLevel, number> = {
  [ImpactLevel.CRITICAL]: 4,
  [ImpactLevel.HIGH]: 3,
  [ImpactLevel.MEDIUM]: 2,
  [ImpactLevel.LOW]: 1,
};

const MAX_SIMULATED_COORDINATIONS = 2;
const DEFAULT_SIMULATION_HORIZON_MINUTES = 30;

@Injectable()
export class SituationImpactService {
  constructor(
    private readonly impactRepository: SituationImpactRepository,
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    @InjectRepository(SituationAffectedCoordination)
    private readonly affectedCoordinationsRepository: Repository<SituationAffectedCoordination>,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

  async findBySituation(
    situationId: string,
  ): Promise<SituationImpactAssessmentResponseDto> {
    await this.ensureSituationExists(situationId);

    const assessment =
      await this.impactRepository.findBySituationId(situationId);
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

    const assessment =
      await this.impactRepository.findBySituationId(situationId);
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

  async getImpactContext(
    situationId: string,
  ): Promise<SituationImpactContextResponseDto> {
    const situation = await this.getSituationWithRelations(situationId);
    const declaredRelated = await this.resolveDeclaredRelated(situation);
    const assessment =
      await this.impactRepository.findBySituationId(situationId);
    const hasDeclaredRelated = declaredRelated.length > 0;
    const simulationAvailable =
      !hasDeclaredRelated &&
      this.selectSimulatedCandidates(
        assessment?.affectedCoordinations ?? [],
        situation.coordinationId,
      ).length > 0;

    return {
      situationId,
      originCoordinationId: situation.coordinationId,
      originCoordinationCode: situation.coordination?.code ?? null,
      hasDeclaredRelated,
      canSimulate: !hasDeclaredRelated,
      simulationAvailable,
      declaredRelated,
      message: hasDeclaredRelated
        ? 'Se muestran las coordinaciones declaradas por el usuario.'
        : simulationAvailable
          ? 'Puede simular el impacto potencial con base en el análisis IA.'
          : assessment
            ? 'El análisis IA no identificó otras coordinaciones válidas para simular.'
            : 'Aún no hay análisis de impacto disponible para simular.',
    };
  }

  async simulateImpact(
    situationId: string,
    horizonMinutes = DEFAULT_SIMULATION_HORIZON_MINUTES,
  ): Promise<SituationImpactSimulationResponseDto> {
    if (
      !Number.isFinite(horizonMinutes) ||
      horizonMinutes < 1 ||
      horizonMinutes > 24 * 60
    ) {
      throw new BadRequestException(
        'El horizonte de simulación debe estar entre 1 y 1440 minutos.',
      );
    }

    const situation = await this.getSituationWithRelations(situationId);
    const declaredRelated = await this.resolveDeclaredRelated(situation);
    const hasDeclaredRelated = declaredRelated.length > 0;

    if (hasDeclaredRelated) {
      return {
        situationId,
        generatedAt: new Date().toISOString(),
        horizonMinutes,
        source: 'none',
        canSimulate: false,
        hasDeclaredRelated: true,
        potentialCoordinations: [],
        message:
          'La simulación no está disponible porque el usuario ya declaró coordinaciones relacionadas.',
      };
    }

    const assessment =
      await this.impactRepository.findBySituationId(situationId);
    if (!assessment) {
      return {
        situationId,
        generatedAt: new Date().toISOString(),
        horizonMinutes,
        source: 'none',
        canSimulate: true,
        hasDeclaredRelated: false,
        potentialCoordinations: [],
        message:
          'Aún no hay análisis de impacto disponible. Ejecute el análisis IA antes de simular.',
      };
    }

    const potentialCoordinations = this.selectSimulatedCandidates(
      assessment.affectedCoordinations,
      situation.coordinationId,
    ).slice(0, MAX_SIMULATED_COORDINATIONS);

    return {
      situationId,
      generatedAt: new Date().toISOString(),
      horizonMinutes,
      source: potentialCoordinations.length > 0 ? 'ai_assessment' : 'none',
      canSimulate: true,
      hasDeclaredRelated: false,
      potentialCoordinations,
      message:
        potentialCoordinations.length > 0
          ? `Simulación basada en el análisis IA (máximo ${MAX_SIMULATED_COORDINATIONS} islas).`
          : 'El análisis IA no identificó otras coordinaciones válidas para simular.',
    };
  }

  async saveAssessment(
    input: SaveImpactAssessmentInput,
  ): Promise<SituationImpactAssessmentResponseDto> {
    await this.ensureSituationExists(input.situationId);

    const existing = await this.impactRepository.findBySituationId(
      input.situationId,
    );
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

    const existing = await this.impactRepository.findBySituationId(
      input.situationId,
    );
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

  private async getSituationWithRelations(
    situationId: string,
  ): Promise<Situation> {
    const situation = await this.situationsRepository.findOne({
      where: { id: situationId },
      relations: {
        coordination: true,
        relatedCoordinations: {
          coordination: true,
        },
      },
    });
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
    return situation;
  }

  private async resolveDeclaredRelated(
    situation: Situation,
  ): Promise<ImpactCoordinationCandidateDto[]> {
    const structured = [...(situation.relatedCoordinations ?? [])]
      .filter((item) => item.coordinationId !== situation.coordinationId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    if (structured.length > 0) {
      return structured.map((item) => ({
        coordinationId: item.coordinationId,
        coordinationCode: item.coordination.code,
        coordinationName: item.coordination.name,
        coordinationShortName: item.coordination.shortName,
        impactLevel: null,
        description: null,
        source: 'declared' as const,
      }));
    }

    return this.resolveLegacyDeclaredRelated(situation);
  }

  private async resolveLegacyDeclaredRelated(
    situation: Situation,
  ): Promise<ImpactCoordinationCandidateDto[]> {
    const perceptionMatch =
      situation.description.match(
        /Coordinaciones relacionadas \(percepción inicial\): (.+)/i,
      ) ??
      situation.description.match(
        /Áreas relacionadas \(percepción inicial\): (.+)/i,
      );

    if (!perceptionMatch?.[1]) {
      return [];
    }

    const codes = perceptionMatch[1]
      .split(',')
      .map((label) => label.trim().split('·')[0]?.trim())
      .filter((code): code is string => Boolean(code))
      .filter((code) => code !== situation.coordination?.code);

    const uniqueCodes = [...new Set(codes)];
    if (uniqueCodes.length === 0) {
      return [];
    }

    const found = await this.coordinationsRepository.find({
      where: { code: In(uniqueCodes) },
    });
    const byCode = new Map(found.map((item) => [item.code, item]));

    return uniqueCodes
      .map((code) => byCode.get(code))
      .filter((item): item is Coordination => Boolean(item))
      .filter((item) => item.id !== situation.coordinationId)
      .map((item) => ({
        coordinationId: item.id,
        coordinationCode: item.code,
        coordinationName: item.name,
        coordinationShortName: item.shortName,
        impactLevel: null,
        description: null,
        source: 'declared' as const,
      }));
  }

  private selectSimulatedCandidates(
    affected: SituationAffectedCoordination[],
    originCoordinationId: string | null,
  ): ImpactCoordinationCandidateDto[] {
    const seen = new Set<string>();

    return [...affected]
      .filter((item) => item.coordinationId !== originCoordinationId)
      .filter((item) => Boolean(item.coordination))
      .sort((a, b) => {
        const rankDiff =
          IMPACT_LEVEL_RANK[b.impactLevel] - IMPACT_LEVEL_RANK[a.impactLevel];
        if (rankDiff !== 0) return rankDiff;
        return a.coordination.code.localeCompare(b.coordination.code);
      })
      .filter((item) => {
        if (seen.has(item.coordinationId)) return false;
        seen.add(item.coordinationId);
        return true;
      })
      .map((item) => ({
        coordinationId: item.coordinationId,
        coordinationCode: item.coordination.code,
        coordinationName: item.coordination.name,
        coordinationShortName: item.coordination.shortName,
        impactLevel: item.impactLevel,
        description: item.description,
        source: 'simulated' as const,
      }));
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
