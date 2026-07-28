import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoUserResponseDto, EnsureDemoUserDto } from './dto/demo-user.dto';
import { DemoUser } from './entities/demo-user.entity';
import { DemoUsersRepository } from './repositories/demo-users.repository';

@Injectable()
export class DemoUsersService {
  constructor(private readonly demoUsersRepository: DemoUsersRepository) {}

  async getById(id: string): Promise<DemoUserResponseDto> {
    const user = await this.demoUsersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario demo no encontrado: ${id}`);
    }
    return this.toResponse(user);
  }

  async ensure(dto: EnsureDemoUserDto): Promise<DemoUserResponseDto> {
    const existing = await this.demoUsersRepository.findOne({
      where: { id: dto.id },
    });

    if (existing) {
      existing.name = dto.name;
      existing.role = dto.role;
      existing.selectedAreaId = dto.selectedAreaId ?? null;
      const saved = await this.demoUsersRepository.save(existing);
      return this.toResponse(saved);
    }

    const created = this.demoUsersRepository.create({
      id: dto.id,
      name: dto.name,
      role: dto.role,
      selectedAreaId: dto.selectedAreaId ?? null,
      onboardingCompleted: false,
      onboardingSeenAt: null,
    });
    const saved = await this.demoUsersRepository.save(created);
    return this.toResponse(saved);
  }

  async completeOnboarding(id: string): Promise<DemoUserResponseDto> {
    const user = await this.demoUsersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario demo no encontrado: ${id}`);
    }

    if (!user.onboardingCompleted) {
      user.onboardingCompleted = true;
      user.onboardingSeenAt = new Date();
      await this.demoUsersRepository.save(user);
    }

    return this.toResponse(user);
  }

  private toResponse(user: DemoUser): DemoUserResponseDto {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      selectedAreaId: user.selectedAreaId,
      onboardingCompleted: user.onboardingCompleted,
      onboardingSeenAt: user.onboardingSeenAt
        ? user.onboardingSeenAt.toISOString()
        : null,
    };
  }
}
