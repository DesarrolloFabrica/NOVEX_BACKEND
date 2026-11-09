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
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { SituationSeverity } from '../../src/common/enums/situation.enums';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { CoordinationsRepository } from '../../src/coordinations/repositories/coordinations.repository';
import { OperationalOverviewController } from '../../src/operational-overview/operational-overview.controller';
import { OperationalOverviewService } from '../../src/operational-overview/operational-overview.service';
import {
  OperationalOverviewRepository,
  type ActiveSeverityRow,
  type IncomingDependencyRow,
} from '../../src/operational-overview/repositories/operational-overview.repository';
import { ROLE_PERMISSION_CODES } from '../../src/permissions/seeds/permissions.catalog.seed';
import { RbacService } from '../../src/rbac/rbac.service';

/*
 * FASE 01A · A2 en `GET /operational-overview`.
 *
 * Un COORDINADOR sin coordinación asignada recibe 403 COORDINATION_REQUIRED
 * ANTES de cualquier consulta operativa. ADMIN, DIRECTOR, ANALISTA y el
 * COORDINADOR con área siguen recibiendo el agregado institucional, con los
 * MISMOS estados de integridad y vidas para todos (la protección no altera el
 * cálculo). Guards, servicio y políticas reales; solo se simulan repositorios.
 */

const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';

type ActorKey =
  'admin' | 'director' | 'analista' | 'coordA' | 'coordNull' | 'sinPermiso';
type CatalogRole = keyof typeof ROLE_PERMISSION_CODES;

function actor(
  key: ActorKey,
  index: number,
  roleCode: CatalogRole,
  coordinationId: string | null,
  permissions: string[] = [...ROLE_PERMISSION_CODES[roleCode]],
): AuthPayload {
  return {
    sub: `20000000-0000-4000-8000-00000000000${index}`,
    email: `${key}@test.novex.invalid`,
    roleId: `role-${roleCode.toLowerCase()}`,
    roleCode,
    coordinationId,
    permissions,
    status: UserStatus.ACTIVE,
  };
}

const ACTORS: Record<ActorKey, AuthPayload> = {
  admin: actor('admin', 1, 'ADMIN', null),
  director: actor('director', 2, 'DIRECTOR', null),
  analista: actor('analista', 3, 'ANALISTA', null),
  coordA: actor('coordA', 4, 'COORDINADOR', COORD_A),
  coordNull: actor('coordNull', 5, 'COORDINADOR', null),
  // Coordinador cuyo permiso fue revocado en servidor.
  sinPermiso: actor('sinPermiso', 6, 'COORDINADOR', COORD_A, []),
};
const ACTOR_KEYS = Object.keys(ACTORS) as ActorKey[];

const EXPECTED_STATUS: Record<ActorKey, number> = {
  admin: 200,
  director: 200,
  analista: 200,
  coordA: 200,
  coordNull: 403,
  sinPermiso: 403,
};

/** A: un CRITICAL activo (CRÍTICO, 8 vidas). B: un INTER externo HIGH entrante. */
const SEVERITY_ROWS: ActiveSeverityRow[] = [
  { coordinationId: COORD_A, severity: SituationSeverity.CRITICAL, total: 1 },
];
const INCOMING_ROWS: IncomingDependencyRow[] = [
  {
    affectedCoordinationId: COORD_B,
    total: 1,
    criticalTotal: 0,
    externalLowTotal: 0,
    externalMediumTotal: 0,
    externalHighTotal: 1,
    externalCriticalTotal: 0,
  },
];

const CATALOG = [
  {
    id: COORD_A,
    code: 'coord-a',
    name: 'A',
    shortName: 'A',
    color: '#000',
    displayOrder: 1,
    isActive: true,
  },
  {
    id: COORD_B,
    code: 'coord-b',
    name: 'B',
    shortName: 'B',
    color: '#000',
    displayOrder: 2,
    isActive: true,
  },
];

const API = 'api/v1';
const JWT_SECRET = 'fase01a-overview-scope-secret-minimum-len';

interface OverviewBody {
  directionStatus: string;
  coordinations: Array<{
    id: string;
    status: string;
    lifePoints: number | null;
    activeProblemsCount: number;
  }>;
  code?: string;
}

describe('Fase 01A · alcance de GET /operational-overview', () => {
  let app: INestApplication<App>;
  let tokens: Record<ActorKey, string>;

  const coordinationsRepository = { findCatalog: jest.fn() };
  const overviewRepository = {
    aggregateActiveSituationsBySeverity: jest.fn(),
    aggregateAffectedCoordinations: jest.fn(),
    aggregateCancelledByCoordination: jest.fn().mockResolvedValue([]),
    aggregateIncomingDependencies: jest.fn(),
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
      controllers: [OperationalOverviewController],
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
        OperationalOverviewService,
        { provide: CoordinationsRepository, useValue: coordinationsRepository },
        {
          provide: OperationalOverviewRepository,
          useValue: overviewRepository,
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
    coordinationsRepository.findCatalog.mockResolvedValue(
      CATALOG.map((item) => ({ ...item })),
    );
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue(
      SEVERITY_ROWS,
    );
    overviewRepository.aggregateAffectedCoordinations.mockResolvedValue([]);
    overviewRepository.aggregateIncomingDependencies.mockResolvedValue(
      INCOMING_ROWS,
    );
  });

  const getOverview = (who: ActorKey) =>
    request(app.getHttpServer())
      .get(`/${API}/operational-overview`)
      .set('Authorization', `Bearer ${tokens[who]}`);

  const repositoryCalls = () =>
    coordinationsRepository.findCatalog.mock.calls.length +
    overviewRepository.aggregateActiveSituationsBySeverity.mock.calls.length +
    overviewRepository.aggregateAffectedCoordinations.mock.calls.length +
    overviewRepository.aggregateIncomingDependencies.mock.calls.length;

  it.each(ACTOR_KEYS.map((who) => ({ who, status: EXPECTED_STATUS[who] })))(
    '$who → $status',
    async ({ who, status }) => {
      const response = await getOverview(who);
      expect(response.status).toBe(status);
    },
  );

  it('un COORDINADOR sin coordinación recibe 403 COORDINATION_REQUIRED sin consultas operativas', async () => {
    const response = await getOverview('coordNull');

    expect(response.status).toBe(403);
    expect((response.body as OverviewBody).code).toBe('COORDINATION_REQUIRED');
    expect(repositoryCalls()).toBe(0);
  });

  it('la protección no altera integridad ni vidas: mismo resultado para todos los roles permitidos', async () => {
    const bodies = await Promise.all(
      (['admin', 'director', 'analista', 'coordA'] as const).map(
        async (who) => (await getOverview(who)).body as OverviewBody,
      ),
    );

    const pick = (body: OverviewBody) =>
      body.coordinations.map(
        ({ id, status, lifePoints, activeProblemsCount }) => ({
          id,
          status,
          lifePoints,
          activeProblemsCount,
        }),
      );

    for (const body of bodies) {
      expect(pick(body)).toEqual(pick(bodies[0]));
    }
    // Valores de referencia de las políticas vigentes.
    expect(pick(bodies[0])).toEqual([
      { id: COORD_A, status: 'CRITICO', lifePoints: 8, activeProblemsCount: 1 },
      { id: COORD_B, status: 'ALERTA', lifePoints: 8, activeProblemsCount: 0 },
    ]);
  });
});
