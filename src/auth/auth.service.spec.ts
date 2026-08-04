import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import { AuthService } from './auth.service';

describe('AuthService Google login policy', () => {
  const createService = () => {
    const usersRepository = {
      findByEmail: jest.fn(),
      save: jest.fn((user: unknown) => Promise.resolve(user)),
      findByIdWithRelations: jest.fn(),
    };

    const rbacService = {
      getUserPermissions: jest.fn().mockResolvedValue({
        permissions: [{ code: 'SITUATIONS_VIEW' }],
      }),
    };

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'google.clientId') return 'google-client';
        if (key === 'jwt.expiresIn') return '1h';
        if (key === 'enableEmailLogin') return true;
        return undefined;
      }),
    };

    const service = new AuthService(
      usersRepository as never,
      rbacService as never,
      jwtService as never,
      configService as never,
    );

    return { service, usersRepository, rbacService, jwtService };
  };

  it('buildAuthPayload embebe id, rol, coordinación y permisos', async () => {
    const { service } = createService();

    const payload = await service.buildAuthPayload({
      id: 'user-1',
      email: 'user@cun.edu.co',
      roleId: 'role-1',
      role: { code: 'ANALISTA' },
      coordinationId: 'coord-1',
      status: UserStatus.ACTIVE,
    } as never);

    expect(payload).toEqual({
      sub: 'user-1',
      email: 'user@cun.edu.co',
      roleId: 'role-1',
      roleCode: 'ANALISTA',
      coordinationId: 'coord-1',
      permissions: ['SITUATIONS_VIEW'],
      status: UserStatus.ACTIVE,
    });
  });

  it('loginWithEmail rechaza usuarios inexistentes sin crearlos', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      service.loginWithEmail('missing@cun.edu.co'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });
});
