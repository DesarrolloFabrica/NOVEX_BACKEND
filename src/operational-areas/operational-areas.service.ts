import { Injectable, NotFoundException } from '@nestjs/common';
import { OperationalAreasRepository } from './repositories/operational-areas.repository';
import {
  CreateOperationalAreaDto,
  ListOperationalAreasQueryDto,
  UpdateOperationalAreaDto,
} from './dto/operational-area.dto';
import { OperationalArea } from './entities/operational-area.entity';

/**
 * Catálogo de áreas operacionales.
 * Sprint 6: CRUD estructural sin semilla automática.
 */
@Injectable()
export class OperationalAreasService {
  constructor(private readonly areasRepository: OperationalAreasRepository) {}

  list(query: ListOperationalAreasQueryDto): Promise<OperationalArea[]> {
    return this.areasRepository.findCatalog(query.includeGlobal ?? true);
  }

  async getById(id: string): Promise<OperationalArea> {
    const area = await this.areasRepository.findOne({ where: { id } });
    if (!area) {
      throw new NotFoundException(`Área operacional no encontrada: ${id}`);
    }
    return area;
  }

  create(dto: CreateOperationalAreaDto): Promise<OperationalArea> {
    const area = this.areasRepository.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isGlobal: dto.isGlobal ?? false,
    });
    return this.areasRepository.save(area);
  }

  async update(
    id: string,
    dto: UpdateOperationalAreaDto,
  ): Promise<OperationalArea> {
    const area = await this.getById(id);
    Object.assign(area, {
      ...dto,
      description:
        dto.description === undefined ? area.description : dto.description,
    });
    return this.areasRepository.save(area);
  }
}
