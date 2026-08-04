import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import { UsersService } from './users.service';

describe('UsersService admin registration', () => {
  const createService = () => {
    const usersRepository = {
      findCatalog: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn((input: unknown) => input),
      save: jest.fn((entity: { id?: string }) =>
        Promise.resolve({
          ...entity,
          id: entity.id ?? 'user-1',
        }),
      ),
    };

    const rolesRepository = {
      findOne: jest.fn(),
    };

    const coordinationsRepository = {
      findOne: jest.fn(),
    };

    const service = new UsersService(
      usersRepository as never,
      rolesRepository as never,
      coordinationsRepository as never,
    );

    return {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    };
  };

  const role = {
    id: 'role-coord',
    code: 'COORDINADOR',
    name: 'Coordinador',
    isActive: true,
  };

  const coordination = {
    id: 'coord-uuid',
    code: 'coord-b2b',
    name: 'B2B',
    isActive: true,
  };

  it('crea un usuario real con rol, coordinación y estado', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();

    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue(role);
    coordinationsRepository.findOne.mockResolvedValue(coordination);
    usersRepository.findByIdWithRelations.mockResolvedValue({
      id: 'user-1',
      googleSub: null,
      email: 'coord@cun.edu.co',
      fullName: 'Ana Coordinadora',
      photoUrl: null,
      roleId: role.id,
      role,
      coordinationId: coordination.id,
      coordination,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    const result = await service.create({
      fullName: 'Ana Coordinadora',
      email: 'Coord@cun.edu.co',
      roleCode: 'coordinador',
      coordinationId: coordination.id,
      status: UserStatus.ACTIVE,
    });

    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'coord@cun.edu.co',
        fullName: 'Ana Coordinadora',
        roleId: role.id,
        coordinationId: coordination.id,
        status: UserStatus.ACTIVE,
        googleSub: null,
      }),
    );
    expect(result.email).toBe('coord@cun.edu.co');
    expect(result.roleCode).toBe('COORDINADOR');
    expect(result.coordinationId).toBe(coordination.id);
    expect(result.status).toBe(UserStatus.ACTIVE);
  });

  it('rechaza correo duplicado', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByEmail.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create({
        fullName: 'Duplicado',
        email: 'dup@cun.edu.co',
        roleCode: 'ANALISTA',
        coordinationId: coordination.id,
        status: UserStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza rol inválido', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue(null);
    coordinationsRepository.findOne.mockResolvedValue(coordination);

    await expect(
      service.create({
        fullName: 'Sin rol',
        email: 'x@cun.edu.co',
        roleCode: 'DESCONOCIDO',
        coordinationId: coordination.id,
        status: UserStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('actualiza estado y coordinación principal', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();

    const existing = {
      id: 'user-1',
      googleSub: null,
      email: 'dir@cun.edu.co',
      fullName: 'Director',
      photoUrl: null,
      roleId: 'role-dir',
      role: {
        id: 'role-dir',
        code: 'DIRECTOR',
        name: 'Director',
        isActive: true,
      },
      coordinationId: 'old-coord',
      coordination: {
        id: 'old-coord',
        code: 'coord-general',
        name: 'General',
        isActive: true,
      },
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };

    usersRepository.findByIdWithRelations
      .mockResolvedValueOnce({ ...existing })
      .mockResolvedValueOnce({
        ...existing,
        status: UserStatus.INACTIVE,
        coordinationId: coordination.id,
        coordination,
      });
    coordinationsRepository.findOne.mockResolvedValue(coordination);

    const result = await service.update('user-1', {
      status: UserStatus.INACTIVE,
      coordinationId: coordination.id,
    });

    expect(usersRepository.save).toHaveBeenCalled();
    expect(rolesRepository.findOne).not.toHaveBeenCalled();
    expect(result.status).toBe(UserStatus.INACTIVE);
    expect(result.coordinationId).toBe(coordination.id);
  });

  it('falla al actualizar usuario inexistente', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByIdWithRelations.mockResolvedValue(null);

    await expect(
      service.update('missing', { status: UserStatus.INACTIVE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persiste el avance del onboarding y limita el paso al rango admitido', async () => {
    const { service, usersRepository } = createService();
    const existing = {
      id: 'user-1',
      googleSub: null,
      email: 'analista@cun.edu.co',
      fullName: 'Analista',
      photoUrl: null,
      roleId: role.id,
      role,
      coordinationId: coordination.id,
      coordination,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      onboardingStep: 0,
      onboardingCompleted: false,
      onboardingSeenAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };
    usersRepository.findByIdWithRelations.mockResolvedValue(existing);

    const result = await service.updateOnboarding('user-1', {
      step: 150,
      completed: true,
    });

    expect(usersRepository.save).toHaveBeenCalledTimes(1);
    expect(existing.onboardingStep).toBe(100);
    expect(existing.onboardingCompleted).toBe(true);
    expect(result.onboardingStep).toBe(100);
    expect(result.onboardingCompleted).toBe(true);
    expect(result.onboardingSeenAt).toBeInstanceOf(Date);
  });
});
