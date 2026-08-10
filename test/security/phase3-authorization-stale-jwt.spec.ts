import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserStatus } from '../../src/common/enums/identity.enums';
import configuration from '../../src/configuration/configuration';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { RbacService } from '../../src/rbac/rbac.service';
import { SituationsController } from '../../src/situations/situations.controller';
import { SituationsService } from '../../src/situations/situations.service';

const API_PREFIX = 'api/v1';
const TEST_JWT_SECRET = 'phase3-stale-jwt-secret-minimum-length';

describe('SEC-006 stale JWT authorization', () => {
  let app: INestApplication<App>;
  let jwtSign: (payload: Record<string, unknown>) => Promise<string>;
  let resolveActiveAuthorization: jest.Mock;

  beforeEach(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.DB_PASSWORD = 'test-db-password';

    resolveActiveAuthorization = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          ignoreEnvFile: true,
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [SituationsController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: AuthorizationEnrichmentGuard },
        PermissionsGuard,
        {
          provide: RbacService,
          useValue: {
            resolveActiveAuthorization,
          },
        },
        {
          provide: SituationsService,
          useValue: {
            listIncidentCategories: jest.fn().mockResolvedValue([]),
            list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            getById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jwtSign = (payload) => moduleFixture.get(JwtService).signAsync(payload);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rechaza JWT válido cuando el permiso fue revocado en servidor (403)', async () => {
    const token = await jwtSign({
      sub: 'user-1',
      email: 'analyst@cun.edu.co',
      roleId: 'role-analyst',
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: ['SITUATIONS_VIEW'],
      status: UserStatus.ACTIVE,
    });

    resolveActiveAuthorization.mockResolvedValue({
      sub: 'user-1',
      email: 'analyst@cun.edu.co',
      roleId: 'role-analyst',
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: [],
      status: UserStatus.ACTIVE,
    });

    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/situations/categories`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('aplica rol vigente del servidor aunque el JWT conserve rol anterior', async () => {
    const token = await jwtSign({
      sub: 'user-1',
      email: 'admin@cun.edu.co',
      roleId: 'role-admin-old',
      roleCode: 'ADMIN',
      coordinationId: null,
      permissions: ['SYSTEM_CONFIGURATION'],
      status: UserStatus.ACTIVE,
    });

    resolveActiveAuthorization.mockResolvedValue({
      sub: 'user-1',
      email: 'admin@cun.edu.co',
      roleId: 'role-analyst',
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: ['SITUATIONS_VIEW'],
      status: UserStatus.ACTIVE,
    });

    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/situations/categories`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resolveActiveAuthorization).toHaveBeenCalledWith('user-1');
  });
});
