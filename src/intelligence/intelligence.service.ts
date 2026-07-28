import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  IndicatorDirection,
  IndicatorSource,
  RiskLevel,
  TimelineEntryType,
} from '../common/enums/operational.enums';
import { OperationalAreasRepository } from '../operational-areas/repositories/operational-areas.repository';
import { OperationalEventsRepository } from '../operational-events/repositories/operational-events.repository';
import { OperationalTimelineEntry } from '../operational-events/entities/operational-timeline-entry.entity';
import { RecommendedActionsService } from '../recommended-actions/recommended-actions.service';
import { CreateAIInterpretationDto } from './dto/ai-interpretation.dto';
import { AIInterpretation } from './entities/ai-interpretation.entity';
import { IncidentCategory } from './entities/incident-category.entity';
import { OperationalIndicator } from './entities/operational-indicator.entity';
import { InterpretEventAiDto } from './gemini/dto/interpret-event-ai.dto';
import { GeminiInterpretationResult } from './gemini/dto/gemini-interpretation.result';
import { IntelligenceFacade } from './intelligence.facade';
import { AIInterpretationsRepository } from './repositories/ai-interpretations.repository';

/**
 * Capa de inteligencia operacional.
 * Persistencia mock + orquestación de interpretaciones vía IntelligenceFacade.
 * No conoce Gemini directamente.
 */
@Injectable()
export class IntelligenceService {
  constructor(
    private readonly interpretationsRepository: AIInterpretationsRepository,
    private readonly eventsRepository: OperationalEventsRepository,
    private readonly areasRepository: OperationalAreasRepository,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    private readonly intelligenceFacade: IntelligenceFacade,
    @Inject(forwardRef(() => RecommendedActionsService))
    private readonly recommendedActionsService: RecommendedActionsService,
  ) {}

  listCategories(): Promise<IncidentCategory[]> {
    return this.categoriesRepository.find({ order: { name: 'ASC' } });
  }

  async listByEvent(eventId: string): Promise<AIInterpretation[]> {
    await this.ensureEventExists(eventId);
    return this.interpretationsRepository.findByEventId(eventId);
  }

  /**
   * Genera interpretación real vía facade (Gemini oculto).
   * No persiste: el resultado queda listo para mapear a AIInterpretation.
   */
  interpretWithAi(
    input: InterpretEventAiDto,
  ): Promise<GeminiInterpretationResult> {
    return this.intelligenceFacade.interpretOperationalEvent(input);
  }

  /**
   * Carga datos mínimos del evento + catálogos, interpreta con IA y persiste.
   * Operational Events no habla con Gemini: solo IntelligenceFacade.
   */
  async interpretEventAndPersist(eventId: string): Promise<AIInterpretation> {
    const event = await this.eventsRepository.findWithRelations(eventId);
    if (!event) {
      throw new NotFoundException(
        `Evento operacional no encontrado: ${eventId}`,
      );
    }

    const [categories, areas] = await Promise.all([
      this.categoriesRepository.find({ order: { name: 'ASC' } }),
      this.areasRepository.findCatalog(false),
    ]);

    if (categories.length === 0 || areas.length === 0) {
      throw new NotFoundException(
        'Se requieren categorías e áreas en catálogo para interpretar con IA.',
      );
    }

    const aiInput: InterpretEventAiDto = {
      title: event.title,
      description: event.description,
      sourceAreaCode: event.sourceArea?.code ?? 'UNKNOWN',
      sourceAreaName: event.sourceAreaName,
      reportedAt: event.reportedAt.toISOString(),
      observations: event.observations ?? undefined,
      availableCategories: categories.map((category) => ({
        code: category.code,
        name: category.name,
      })),
      availableAreas: areas.map((area) => ({
        code: area.code,
        name: area.name,
      })),
    };

    const aiResult =
      await this.intelligenceFacade.interpretOperationalEvent(aiInput);

    const category = categories.find(
      (item) =>
        item.code.trim().toUpperCase() ===
        aiResult.categoryCode.trim().toUpperCase(),
    );
    if (!category) {
      throw new NotFoundException(
        `Categoría interpretada no existe en catálogo: ${aiResult.categoryCode}`,
      );
    }

    const affectedAreas = areas.filter((area) =>
      aiResult.affectedAreaCodes.some(
        (code) => code.trim().toUpperCase() === area.code.trim().toUpperCase(),
      ),
    );

    const dto: CreateAIInterpretationDto = {
      eventId: event.id,
      categoryId: category.id,
      affectedAreaIds: affectedAreas.map((area) => area.id),
      impactSeverity: aiResult.severity,
      affectationPercentage: aiResult.affectationPercentage,
      impactInternal: aiResult.internalImpact,
      impactExternal: aiResult.externalImpact,
      impactStudents: aiResult.studentImpact,
      riskLevel: aiResult.riskLevel as RiskLevel,
      riskScore: aiResult.riskScore,
      executiveSummary: aiResult.executiveSummary,
      narrative: aiResult.narrative,
      detectedPatterns: [],
      recommendations: aiResult.recommendations,
      modelLabel: aiResult.modelLabel,
      confidence: aiResult.confidence,
      suggestedIndicators: aiResult.suggestedIndicators.map((indicator) => ({
        code: indicator.code,
        label: indicator.label,
        value: indicator.value,
        unit: indicator.unit,
        direction: indicator.direction as IndicatorDirection | undefined,
      })),
      executiveReport: aiResult.executiveReport,
    };

    return this.createMockInterpretation(dto);
  }

