import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationStatus } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import {
  CreateSituationDto,
  ListSituationsQueryDto,
  SituationResponseDto,
  SituationsListResponseDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';

@Injectable()
export class SituationsService {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
  ) {}

  async create(
    dto: CreateSituationDto,
    createdByUserId: string,
  ): Promise<SituationResponseDto> {
    const [coordination, category] = await Promise.all([
      this.ensureCoordination(dto.coordinationId),
      this.ensureCategory(dto.categoryId),
    ]);

    const situation = this.situationsRepository.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      coordinationId: coordination.id,
      coordination,
      createdByUserId,
      categoryId: category.id,
      category,
      severity: dto.severity,
      status: SituationStatus.OPEN,
      occurredAt: new Date(dto.occurredAt),
    });

    const saved = await this.situationsRepository.save(situation);
    const withRelations = await this.situationsRepository.findByIdWithRelations(
      saved.id,
    );
    if (!withRelations) {
      throw new NotFoundException('No fue posible cargar la situación creada.');
    }

    return this.toResponse(withRelations);
  }

  async list(query: ListSituationsQueryDto): Promise<SituationsListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await this.situationsRepository.search(query);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }
    return this.toResponse(situation);
  }

  async update(
    id: string,
    dto: UpdateSituationDto,
  ): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    if (dto.coordinationId !== undefined) {
      const coordination = await this.ensureCoordination(dto.coordinationId);
      situation.coordinationId = coordination.id;
      situation.coordination = coordination;
    }

    if (dto.categoryId !== undefined) {
      const category = await this.ensureCategory(dto.categoryId);
      situation.categoryId = category.id;
      situation.category = category;
    }

    if (dto.title !== undefined) {
      situation.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      situation.description = dto.description.trim();
    }
    if (dto.severity !== undefined) {
      situation.severity = dto.severity;
    }
    if (dto.status !== undefined) {
      situation.status = dto.status;
    }
    if (dto.occurredAt !== undefined) {
      situation.occurredAt = new Date(dto.occurredAt);
    }

    await this.situationsRepository.save(situation);
    return this.getById(id);
  }

  private async ensureCoordination(id: string): Promise<Coordination> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${id}`);
    }
    return coordination;
  }

  private async ensureCategory(id: string): Promise<IncidentCategory> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría no encontrada: ${id}`);
    }
    return category;
  }

  private toResponse(situation: Situation): SituationResponseDto {
    return {
      id: situation.id,
      title: situation.title,
      description: situation.description,
      coordinationId: situation.coordinationId,
      coordinationCode: situation.coordination.code,
      coordinationName: situation.coordination.name,
      createdByUserId: situation.createdByUserId,
      createdByUserName: situation.createdByUser.fullName,
      categoryId: situation.categoryId,
      categoryCode: situation.category.code,
      categoryName: situation.category.name,
      severity: situation.severity,
      status: situation.status,
      occurredAt: situation.occurredAt,
      createdAt: situation.createdAt,
      updatedAt: situation.updatedAt,
    };
  }
}
