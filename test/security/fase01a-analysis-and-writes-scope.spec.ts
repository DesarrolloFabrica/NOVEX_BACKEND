import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import configuration from '../../src/configuration/configuration';
import { AIOrchestrationController } from '../../src/ai-orchestration/ai-orchestration.controller';
import { AIOrchestrator } from '../../src/ai-orchestration/ai-orchestrator.service';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { UserStatus } from '../../src/common/enums/identity.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../../src/common/enums/situation.enums';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { ROLE_PERMISSION_CODES } from '../../src/permissions/seeds/permissions.catalog.seed';
import { RbacService } from '../../src/rbac/rbac.service';
import { SituationRecommendationsBySituationController } from '../../src/situation-recommendations/situation-recommendations.controller';
import { SituationRecommendationsService } from '../../src/situation-recommendations/situation-recommendations.service';
import { SituationAccessService } from '../../src/situations/situation-access.service';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';

/*
 * FASE 01A · M1 y A2 en las dos escrituras que antes usaban la puerta de
 * LECTURA: `POST /situations/:id/analyze` y `POST /situations/:id/recommendations`.
 *
 * Todo lo que decide la autorización es REAL (JwtStrategy, guards globales,
 * PermissionsGuard, OperationalScopeService, SituationAccessService,
 * ValidationPipe, GlobalExceptionFilter). Se simulan la persistencia, la
 * resolución RBAC por usuario (con los permisos del CATÁLOGO real) y el trabajo
 * posterior a la autorización (orquestador IA y servicio de recomendaciones):
 * aquí solo importa si se llega a ellos.
 *
 * Decisiones aprobadas que fija esta matriz:
 *   - ANALISTA analiza CUALQUIER situación activa (lectura institucional), pero
 *     crear recomendaciones manuales exige operar el caso (ser su autor).
 *   - COORDINADOR analiza y recomienda solo en su coordinación RESPONSABLE; ser
 *     la afectada o el autor de un caso de otra área no basta.
 *   - CLOSED no admite ni análisis ni recomendaciones (409, después del alcance).
 *   - COORDINADOR sin coordinación no opera nada (A2).
 */

const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';
const COORD_GENERAL = 'c0000000-0000-4000-8000-000000000099';

const USER_IDS = {
  coordA: '10000000-0000-4000-8000-0000000000a1',
  coordB: '10000000-0000-4000-8000-0000000000b1',
  coordNull: '10000000-0000-4000-8000-000000000001',
  analista: '10000000-0000-4000-8000-000000000002',
  analista2: '10000000-0000-4000-8000-000000000006',
  director: '10000000-0000-4000-8000-000000000003',
  admin: '10000000-0000-4000-8000-000000000004',
} as const;

type ActorKey = keyof typeof USER_IDS;
type CatalogRole = keyof typeof ROLE_PERMISSION_CODES;

function actor(
  key: ActorKey,
  roleCode: CatalogRole,
  coordinationId: string | null,
): AuthPayload {
  return {
    sub: USER_IDS[key],
    email: `${key}@test.novex.invalid`,
    roleId: `role-${roleCode.toLowerCase()}`,
    roleCode,
    coordinationId,
    permissions: [...ROLE_PERMISSION_CODES[roleCode]],
    status: UserStatus.ACTIVE,
  };
}

const ACTORS: Record<ActorKey, AuthPayload> = {
  coordA: actor('coordA', 'COORDINADOR', COORD_A),
  coordB: actor('coordB', 'COORDINADOR', COORD_B),
  coordNull: actor('coordNull', 'COORDINADOR', null),
  analista: actor('analista', 'ANALISTA', null),
  analista2: actor('analista2', 'ANALISTA', null),
  director: actor('director', 'DIRECTOR', null),
  admin: actor('admin', 'ADMIN', null),
};
const ACTOR_KEYS = Object.keys(ACTORS) as ActorKey[];

type SituationKey = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

const SITUATIONS: Record<
  SituationKey,
  {
    id: string;
    reportKind: SituationReportKind;
    coordinationId: string;
    affectedCoordinationId: string;
    createdByUserId: string;
    status: SituationStatus;
  }
