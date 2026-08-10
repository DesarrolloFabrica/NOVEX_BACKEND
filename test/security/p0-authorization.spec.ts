import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserStatus } from '../../src/common/enums/identity.enums';
import configuration from '../../src/configuration/configuration';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { DemoUsersModule } from '../../src/demo-users/demo-users.module';
import { DemoUsersController } from '../../src/demo-users/demo-users.controller';
import { IntelligenceModule } from '../../src/intelligence/intelligence.module';
import { IntelligenceController } from '../../src/intelligence/intelligence.controller';
import { OperationalAreasModule } from '../../src/operational-areas/operational-areas.module';
import { OperationalAreasController } from '../../src/operational-areas/operational-areas.controller';
import { OperationalEventsModule } from '../../src/operational-events/operational-events.module';
import { OperationalEventsController } from '../../src/operational-events/operational-events.controller';
import { RecommendedActionsModule } from '../../src/recommended-actions/recommended-actions.module';
import { RecommendedActionsController } from '../../src/recommended-actions/recommended-actions.controller';
import { SituationsController } from '../../src/situations/situations.controller';
import { SituationsService } from '../../src/situations/situations.service';

const API_PREFIX = 'api/v1';
const TEST_JWT_SECRET = 'p0-test-secret-with-minimum-length';

function configureTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '5432';
  process.env.DB_USERNAME = 'test-user';
  process.env.DB_PASSWORD = 'test-db-password';
  process.env.DB_DATABASE = 'test-db';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
}

function readModuleControllers(
  moduleClass: new (...args: never[]) => unknown,
): unknown[] {
  const controllers: unknown = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    moduleClass,
  );
  return Array.isArray(controllers) ? controllers : [];
}

describe('P0 authorization closure', () => {
  describe('legacy runtime surface', () => {
    it('no registra controllers legacy en módulos productivos', () => {
      expect(readModuleControllers(OperationalEventsModule)).toEqual([]);
      expect(readModuleControllers(OperationalAreasModule)).toEqual([]);
      expect(readModuleControllers(RecommendedActionsModule)).toEqual([]);
      expect(readModuleControllers(IntelligenceModule)).toEqual([]);
      expect(readModuleControllers(DemoUsersModule)).toEqual([
        DemoUsersController,
      ]);
    });

    it('mantiene DemoUsersModule fuera del AppModule productivo', () => {
      const appModuleSource = readFileSync(
        join(__dirname, '../../src/app.module.ts'),
        'utf8',
      );

      expect(appModuleSource).not.toContain('DemoUsersModule');
      expect(readModuleControllers(OperationalEventsModule)).not.toContain(
        OperationalEventsController,
      );
      expect(readModuleControllers(OperationalAreasModule)).not.toContain(
        OperationalAreasController,
      );
      expect(readModuleControllers(RecommendedActionsModule)).not.toContain(
        RecommendedActionsController,
      );
      expect(readModuleControllers(IntelligenceModule)).not.toContain(
        IntelligenceController,
      );
    });
  });

  describe('GET /situations/categories', () => {
    let app: INestApplication<App>;
    let jwtSign: (payload: Record<string, unknown>) => Promise<string>;

    const categoriesFixture = [
      {
        id: 'category-1',
        code: 'ACADEMIC',
        name: 'Académico',
        description: null,
      },
    ];

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
        controllers: [SituationsController],
        providers: [
          JwtStrategy,
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          PermissionsGuard,
          {
            provide: SituationsService,
            useValue: {
              listIncidentCategories: jest
                .fn()
                .mockResolvedValue(categoriesFixture),
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

    it('rechaza solicitudes anónimas con 401', async () => {
      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/situations/categories`)
        .expect(401);
    });

    it('rechaza usuarios autenticados sin permiso con 403', async () => {
      const token = await jwtSign({
        sub: 'director-1',
        email: 'director@cun.edu.co',
        roleId: 'role-director',
        roleCode: 'DIRECTOR',
        coordinationId: null,
        permissions: ['REPORTS_VIEW'],
        status: UserStatus.ACTIVE,
      });

      await request(app.getHttpServer())
        .get(`/${API_PREFIX}/situations/categories`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('permite usuarios con SITUATIONS_VIEW con 200', async () => {
      const token = await jwtSign({
        sub: 'analyst-1',
        email: 'analyst@cun.edu.co',
        roleId: 'role-analyst',
        roleCode: 'ANALISTA',
        coordinationId: null,
        permissions: ['SITUATIONS_VIEW'],
        status: UserStatus.ACTIVE,
      });

      const response = await request(app.getHttpServer())
        .get(`/${API_PREFIX}/situations/categories`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual(categoriesFixture);
    });
  });

  describe('legacy HTTP routes removed', () => {
    let app: INestApplication<App>;

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
        controllers: [SituationsController],
        providers: [
          JwtStrategy,
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          PermissionsGuard,
          {
            provide: SituationsService,
            useValue: {
              listIncidentCategories: jest.fn().mockResolvedValue([]),
              list: jest.fn(),
              getById: jest.fn(),
              update: jest.fn(),
            },
          },
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix(API_PREFIX);
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const legacyRoutes = [
      ['get', '/operational-events'],
      ['get', '/operational-areas'],
      ['get', '/recommended-actions'],
      ['post', '/intelligence/interpret'],
      ['get', '/intelligence/categories'],
      ['post', '/users/ensure'],
      ['patch', '/users/demo-user/onboarding/complete'],
    ] as const;

    it.each(legacyRoutes)(
      '%s %s responde 404 fuera del runtime',
      async (method, path) => {
        const server = request(app.getHttpServer());
        const target = `/${API_PREFIX}${path}`;

        if (method === 'get') {
          await server.get(target).expect(404);
          return;
        }
        if (method === 'post') {
          await server.post(target).send({}).expect(404);
          return;
        }
        await server.patch(target).send({}).expect(404);
      },
    );
  });
});
