import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Situation } from '../situations/entities/situation.entity';
import {
  CreateTimelineEntryInput,
  SituationTimelineEntryResponseDto,
  SituationTimelineResponseDto,
} from './dto/situation-timeline.dto';
import { SituationTimelineEntry } from './entities/situation-timeline-entry.entity';
import { SituationTimelineRepository } from './repositories/situation-timeline.repository';

@Injectable()
export class SituationTimelineService {
  constructor(
    private readonly timelineRepository: SituationTimelineRepository,
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async createEntry(
    input: CreateTimelineEntryInput,
    manager?: EntityManager,
  ): Promise<SituationTimelineEntryResponseDto> {
    await this.ensureSituationExists(input.situationId, manager);

    const timelineRepository = manager
      ? manager.getRepository(SituationTimelineEntry)
      : this.timelineRepository;

    const entry = timelineRepository.create({
      situationId: input.situationId,
      userId: input.userId ?? null,
      eventType: input.eventType,
      title: input.title.trim(),
      description: input.description.trim(),
      metadata: input.metadata ?? null,
    });

    const saved = await timelineRepository.save(entry);
    const withUser = await timelineRepository.findOne({
      where: { id: saved.id },
      relations: { user: true },
    });

    return this.toResponse(withUser ?? saved);
  }

  async findBySituation(
    situationId: string,
  ): Promise<SituationTimelineResponseDto> {
    await this.ensureSituationExists(situationId);

    const items = await this.timelineRepository.findBySituationId(situationId);

    return {
      situationId,
      items: items.map((item) => this.toResponse(item)),
      total: items.length,
    };
  }

  private async ensureSituationExists(
    situationId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const situationsRepository = manager
      ? manager.getRepository(Situation)
      : this.situationsRepository;

    const exists = await situationsRepository.exist({
      where: { id: situationId },
    });
    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }

  private toResponse(
    entry: SituationTimelineEntry,
  ): SituationTimelineEntryResponseDto {
    return {
      id: entry.id,
      situationId: entry.situationId,
      userId: entry.userId,
      userName: entry.user?.fullName ?? null,
      eventType: entry.eventType,
      title: entry.title,
      description: entry.description,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    };
  }
}
