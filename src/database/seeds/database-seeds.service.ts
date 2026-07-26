import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IndicatorSource,
  TimelineEntryType,
} from '../../common/enums/operational.enums';
import { ExecutiveIntelligenceReport } from '../../intelligence/contracts/executive-intelligence-report.contract';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { OperationalIndicator } from '../../intelligence/entities/operational-indicator.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';
import { OperationalTimelineEntry } from '../../operational-events/entities/operational-timeline-entry.entity';
import {
  MOCK_AREAS,
  MOCK_CATEGORIES,
  MOCK_OPERATIONAL_EVENTS,
  MOCK_SEED_SOURCE,
  MockOperationalEventSeed,
  MockTimelineSeed,
} from './mock-operational-events.seed';

@Injectable()
export class DatabaseSeedsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(OperationalArea)
    private readonly areasRepository: Repository<OperationalArea>,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    @InjectRepository(OperationalEvent)
    private readonly eventsRepository: Repository<OperationalEvent>,
    @InjectRepository(AIInterpretation)
    private readonly interpretationsRepository: Repository<AIInterpretation>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedMockOperationalEvents();
  }

  private async seedMockOperationalEvents(): Promise<void> {
    const areas = await this.ensureAreas();
    const categories = await this.ensureCategories();

    for (const seed of MOCK_OPERATIONAL_EVENTS) {
      const exists = await this.eventsRepository.exist({
        where: { id: seed.id, isMock: true, source: MOCK_SEED_SOURCE },
      });
      if (exists) continue;

      await this.createSeedEvent(seed, areas, categories);
    }
  }

  private async ensureAreas(): Promise<Map<string, OperationalArea>> {
    for (const item of MOCK_AREAS) {
      const existing = await this.areasRepository.findOne({
        where: { code: item.code },
      });
      if (existing) {
        await this.areasRepository.save({
          ...existing,
          name: item.name,
          description: item.description,
          isGlobal: item.isGlobal ?? false,
        });
      } else {
        await this.areasRepository.save(
          this.areasRepository.create({
            code: item.code,
            name: item.name,
            description: item.description,
            isGlobal: item.isGlobal ?? false,
          }),
        );
      }
    }

    const areas = await this.areasRepository.find();
    return new Map(areas.map((area) => [area.code, area]));
  }

  private async ensureCategories(): Promise<Map<string, IncidentCategory>> {
    for (const item of MOCK_CATEGORIES) {
      const existing = await this.categoriesRepository.findOne({
        where: { code: item.code },
      });
      if (existing) {
        await this.categoriesRepository.save({
          ...existing,
          name: item.name,
          description: item.description,
        });
      } else {
        await this.categoriesRepository.save(
          this.categoriesRepository.create({
            code: item.code,
            name: item.name,
            description: item.description,
          }),
        );
      }
    }

    const categories = await this.categoriesRepository.find();
    return new Map(categories.map((category) => [category.code, category]));
  }

  private async createSeedEvent(
    seed: MockOperationalEventSeed,
    areas: Map<string, OperationalArea>,
    categories: Map<string, IncidentCategory>,
  ): Promise<void> {
    const sourceArea = this.requireMapItem(areas, seed.sourceAreaCode, 'area');
    const affectedAreas = seed.affectedAreaCodes.map((code) =>
      this.requireMapItem(areas, code, 'area'),
    );
    const category = this.requireMapItem(
      categories,
      seed.categoryCode,
      'category',
    );

    const event = await this.eventsRepository.save(
      this.eventsRepository.create({
        id: seed.id,
        title: seed.title,
        description: seed.description,
        reportedById: seed.reportedById,
        reportedByName: seed.reportedByName,
        reportedAt: new Date(seed.reportedAt),
        sourceArea,
        sourceAreaId: sourceArea.id,
        sourceAreaName: sourceArea.name,
        status: seed.status,
        observations: seed.observations,
        attachmentNames: [...seed.attachmentNames],
        isMock: true,
        source: MOCK_SEED_SOURCE,
        lastUpdateAt: new Date(seed.lastUpdateAt),
        currentInterpretationId: null,
        timelineEntries: seed.timeline.map((entry) =>
          this.createTimelineEntry(entry),
        ),
      }),
    );

    const interpretation = this.interpretationsRepository.create({
        event,
        eventId: event.id,
        category,
        categoryId: category.id,
        categoryName: category.name,
        affectedAreas,
        impactSeverity: seed.interpretation.impactSeverity,
        affectationPercentage: seed.interpretation.affectationPercentage,
        impactInternal: seed.interpretation.impactInternal,
        impactExternal: seed.interpretation.impactExternal,
        impactStudents: seed.interpretation.impactStudents,
        riskLevel: seed.interpretation.riskLevel,
        riskScore: seed.interpretation.riskScore,
        executiveSummary: seed.interpretation.executiveSummary,
        narrative: seed.interpretation.narrative,
        detectedPatterns: [...seed.interpretation.detectedPatterns],
        recommendations: [...seed.interpretation.recommendations],
        modelLabel: seed.interpretation.modelLabel,
        interpretedAt: new Date(seed.timeline[1][1]),
        confidence: seed.interpretation.confidence,
        executiveReport: seed.interpretation
          .executiveReport as unknown as ExecutiveIntelligenceReport,
        suggestedIndicators: seed.interpretation.suggestedIndicators.map(
          (indicator) =>
            Object.assign(new OperationalIndicator(), {
              code: indicator.code,
              label: indicator.label,
              value: indicator.value,
              unit: indicator.unit,
              direction: indicator.direction,
              suggestedByAI: true,
              source: IndicatorSource.AI_SUGGESTED,
            }),
        ),
      });
    const savedInterpretation =
      await this.interpretationsRepository.save(interpretation);

    event.currentInterpretationId = savedInterpretation.id;
    await this.eventsRepository.save(event);
  }

  private createTimelineEntry(
    entry: MockTimelineSeed,
  ): OperationalTimelineEntry {
    const [type, at, description, byUserName] = entry;
    return Object.assign(new OperationalTimelineEntry(), {
      type: type as TimelineEntryType,
      at: new Date(at),
      byUserId: byUserName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      byUserName,
      description,
    });
  }

  private requireMapItem<T>(
    items: Map<string, T>,
    code: string,
    label: string,
  ): T {
    const item = items.get(code);
    if (!item) {
      throw new Error(`Missing ${label} seed dependency: ${code}`);
    }
    return item;
  }
}
