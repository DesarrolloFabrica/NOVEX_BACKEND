import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const createStrategy = () =>
    new JwtStrategy({
      get: jest.fn().mockReturnValue('test-secret'),
    } as never);

  const validPayload = {
    sub: 'user-1',
    email: 'user@cun.edu.co',
    roleId: 'role-1',
    roleCode: 'COORDINADOR',
    coordinationId: 'coord-1',
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_CREATE'],
    status: UserStatus.ACTIVE,
  };

  it('expone el payload del JWT sin reconstruirlo desde BD', () => {
    const strategy = createStrategy();
    const result = strategy.validate(validPayload);

    expect(result).toEqual(validPayload);
  });

  it('acepta coordinación nula para roles sin asignación', () => {
    const strategy = createStrategy();
    const result = strategy.validate({
      ...validPayload,
      roleCode: 'ADMIN',
      coordinationId: null,
    });

    expect(result.coordinationId).toBeNull();
    expect(result.roleCode).toBe('ADMIN');
  });

  it('rechaza tokens incompletos', () => {
    const strategy = createStrategy();

    expect(() =>
      strategy.validate({
        ...validPayload,
        sub: '',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza usuarios inactivos embebidos en el token', () => {
    const strategy = createStrategy();

    expect(() =>
      strategy.validate({
        ...validPayload,
        status: UserStatus.INACTIVE,
      }),
    ).toThrow(UnauthorizedException);
  });
});
