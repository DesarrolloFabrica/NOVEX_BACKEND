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
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import configuration from '../../src/configuration/configuration';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import {
  RecommendationPriority,
  RecommendationSource,
  RecommendationStatus,
} from '../../src/common/enums/situation-recommendation.enums';
import { ROLE_PERMISSION_CODES } from '../../src/permissions/seeds/permissions.catalog.seed';
import { RbacService } from '../../src/rbac/rbac.service';
import { SituationRecommendationsController } from '../../src/situation-recommendations/situation-recommendations.controller';
import { SituationRecommendationsService } from '../../src/situation-recommendations/situation-recommendations.service';
import { SituationRecommendationsRepository } from '../../src/situation-recommendations/repositories/situation-recommendations.repository';
import { SituationTimelineService } from '../../src/situation-timeline/situation-timeline.service';
import { Situation } from '../../src/situations/entities/situation.entity';
import { SituationAccessService } from '../../src/situations/situation-access.service';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';
import { User } from '../../src/users/entities/user.entity';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { SituationReportKind } from '../../src/common/enums/situation.enums';

/*
 * ESCENARIO SINTÉTICO de A1. Vive en esta suite (y no en un archivo compartido)
 * para que el PR de A1 se integre y se revierta sin depender de otro PR.
 *
 * Coordinaciones A, B y C. Cada situación cubre una vía de acceso que define
 * `OperationalScopeService`: coordinación responsable, coordinación afectada
 * (INTER), autoría fuera del área, autoría de un coordinador SIN coordinación y
 * registro de analista sin coordinación responsable. Los permisos de cada rol
 * salen del CATÁLOGO REAL (`ROLE_PERMISSION_CODES`).
 */
const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';
const COORD_C = 'c0000000-0000-4000-8000-00000000000c';

const USER_IDS = {
  coordA: '10000000-0000-4000-8000-0000000000a1',
  coordB: '10000000-0000-4000-8000-0000000000b1',
  coordNull: '10000000-0000-4000-8000-000000000001',
  analista: '10000000-0000-4000-8000-000000000002',
  director: '10000000-0000-4000-8000-000000000003',
  admin: '10000000-0000-4000-8000-000000000004',
  sinPermiso: '10000000-0000-4000-8000-000000000005',
} as const;

type ActorKey = keyof typeof USER_IDS;
type CatalogRole = keyof typeof ROLE_PERMISSION_CODES;

function actor(
  key: ActorKey,
  roleCode: CatalogRole,
  coordinationId: string | null,
  permissions: string[] = [...ROLE_PERMISSION_CODES[roleCode]],
): AuthPayload {
  return {
    sub: USER_IDS[key],
    email: `${key}@test.novex.invalid`,
    roleId: `role-${roleCode.toLowerCase()}`,
    roleCode,
    coordinationId,
    permissions,
    status: UserStatus.ACTIVE,
  };
}

/** Autorización VIGENTE de cada usuario (la que resuelve el servidor). */
const ACTORS: Record<ActorKey, AuthPayload> = {
  coordA: actor('coordA', 'COORDINADOR', COORD_A),
  coordB: actor('coordB', 'COORDINADOR', COORD_B),
  coordNull: actor('coordNull', 'COORDINADOR', null),
  analista: actor('analista', 'ANALISTA', null),
  director: actor('director', 'DIRECTOR', null),
  admin: actor('admin', 'ADMIN', null),
  // Coordinador cuyo permiso fue revocado en servidor (el JWT aún lo traería).
  sinPermiso: actor('sinPermiso', 'COORDINADOR', COORD_A, []),
};
const ACTOR_KEYS = Object.keys(ACTORS) as ActorKey[];

type SituationKey = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

const SITUATIONS: Record<
  SituationKey,
  {
    id: string;
    reportKind: SituationReportKind;
    coordinationId: string | null;
    affectedCoordinationId: string | null;
    createdByUserId: string;
  }
