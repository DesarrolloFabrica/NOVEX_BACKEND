import { Injectable, NotFoundException } from '@nestjs/common';
import { EnsureUserDto, UserResponseDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }
    return this.toResponse(user);
  }

  async ensure(dto: EnsureUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findOne({
      where: { id: dto.id },
    });

    if (existing) {
      existing.name = dto.name;
      existing.role = dto.role;
      existing.selectedAreaId = dto.selectedAreaId ?? null;
      const saved = await this.usersRepository.save(existing);
      return this.toResponse(saved);
    }

    const created = this.usersRepository.create({
      id: dto.id,
      name: dto.name,
      role: dto.role,
      selectedAreaId: dto.selectedAreaId ?? null,
      onboardingCompleted: false,
      onboardingSeenAt: null,
    });
    const saved = await this.usersRepository.save(created);
    return this.toResponse(saved);
  }

  async completeOnboarding(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }

    if (!user.onboardingCompleted) {
      user.onboardingCompleted = true;
      user.onboardingSeenAt = new Date();
      await this.usersRepository.save(user);
    }

    return this.toResponse(user);
  }

  private toResponse(user: User): UserResponseDto {
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
