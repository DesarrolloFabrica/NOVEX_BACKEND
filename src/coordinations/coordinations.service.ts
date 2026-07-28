import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CoordinationGraphResponseDto,
  CoordinationResponseDto,
  ListCoordinationsQueryDto,
} from './dto/coordination.dto';
import { Coordination } from './entities/coordination.entity';
import { CoordinationDependenciesRepository } from './repositories/coordination-dependencies.repository';
import { CoordinationsRepository } from './repositories/coordinations.repository';

@Injectable()
export class CoordinationsService {
  constructor(
    private readonly coordinationsRepository: CoordinationsRepository,
    private readonly dependenciesRepository: CoordinationDependenciesRepository,
  ) {}

  async list(
    query: ListCoordinationsQueryDto,
  ): Promise<CoordinationResponseDto[]> {
    const items = await this.coordinationsRepository.findCatalog(
      query.includeInactive ?? false,
    );
    return items.map((item) => this.toResponse(item));
  }

  async getById(id: string): Promise<CoordinationResponseDto> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${id}`);
    }
    return this.toResponse(coordination);
  }

  async getGraph(): Promise<CoordinationGraphResponseDto> {
    const [coordinations, dependencies] = await Promise.all([
      this.coordinationsRepository.findCatalog(false),
      this.dependenciesRepository.findCatalog(),
    ]);

    return {
      coordinations: coordinations.map((item) => this.toResponse(item)),
      dependencies: dependencies.map((dependency) => ({
        id: dependency.id,
        sourceCoordinationId: dependency.sourceCoordinationId,
        targetCoordinationId: dependency.targetCoordinationId,
        dependencyWeight: dependency.dependencyWeight,
        dependencyType: dependency.dependencyType,
        bidirectional: dependency.bidirectional,
      })),
    };
  }

  private toResponse(coordination: Coordination): CoordinationResponseDto {
    return {
      id: coordination.id,
      code: coordination.code,
      name: coordination.name,
      shortName: coordination.shortName,
      description: coordination.description,
      color: coordination.color,
      icon: coordination.icon,
      imageAsset: coordination.imageAsset,
      displayOrder: coordination.displayOrder,
      isActive: coordination.isActive,
      createdAt: coordination.createdAt,
      updatedAt: coordination.updatedAt,
    };
  }
}
