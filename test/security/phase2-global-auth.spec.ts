import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserStatus } from '../../src/common/enums/identity.enums';
import configuration from '../../src/configuration/configuration';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { DashboardController } from '../../src/dashboard/dashboard.controller';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { SituationsController } from '../../src/situations/situations.controller';
import { SituationsService } from '../../src/situations/situations.service';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { RbacService } from '../../src/rbac/rbac.service';
import {
  ProbeHealthState,
  registerProbeHealthRoutes,
} from '../../src/health/probe-health';

const API_PREFIX = 'api/v1';
const TEST_JWT_SECRET = 'phase2-test-secret-with-minimum-length';

function configureTestEnv(): void {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.DB_PASSWORD = 'test-db-password';
  process.env.ENABLE_EMAIL_LOGIN = 'true';
}

describe('Phase 2 global authentication (private by default)', () => {
  let app: INestApplication<App>;
  let jwtSign: (payload: Record<string, unknown>) => Promise<string>;

  beforeEach(async () => {
    configureTestEnv();

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
      controllers: [
        AuthController,
        SituationsController,
        DashboardController,
        UsersController,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        PermissionsGuard,
        {
          provide: AuthService,
          useValue: {
            loginWithEmail: jest.fn().mockResolvedValue({
              accessToken: 'test-token',
              user: { id: 'user-1' },
            }),
            loginWithGoogle: jest.fn(),
            getMe: jest.fn().mockResolvedValue({ id: 'user-1' }),
          },
        },
        {
          provide: SituationsService,
          useValue: {
            listIncidentCategories: jest.fn().mockResolvedValue([]),
            list: jest.fn().mockResolvedValue([]),
            getById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: DashboardService,
          useValue: { getMetrics: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: UsersService,
          useValue: { list: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: RbacService,
          useValue: { canManageUsers: jest.fn().mockReturnValue(false) },
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

  const privateRoutes = [
    ['get', '/situations/categories'],
    ['get', '/situations'],
    ['get', '/users'],
    ['get', '/dashboard/metrics'],
  ] as const;

  it.each(privateRoutes)('%s %s sin JWT responde 401', async (method, path) => {
    const server = request(app.getHttpServer());
    const target = `/${API_PREFIX}${path}`;

    if (method === 'get') {
      await server.get(target).expect(401);
    }
  });

  it('POST /auth/email es accesible sin JWT', async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/email`)
      .send({ email: 'analyst@cun.edu.co' })
      .expect(201);
  });

  it('GET /auth/me sin JWT responde 401', async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/auth/me`)
      .expect(401);
  });

  it('GET /auth/me con JWT válido responde 200', async () => {
    const token = await jwtSign({
      sub: 'user-1',
      email: 'analyst@cun.edu.co',
      roleId: 'role-analyst',
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: ['SITUATIONS_VIEW'],
      status: UserStatus.ACTIVE,
    });

    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

describe('Phase 2 probe health (sin JWT)', () => {
  it('GET /health responde 200', async () => {
    const probeApp = express();
    registerProbeHealthRoutes(probeApp, new ProbeHealthState());

    await request(probeApp).get('/health').expect(200);
  });

  it('GET /health/ready responde sin JWT', async () => {
    const probeApp = express();
    registerProbeHealthRoutes(probeApp, new ProbeHealthState());

    const response = await request(probeApp).get('/health/ready').expect(503);

    expect((response.body as { status: string }).status).toBe('not_ready');
  });
});