> = {
  // INTERNAL de A, reportado por su coordinador.
  S1: {
    id: '5a000000-0000-4000-8000-000000000001',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
  },
  // INTERNAL de B, reportado por su coordinador.
  S2: {
    id: '5a000000-0000-4000-8000-000000000002',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_B,
    createdByUserId: USER_IDS.coordB,
  },
  // INTER: responsable B, AFECTADA A.
  S3: {
    id: '5a000000-0000-4000-8000-000000000003',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordB,
  },
  // INTER: responsable B, afectada C, REPORTADO por el coordinador de A.
  S4: {
    id: '5a000000-0000-4000-8000-000000000004',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_C,
    createdByUserId: USER_IDS.coordA,
  },
  // INTER: responsable B, afectada C, reportado por el coordinador SIN área.
  S5: {
    id: '5a000000-0000-4000-8000-000000000005',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_C,
    createdByUserId: USER_IDS.coordNull,
  },
  // Registro de analista: sin coordinación responsable.
  S6: {
    id: '5a000000-0000-4000-8000-000000000006',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: null,
    affectedCoordinationId: null,
    createdByUserId: USER_IDS.analista,
  },
};
const SITUATION_KEYS = Object.keys(SITUATIONS) as SituationKey[];

/**
 * A1 · ALCANCE DE `/recommendations/:id` (GET y PATCH).
 *
 * Todo lo que decide la autorización es REAL: `JwtStrategy`, los guards
 * globales, `PermissionsGuard`, `OperationalScopeService`,
 * `SituationAccessService`, el `SituationRecommendationsService`, el
 * `ValidationPipe` y el `GlobalExceptionFilter` de producción. Solo se simulan
 * la persistencia (repositorios) y la resolución RBAC por usuario, que devuelve
 * los permisos del catálogo real.
 */

const API = 'api/v1';
const JWT_SECRET = 'a1-recommendations-scope-secret-minimum-length';

/** Recomendación N sobre la situación SN. */
const REC_IDS: Record<SituationKey, string> = {
  S1: 'ec000000-0000-4000-8000-000000000001',
  S2: 'ec000000-0000-4000-8000-000000000002',
  S3: 'ec000000-0000-4000-8000-000000000003',
  S4: 'ec000000-0000-4000-8000-000000000004',
  S5: 'ec000000-0000-4000-8000-000000000005',
  S6: 'ec000000-0000-4000-8000-000000000006',
};
const REC_MISSING = 'ec000000-0000-4000-8000-0000000000ff';
/** Recomendación cuya situación provoca un fallo inesperado de persistencia. */
const REC_BROKEN = 'ec000000-0000-4000-8000-0000000000ee';
const SITUATION_BROKEN = '5a000000-0000-4000-8000-0000000000ee';
const USER_MISSING = '10000000-0000-4000-8000-0000000000ff';

type Target = SituationKey | 'Rx';
const TARGETS: Target[] = [...SITUATION_KEYS, 'Rx'];
const recId = (target: Target) =>
  target === 'Rx' ? REC_MISSING : REC_IDS[target];

/*
 * MATRICES ESPERADAS (columnas: R1..R6 y Rx inexistente).
 *
 * LECTURA  = alcance de lectura de la situación (`assertSituationReadable`):
 *            coordinación responsable, coordinación afectada (INTER) o
 *            autoría. ANALISTA/DIRECTOR/ADMIN leen de forma institucional.
 * ESCRITURA = `requireOperableSituation`: además exige la coordinación
 *            RESPONSABLE y ser dueño (autor o coordinador de la responsable).
 *            Fuera de alcance → 404; propiedad denegada (ANALISTA) → 403.
 */
const GET_EXPECTED: Record<ActorKey, number[]> = {
  //          R1   R2   R3   R4   R5   R6   Rx
  coordA: [200, 404, 200, 200, 404, 404, 404],
  coordB: [404, 200, 200, 200, 200, 404, 404],
  // A2 (Fase 01A): un COORDINADOR sin coordinación no lee ningún caso, ni
  // siquiera el que reportó (S5). Antes: 200 por autoría.
  coordNull: [404, 404, 404, 404, 404, 404, 404],
  analista: [200, 200, 200, 200, 200, 200, 404],
  director: [200, 200, 200, 200, 200, 200, 404],
  admin: [200, 200, 200, 200, 200, 200, 404],
  sinPermiso: [403, 403, 403, 403, 403, 403, 403],
};

