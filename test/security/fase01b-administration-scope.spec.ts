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
import { AuditLogService } from '../../src/audit/audit-log.service';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { UserStatus } from '../../src/common/enums/identity.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../../src/common/enums/situation.enums';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { Coordination } from '../../src/coordinations/entities/coordination.entity';
import { ROLE_PERMISSION_CODES } from '../../src/permissions/seeds/permissions.catalog.seed';
import { RbacService } from '../../src/rbac/rbac.service';
import { SituationTimelineService } from '../../src/situation-timeline/situation-timeline.service';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';
import { SituationAdministrationController } from '../../src/situations/situation-administration.controller';
import { SituationAdministrationService } from '../../src/situations/situation-administration.service';
import { SituationsService } from '../../src/situations/situations.service';

/*
 * FASE 01B.1 · MATRIZ HTTP de las acciones administrativas.
 *
 *   POST /situations/:id/cancellation            (SITUATIONS_CANCEL)
 *   POST /situations/:id/coordination-transfer   (SITUATIONS_TRANSFER)
 *
 * Guards, permisos del CATÁLOGO real, política de alcance, validación y
 * servicio administrativo son reales; solo se simula la persistencia.
 * Solo ADMIN ejecuta; el resto recibe 403 antes de leer la situación.
 */

const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';

type ActorKey =
  | 'admin'
  | 'director'
  | 'analista'
  | 'coordA'
  | 'coordNull'
  | 'adminSinPermiso';

function actor(
  index: number,
  roleCode: keyof typeof ROLE_PERMISSION_CODES,
  coordinationId: string | null,
  permissions: string[] = [...ROLE_PERMISSION_CODES[roleCode]],
): AuthPayload {
  return {
    sub: `30000000-0000-4000-8000-00000000000${index}`,
    email: `actor${index}@test.novex.invalid`,
    roleId: `role-${roleCode.toLowerCase()}`,
    roleCode,
    coordinationId,
    permissions,
    status: UserStatus.ACTIVE,
  };
}

const ACTORS: Record<ActorKey, AuthPayload> = {
  admin: actor(1, 'ADMIN', null),
  director: actor(2, 'DIRECTOR', null),
  analista: actor(3, 'ANALISTA', null),
  coordA: actor(4, 'COORDINADOR', COORD_A),
  coordNull: actor(5, 'COORDINADOR', null),
  // ADMIN cuyo permiso se revocó en servidor.
  adminSinPermiso: actor(
    6,
    'ADMIN',
    null,
    ROLE_PERMISSION_CODES.ADMIN.filter(
      (code) => code !== 'SITUATIONS_CANCEL' && code !== 'SITUATIONS_TRANSFER',
    ),
  ),
};
const ACTOR_KEYS = Object.keys(ACTORS) as ActorKey[];

type SituationKey = 'open' | 'inProgress' | 'closed' | 'cancelled';
const SITUATIONS: Record<
  SituationKey,
  { id: string; status: SituationStatus }
> = {
  open: {
    id: '5e000000-0000-4000-8000-000000000001',
    status: SituationStatus.OPEN,
  },
  inProgress: {
    id: '5e000000-0000-4000-8000-000000000002',
    status: SituationStatus.IN_PROGRESS,
  },
  closed: {
    id: '5e000000-0000-4000-8000-000000000003',
    status: SituationStatus.CLOSED,
  },
  cancelled: {
    id: '5e000000-0000-4000-8000-000000000004',
    status: SituationStatus.CANCELLED,
  },
};
const SITUATION_KEYS = Object.keys(SITUATIONS) as SituationKey[];

/** Columnas: open, inProgress, closed, cancelled. */
const EXPECTED: Record<ActorKey, number[]> = {
  admin: [201, 201, 409, 409],
  director: [403, 403, 403, 403],
  analista: [403, 403, 403, 403],
  coordA: [403, 403, 403, 403],
  coordNull: [403, 403, 403, 403],
  adminSinPermiso: [403, 403, 403, 403],
};

const API = 'api/v1';
const JWT_SECRET = 'fase01b-administration-scope-secret-min-len';

describe('Fase 01B.1 · matriz HTTP de anulación y traslado', () => {
  let app: INestApplication<App>;
  let tokens: Record<ActorKey, string>;

  const manager = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
  };
  const situationsRepository = {
    manager: {
      transaction: jest.fn(
        <T>(work: (m: typeof manager) => Promise<T>): Promise<T> =>
          work(manager),
      ),
    },
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
      controllers: [SituationAdministrationController],
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
        SituationAdministrationService,
        { provide: SituationsRepository, useValue: situationsRepository },
        {
          provide: SituationsService,
          useValue: { getById: jest.fn().mockResolvedValue({ ok: true }) },
        },
        {
          provide: SituationTimelineService,
          useValue: { createEntry: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: {
            record: jest.fn(),
            recordCritical: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: getRepositoryToken(Coordination), useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
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
    manager.findOne.mockImplementation(
      (entity: unknown, options: { where: { id: string } }) => {
        if (entity === Coordination) {
          return Promise.resolve({
            id: options.where.id,
            name: 'B',
            isActive: true,
          });
        }
        const fixture = Object.values(SITUATIONS).find(
          (s) => s.id === options.where.id,
        );
        return Promise.resolve(
          fixture
            ? {
                ...fixture,
                reportKind: SituationReportKind.INTERNAL,
                coordinationId: COORD_A,
                affectedCoordinationId: COORD_A,
              }
            : null,
        );
      },
    );
  });

  const cases = ACTOR_KEYS.flatMap((who) =>
    SITUATION_KEYS.map((target, index) => ({
      who,
      target,
      status: EXPECTED[who][index],
    })),
  );

  describe('POST /situations/:id/cancellation', () => {
    it.each(cases)(
      '$who anula $target → $status',
      async ({ who, target, status }) => {
        const response = await request(app.getHttpServer())
          .post(`/${API}/situations/${SITUATIONS[target].id}/cancellation`)
          .set('Authorization', `Bearer ${tokens[who]}`)
          .send({ reason: 'Reporte duplicado del caso anterior' });

        expect(response.status).toBe(status);
        if (status === 403) {
          // Ni siquiera se lee la situación.
          expect(manager.findOne).not.toHaveBeenCalled();
        }
        if (status !== 201) {
          expect(manager.update).not.toHaveBeenCalled();
        }
      },
    );

    it('rechaza un motivo corto (400) sin tocar la situación', async () => {
      const response = await request(app.getHttpServer())
        .post(`/${API}/situations/${SITUATIONS.open.id}/cancellation`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ reason: '  corto   ' });
      expect(response.status).toBe(400);
      expect(manager.findOne).not.toHaveBeenCalled();
    });
  });

  describe('POST /situations/:id/coordination-transfer', () => {
    it.each(cases)(
      '$who traslada $target → $status',
      async ({ who, target, status }) => {
        const response = await request(app.getHttpServer())
          .post(
            `/${API}/situations/${SITUATIONS[target].id}/coordination-transfer`,
          )
          .set('Authorization', `Bearer ${tokens[who]}`)
          .send({
            toCoordinationId: COORD_B,
            reason: 'Corresponde a otra coordinación',
          });

        expect(response.status).toBe(status);
        if (status !== 201) {
          expect(manager.update).not.toHaveBeenCalled();
        }
      },
    );

    it('rechaza campos no declarados (400)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/${API}/situations/${SITUATIONS.open.id}/coordination-transfer`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          toCoordinationId: COORD_B,
          reason: 'Corresponde a otra coordinación',
          affectedCoordinationId: COORD_B,
        });
      expect(response.status).toBe(400);
    });
  });
});