> = {
  // INTERNAL de A, abierto.
  S1: {
    id: '5b000000-0000-4000-8000-000000000001',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de B, en atención.
  S2: {
    id: '5b000000-0000-4000-8000-000000000002',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_B,
    createdByUserId: USER_IDS.coordB,
    status: SituationStatus.IN_PROGRESS,
  },
  // INTER responsable B, AFECTADA A, reportado desde A.
  S3: {
    id: '5b000000-0000-4000-8000-000000000003',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de Coordinación General, reportado por el ANALISTA.
  S4: {
    id: '5b000000-0000-4000-8000-000000000004',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_GENERAL,
    affectedCoordinationId: COORD_GENERAL,
    createdByUserId: USER_IDS.analista,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de A, CERRADO.
  S5: {
    id: '5b000000-0000-4000-8000-000000000005',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.CLOSED,
  },
  // INTER responsable A, afectada B, reportado desde B.
  S6: {
    id: '5b000000-0000-4000-8000-000000000006',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_B,
    createdByUserId: USER_IDS.coordB,
    status: SituationStatus.OPEN,
  },
};
const SITUATION_KEYS = Object.keys(SITUATIONS) as SituationKey[];
const MISSING_ID = '5b000000-0000-4000-8000-0000000000ff';

type Target = SituationKey | 'Sx';
const TARGETS: Target[] = [...SITUATION_KEYS, 'Sx'];
const targetId = (target: Target) =>
  target === 'Sx' ? MISSING_ID : SITUATIONS[target].id;

/*
 * MATRICES ESPERADAS (columnas S1..S6 y Sx inexistente).
 *   201 = llega al trabajo · 404 = fuera de alcance o inexistente
 *   403 = sin permiso de rol, sin propiedad o sin coordinación (A2)
 *   409 = SITUATION_CLOSED (solo tras superar el alcance)
 */
const ANALYZE_EXPECTED: Record<ActorKey, number[]> = {
  //            S1   S2   S3   S4   S5   S6   Sx
  coordA: [201, 404, 404, 404, 409, 201, 404],
  coordB: [404, 201, 201, 404, 404, 404, 404],
  coordNull: [403, 403, 403, 403, 403, 403, 403],
  analista: [201, 201, 201, 201, 409, 201, 404],
  analista2: [201, 201, 201, 201, 409, 201, 404],
  director: [403, 403, 403, 403, 403, 403, 403],
  admin: [403, 403, 403, 403, 403, 403, 403],
};

const RECOMMEND_EXPECTED: Record<ActorKey, number[]> = {
  //            S1   S2   S3   S4   S5   S6   Sx
  coordA: [201, 404, 404, 404, 409, 201, 404],
  coordB: [404, 201, 201, 404, 404, 404, 404],
  coordNull: [404, 404, 404, 404, 404, 404, 404],
  analista: [403, 403, 403, 201, 403, 403, 404],
  analista2: [403, 403, 403, 403, 403, 403, 404],
  director: [403, 403, 403, 403, 403, 403, 403],
  admin: [403, 403, 403, 403, 403, 403, 403],
};

const API = 'api/v1';
const JWT_SECRET = 'fase01a-analysis-and-writes-scope-secret-min';

describe('Fase 01A · alcance de análisis IA y recomendaciones manuales', () => {
  let app: INestApplication<App>;
  let tokens: Record<ActorKey, string>;

  const situationsRepository = { findByIdWithRelations: jest.fn() };
  const orchestrator = { execute: jest.fn(), getPersistedAnalysis: jest.fn() };
  const recommendationsService = {
    createManualRecommendation: jest.fn(),
    findBySituation: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.DB_PASSWORD = 'test-db-password';

    const bySub = new Map(
      ACTOR_KEYS.map((key) => [ACTORS[key].sub, ACTORS[key]]),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          ignoreEnvFile: true,
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [
        AIOrchestrationController,
        SituationRecommendationsBySituationController,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: AuthorizationEnrichmentGuard },
        PermissionsGuard,
        {
          provide: RbacService,
          useValue: {
            resolveActiveAuthorization: (sub: string) => {
              const found = bySub.get(sub);
              return found
                ? Promise.resolve({
                    ...found,
                    permissions: [...found.permissions],
                  })
                : Promise.reject(
                    new UnauthorizedException('Sesión no válida.'),
                  );
            },
          },
        },
        OperationalScopeService,
        SituationAccessService,
        { provide: SituationsRepository, useValue: situationsRepository },
        { provide: AIOrchestrator, useValue: orchestrator },
        {
          provide: SituationRecommendationsService,
          useValue: recommendationsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    const jwt = moduleFixture.get(JwtService);
    tokens = Object.fromEntries(
      await Promise.all(
        ACTOR_KEYS.map(async (key) => [
          key,
          await jwt.signAsync({ ...ACTORS[key] }),
        ]),
      ),
    ) as Record<ActorKey, string>;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    situationsRepository.findByIdWithRelations.mockImplementation(
      (id: string) => {
        const fixture = Object.values(SITUATIONS).find((s) => s.id === id);
        return Promise.resolve(fixture ? { ...fixture } : null);
      },
    );
    orchestrator.execute.mockResolvedValue({ situationId: 'ok' });
    recommendationsService.createManualRecommendation.mockResolvedValue({
      id: 'rec-ok',
    });
  });

  const cases = (expected: Record<ActorKey, number[]>) =>
    ACTOR_KEYS.flatMap((who) =>
      TARGETS.map((target, index) => ({
        who,
        target,
        status: expected[who][index],
      })),
    );

  describe('POST /situations/:id/analyze', () => {
    it.each(cases(ANALYZE_EXPECTED))(
      '$who analiza $target → $status',
      async ({ who, target, status }) => {
        const response = await request(app.getHttpServer())
          .post(`/${API}/situations/${targetId(target)}/analyze`)
          .set('Authorization', `Bearer ${tokens[who]}`);

        expect(response.status).toBe(status);
        if (status === 201) {
          expect(orchestrator.execute).toHaveBeenCalledTimes(1);
        } else {
          // Ni reclamo ni Gemini: el orquestador no se toca.
          expect(orchestrator.execute).not.toHaveBeenCalled();
        }
        if (status === 409) {
          expect(response.body).toMatchObject({ code: 'SITUATION_CLOSED' });
        }
        if (who === 'coordNull') {
          expect(response.body).toMatchObject({
            code: 'COORDINATION_REQUIRED',
          });
        }
      },
    );
  });

  describe('POST /situations/:id/recommendations', () => {
    const body = {
      title: 'Recomendación manual',
      description: 'Detalle',
      priority: 'MEDIUM',
    };

    it.each(cases(RECOMMEND_EXPECTED))(
      '$who recomienda en $target → $status',
      async ({ who, target, status }) => {
        const response = await request(app.getHttpServer())
          .post(`/${API}/situations/${targetId(target)}/recommendations`)
          .set('Authorization', `Bearer ${tokens[who]}`)
          .send(body);

        expect(response.status).toBe(status);
        if (status === 201) {
          expect(
            recommendationsService.createManualRecommendation,
          ).toHaveBeenCalledTimes(1);
        } else {
          expect(
            recommendationsService.createManualRecommendation,
          ).not.toHaveBeenCalled();
        }
      },
    );
  });
});