const PATCH_EXPECTED: Record<ActorKey, number[]> = {
  //          R1   R2   R3   R4   R5   R6   Rx
  coordA: [200, 404, 404, 404, 404, 404, 404],
  coordB: [404, 200, 200, 200, 200, 404, 404],
  coordNull: [404, 404, 404, 404, 404, 404, 404],
  analista: [403, 403, 403, 403, 403, 200, 404],
  director: [403, 403, 403, 403, 403, 403, 403],
  admin: [403, 403, 403, 403, 403, 403, 403],
  sinPermiso: [403, 403, 403, 403, 403, 403, 403],
};

function recommendationEntity(id: string, situationId: string) {
  return {
    id,
    situationId,
    title: 'Recomendación sintética',
    description: 'Descripción sintética',
    priority: RecommendationPriority.MEDIUM,
    status: RecommendationStatus.PENDING,
    generatedBy: RecommendationSource.MANUAL,
    assignedUserId: null,
    assignedUser: null,
    dueAt: null,
    completedAt: null,
    executionNotes: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  };
}

describe('A1 · alcance de /recommendations/:id', () => {
  let app: INestApplication<App>;
  let tokens: Record<ActorKey, string>;
  let recommendations: Map<string, ReturnType<typeof recommendationEntity>>;

  const recommendationsRepository = {
    findByIdWithRelations: jest.fn(),
    save: jest.fn(),
  };
  const situationsRepository = { findByIdWithRelations: jest.fn() };
  const usersRepository = { exist: jest.fn() };
  const situationEntityRepository = { exist: jest.fn() };
  const timelineService = { createEntry: jest.fn() };

  const resetData = () => {
    recommendations = new Map(
      SITUATION_KEYS.map((key) => [
        REC_IDS[key],
        recommendationEntity(REC_IDS[key], SITUATIONS[key].id),
      ]),
    );
    recommendations.set(
      REC_BROKEN,
      recommendationEntity(REC_BROKEN, SITUATION_BROKEN),
    );
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
      controllers: [SituationRecommendationsController],
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
        SituationRecommendationsService,
        {
          provide: SituationRecommendationsRepository,
          useValue: recommendationsRepository,
        },
        {
          provide: getRepositoryToken(Situation),
          useValue: situationEntityRepository,
        },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: SituationTimelineService, useValue: timelineService },
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
        ACTOR_KEYS.map(async (key) => {
          const actor = ACTORS[key];
          // El JWT conserva los permisos del ROL (snapshot de login); la
          // autorización vigente la resuelve el servidor en cada petición.
          const roleCode = actor.roleCode as keyof typeof ROLE_PERMISSION_CODES;
          return [
            key,
            await jwt.signAsync({
              ...actor,
              permissions: [...ROLE_PERMISSION_CODES[roleCode]],
            }),
          ];
        }),
      ),
    ) as Record<ActorKey, string>;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetData();

    recommendationsRepository.findByIdWithRelations.mockImplementation(
      (id: string) => Promise.resolve(recommendations.get(id) ?? null),
    );
    recommendationsRepository.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    situationsRepository.findByIdWithRelations.mockImplementation(
      (id: string) => {
        if (id === SITUATION_BROKEN) {
          return Promise.reject(new Error('fallo inesperado de persistencia'));
        }
        const fixture = Object.values(SITUATIONS).find((s) => s.id === id);
        return Promise.resolve(fixture ? { ...fixture } : null);
      },
    );
    usersRepository.exist.mockResolvedValue(false);
    timelineService.createEntry.mockResolvedValue({});
  });

  const get = (actor: ActorKey, id: string) =>
    request(app.getHttpServer())
      .get(`/${API}/recommendations/${id}`)
      .set('Authorization', `Bearer ${tokens[actor]}`);

  const patch = (actor: ActorKey, id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/${API}/recommendations/${id}`)
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .send(body);

  const expectNoWrites = () => {
    expect(recommendationsRepository.save).not.toHaveBeenCalled();
    expect(timelineService.createEntry).not.toHaveBeenCalled();
    expect(usersRepository.exist).not.toHaveBeenCalled();
  };

  describe('matriz de LECTURA (GET)', () => {
    const cases = ACTOR_KEYS.flatMap((actor) =>
      TARGETS.map((target, index) => ({
        actor,
        target,
        expected: GET_EXPECTED[actor][index],
      })),
    );

    it.each(cases)(
      '$actor GET $target → $expected',
      async ({ actor, target, expected }) => {
        const response = await get(actor, recId(target));
        expect(response.status).toBe(expected);
        if (expected === 200) {
          expect(response.body).toMatchObject({
            id: recId(target),
            situationId: SITUATIONS[target as SituationKey].id,
          });
        }
        // Leer nunca escribe.
        expectNoWrites();
      },
    );
  });

  describe('matriz de MODIFICACIÓN (PATCH)', () => {
    const cases = ACTOR_KEYS.flatMap((actor) =>
      TARGETS.map((target, index) => ({
        actor,
        target,
        expected: PATCH_EXPECTED[actor][index],
      })),
    );

    it.each(cases)(
      '$actor PATCH $target → $expected',
      async ({ actor, target, expected }) => {
        const response = await patch(actor, recId(target), {
          title: 'Título actualizado',
        });
        expect(response.status).toBe(expected);

        if (expected === 200) {
          expect(response.body).toMatchObject({
            id: recId(target),
            title: 'Título actualizado',
          });
          expect(recommendationsRepository.save).toHaveBeenCalledTimes(1);
          expect(timelineService.createEntry).toHaveBeenCalledTimes(1);
        } else {
          // Un PATCH denegado no escribe NADA.
          expectNoWrites();
          expect(recommendations.get(recId(target))?.title).not.toBe(
            'Título actualizado',
          );
        }
      },
    );
  });

  describe('uniformidad de las respuestas 404', () => {
    it('el mismo id responde IGUAL si está fuera de alcance que si no existe (GET)', async () => {
      const outOfScope = await get('coordA', REC_IDS.S2);
      recommendations.delete(REC_IDS.S2);
      const missing = await get('coordA', REC_IDS.S2);

      expect(outOfScope.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(outOfScope.body).toEqual(missing.body);
      expect(outOfScope.text).toBe(missing.text);
    });

    it('el mismo id responde IGUAL si está fuera de alcance que si no existe (PATCH)', async () => {
      const body = { title: 'x' };
      const outOfScope = await patch('coordA', REC_IDS.S2, body);
      recommendations.delete(REC_IDS.S2);
      const missing = await patch('coordA', REC_IDS.S2, body);

      expect(outOfScope.status).toBe(404);
      expect(outOfScope.text).toBe(missing.text);
    });

    it('el 404 fuera de alcance coincide en forma con el de un id inexistente', async () => {
      const outOfScope = await get('coordA', REC_IDS.S2);
      const missing = await get('coordA', REC_MISSING);

      const normalize = (text: string, id: string): unknown =>
        JSON.parse(text.split(id).join('<id>'));
      expect(normalize(outOfScope.text, REC_IDS.S2)).toEqual(
        normalize(missing.text, REC_MISSING),
      );
    });

    it('el 404 fuera de alcance no revela la situación ni su coordinación', async () => {
      for (const target of ['S2', 'S5', 'S6'] as const) {
        const response = await get('coordA', REC_IDS[target]);
        expect(response.status).toBe(404);
        expect(response.text).not.toContain(SITUATIONS[target].id);
        expect(response.text).not.toMatch(/situaci[oó]n/i);
      }
    });

    it('la escritura denegada por alcance tampoco revela la situación', async () => {
      // coordA puede LEER R3 (afectada) y R4 (autor), pero no operarlas.
      for (const target of ['S3', 'S4'] as const) {
        const response = await patch('coordA', REC_IDS[target], { title: 'x' });
        expect(response.status).toBe(404);
        expect(response.text).not.toContain(SITUATIONS[target].id);
      }
    });
  });

  describe('orden de validaciones y assignedUserId', () => {
    it('no valida assignedUserId de una recomendación fuera de alcance (sin oráculo de usuarios)', async () => {
      const response = await patch('coordA', REC_IDS.S2, {
        assignedUserId: USER_MISSING,
      });

      expect(response.status).toBe(404);
      expect(response.text).toContain('Recomendación no encontrada');
      expect(response.text).not.toContain('Usuario');
      expectNoWrites();
    });

    it('conserva la validación de assignedUserId cuando el acceso está autorizado', async () => {
      const response = await patch('coordA', REC_IDS.S1, {
        assignedUserId: USER_MISSING,
      });

      expect(response.status).toBe(404);
      expect(response.text).toContain('Usuario no encontrado');
      expect(usersRepository.exist).toHaveBeenCalledTimes(1);
      expect(recommendationsRepository.save).not.toHaveBeenCalled();
    });

    it('un body inválido se rechaza con 400 antes de consultar la base', async () => {
      const response = await patch('coordA', REC_IDS.S2, { campoExtra: 1 });

      expect(response.status).toBe(400);
      expect(
        recommendationsRepository.findByIdWithRelations,
      ).not.toHaveBeenCalled();
      expect(situationsRepository.findByIdWithRelations).not.toHaveBeenCalled();
    });

    it('el 403 por falta de permiso ocurre antes de consultar la base', async () => {
      await get('sinPermiso', REC_IDS.S1).expect(403);
      await patch('director', REC_IDS.S1, { title: 'x' }).expect(403);

      expect(
        recommendationsRepository.findByIdWithRelations,
      ).not.toHaveBeenCalled();
      expect(situationsRepository.findByIdWithRelations).not.toHaveBeenCalled();
    });

    it('el 403 por propiedad solo lo recibe quien ya puede leer el caso (ANALISTA)', async () => {
      const response = await patch('analista', REC_IDS.S1, { title: 'x' });
      expect(response.status).toBe(403);
      await get('analista', REC_IDS.S1).expect(200);
    });
  });

  describe('autenticación y formato', () => {
    it('rechaza solicitudes anónimas con 401', async () => {
      await request(app.getHttpServer())
        .get(`/${API}/recommendations/${REC_IDS.S1}`)
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/${API}/recommendations/${REC_IDS.S1}`)
        .send({ title: 'x' })
        .expect(401);
      expectNoWrites();
    });

    it('rechaza un UUID inválido con 400', async () => {
      await get('coordA', 'no-es-un-uuid').expect(400);
      await patch('coordA', 'no-es-un-uuid', { title: 'x' }).expect(400);
      expect(
        recommendationsRepository.findByIdWithRelations,
      ).not.toHaveBeenCalled();
    });
  });

  describe('errores inesperados', () => {
    it('un fallo interno al comprobar el alcance NO se convierte en 404', async () => {
      // El filtro registra el 500 en el log estructurado; aquí es esperado.
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      const read = await get('analista', REC_BROKEN);
      const write = await patch('coordA', REC_BROKEN, { title: 'x' });
      expect(logged).toHaveBeenCalledTimes(2);
      logged.mockRestore();

      for (const response of [read, write]) {
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
          statusCode: 500,
          message: 'Error interno del servidor.',
        });
      }
      expectNoWrites();
    });
  });

  describe('invariante del catálogo', () => {
    it('todo rol con SITUATIONS_UPDATE tiene SITUATIONS_VIEW (el 403 de permiso nunca llega tras consultar la base)', () => {
      for (const [role, permissions] of Object.entries(ROLE_PERMISSION_CODES)) {
        if (permissions.includes('SITUATIONS_UPDATE')) {
          expect({
            role,
            view: permissions.includes('SITUATIONS_VIEW'),
          }).toEqual({
            role,
            view: true,
          });
        }
      }
    });
  });
});