  async createMockInterpretation(
    dto: CreateAIInterpretationDto,
  ): Promise<AIInterpretation> {
    const event = await this.eventsRepository.findWithRelations(dto.eventId);
    if (!event) {
      throw new NotFoundException(
        `Evento operacional no encontrado: ${dto.eventId}`,
      );
    }

    const category = await this.categoriesRepository.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría de incidente no encontrada: ${dto.categoryId}`,
      );
    }

    const affectedAreas = await this.areasRepository.findBy({
      id: In(dto.affectedAreaIds),
    });
    if (affectedAreas.length !== dto.affectedAreaIds.length) {
      throw new NotFoundException(
        'Una o más áreas afectadas no existen en el catálogo.',
      );
    }

    const interpretation = this.interpretationsRepository.create({
      eventId: event.id,
      categoryId: category.id,
      categoryName: category.name,
      category,
      affectedAreas,
      impactSeverity: dto.impactSeverity,
      affectationPercentage: dto.affectationPercentage,
      impactInternal: dto.impactInternal,
      impactExternal: dto.impactExternal,
      impactStudents: dto.impactStudents,
      riskLevel: dto.riskLevel,
      riskScore: dto.riskScore,
      executiveSummary: dto.executiveSummary,
      narrative: dto.narrative,
      detectedPatterns: dto.detectedPatterns ?? [],
      recommendations: dto.recommendations ?? [],
      modelLabel: dto.modelLabel ?? 'gemini-mock',
      interpretedAt: new Date(),
      confidence: dto.confidence ?? null,
      executiveReport: dto.executiveReport ?? null,
      suggestedIndicators: (dto.suggestedIndicators ?? []).map((indicator) =>
        Object.assign(new OperationalIndicator(), {
          code: indicator.code,
          label: indicator.label,
          value: indicator.value,
          unit: indicator.unit ?? null,
          direction: indicator.direction ?? null,
          suggestedByAI: true,
          source: IndicatorSource.AI_SUGGESTED,
        }),
      ),
    });

    const saved = await this.interpretationsRepository.save(interpretation);

    event.currentInterpretationId = saved.id;
    event.lastUpdateAt = new Date();
    event.timelineEntries = [
      ...(event.timelineEntries ?? []),
      Object.assign(new OperationalTimelineEntry(), {
        type: TimelineEntryType.INTERPRETATION_GENERATED,
        at: new Date(),
        description: `Interpretación generada por ${saved.modelLabel}.`,
      }),
    ];
    await this.eventsRepository.save(event);

    await this.recommendedActionsService.materializeFromInterpretation(saved);

    return saved;
  }

  private async ensureEventExists(eventId: string): Promise<void> {
    const exists = await this.eventsRepository.exist({
      where: { id: eventId },
    });
    if (!exists) {
      throw new NotFoundException(
        `Evento operacional no encontrado: ${eventId}`,
      );
    }
  }
}
