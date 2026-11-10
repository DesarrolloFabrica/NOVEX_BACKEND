import {
  INestApplication,
  NotFoundException,
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
import { AuditLogService } from '../../src/audit/audit-log.service';
import { AuthorizationEnrichmentGuard } from '../../src/auth/guards/authorization-enrichment.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { EvidenceType } from '../../src/common/enums/situation-evidence.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../../src/common/enums/situation.enums';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { ROLE_PERMISSION_CODES } from '../../src/permissions/seeds/permissions.catalog.seed';
import { RbacService } from '../../src/rbac/rbac.service';
import { SituationEvidenceRepository } from '../../src/situation-evidence/repositories/situation-evidence.repository';
import { SituationEvidenceController } from '../../src/situation-evidence/situation-evidence.controller';
import { SituationEvidenceService } from '../../src/situation-evidence/situation-evidence.service';
import { EvidenceStorageService } from '../../src/situation-evidence/storage/evidence-storage.service';
import { SituationTimelineService } from '../../src/situation-timeline/situation-timeline.service';
import { SituationAccessService } from '../../src/situations/situation-access.service';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';

/*
 * FASE 01B.2 · Lectura de evidencias RETIRADAS.
 *
 * Defecto corregido: `GET /situations/:id/evidences/:evidenceId` exigía solo
 * leer el caso y devolvía una evidencia retirada con su motivo. Ahora una
 * retirada exige lo mismo que `?includeRetired=true` (ADMIN, o poder operar
 * el caso) y, sin ese permiso, responde 404 como si no existiera.
 *
 * Es REAL todo lo que decide la autorización: JwtStrategy, guards globales,
 * PermissionsGuard, OperationalScopeService, SituationAccessService, el
 * controlador y el SERVICIO de evidencias (donde vive la regla). Se simulan la
 * persistencia y la resolución RBAC (con los permisos del catálogo real).
 */

const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';
const COORD_GENERAL = 'c0000000-0000-4000-8000-000000000099';

const USER_IDS = {
  coordA: '10000000-0000-4000-8000-0000000000a1',
  coordB: '10000000-0000-4000-8000-0000000000b1',
  coordNull: '10000000-0000-4000-8000-000000000001',
  analista: '10000000-0000-4000-8000-000000000002',
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
  // INTERNAL de A, abierto, reportado por coordA.
  S1: {
    id: '5e000000-0000-4000-8000-000000000001',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de B, en atención.
  S2: {
    id: '5e000000-0000-4000-8000-000000000002',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_B,
    createdByUserId: USER_IDS.coordB,
    status: SituationStatus.IN_PROGRESS,
  },
  // INTER responsable B, afectada A, reportado por coordA (A lo LEE por
  // autoría, pero no lo opera: está fuera de su alcance).
  S3: {
    id: '5e000000-0000-4000-8000-000000000003',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_B,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de Coordinación General, reportado por el ANALISTA.
  S4: {
    id: '5e000000-0000-4000-8000-000000000004',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_GENERAL,
    affectedCoordinationId: COORD_GENERAL,
    createdByUserId: USER_IDS.analista,
    status: SituationStatus.OPEN,
  },
  // INTERNAL de A, CERRADO: el historial sigue siendo legible por su dueña.
  S5: {
    id: '5e000000-0000-4000-8000-000000000005',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: USER_IDS.coordA,
    status: SituationStatus.CLOSED,
  },
  // INTER responsable A, afectada B, reportado por coordB.
  S6: {
    id: '5e000000-0000-4000-8000-000000000006',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_B,
    createdByUserId: USER_IDS.coordB,
    status: SituationStatus.OPEN,
  },
};
const SITUATION_KEYS = Object.keys(SITUATIONS) as SituationKey[];

const RETIREMENT_REASON = 'Motivo-secreto-de-retiro: duplicada por error';

/** Una evidencia activa y una retirada por situación (ids deterministas). */
const evidenceId = (situation: SituationKey, retired: boolean) =>
  `e${retired ? '1' : '0'}000000-0000-4000-8000-00000000000${situation.slice(1)}`;

function evidenceRow(situation: SituationKey, retired: boolean) {
  return {
    id: evidenceId(situation, retired),
    situationId: SITUATIONS[situation].id,
    uploadedByUserId: SITUATIONS[situation].createdByUserId,
    uploadedByUser: { fullName: 'Autor de prueba' },
    type: EvidenceType.NOTE,
    title: retired ? 'Retirada' : 'Activa',
    description: 'detalle',
    fileName: null,
    storagePath: null,
    mimeType: null,
    fileSize: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    retiredAt: retired ? new Date('2026-11-02T12:00:00Z') : null,
    retiredByUserId: retired ? SITUATIONS[situation].createdByUserId : null,
    retirementReason: retired ? RETIREMENT_REASON : null,
  };
}

/*
 * MATRICES ESPERADAS (columnas S1..S6).
 *   READ        = leer el caso (consulta de evidencia ACTIVA).
 *   RETIRED_GET = consulta por id de una RETIRADA: 200 solo con el permiso de
 *                 `includeRetired`; sin él, 404 (no revela existencia).
 *   RETIRED_LIST= `?includeRetired=true`: 404 fuera de alcance, 403 sin
 *                 propiedad del caso (contrato previo, sin cambios).
 */
const READ_EXPECTED: Record<ActorKey, number[]> = {
  //          S1   S2   S3   S4   S5   S6
  coordA: [200, 404, 200, 404, 200, 200],
  coordB: [404, 200, 200, 404, 404, 200],
  coordNull: [404, 404, 404, 404, 404, 404],
  analista: [200, 200, 200, 200, 200, 200],
  director: [200, 200, 200, 200, 200, 200],
  admin: [200, 200, 200, 200, 200, 200],
};

const RETIRED_GET_EXPECTED: Record<ActorKey, number[]> = {
  //          S1   S2   S3   S4   S5   S6
  coordA: [200, 404, 404, 404, 200, 200],
  coordB: [404, 200, 200, 404, 404, 404],
  coordNull: [404, 404, 404, 404, 404, 404],
  analista: [404, 404, 404, 200, 404, 404],
  director: [404, 404, 404, 404, 404, 404],
  admin: [200, 200, 200, 200, 200, 200],
};

const RETIRED_LIST_EXPECTED: Record<ActorKey, number[]> = {
  //          S1   S2   S3   S4   S5   S6
  coordA: [200, 404, 404, 404, 200, 200],
  coordB: [404, 200, 200, 404, 404, 404],
  coordNull: [404, 404, 404, 404, 404, 404],
  analista: [403, 403, 403, 200, 403, 403],
  director: [403, 403, 403, 403, 403, 403],
  admin: [200, 200, 200, 200, 200, 200],
};

const API = 'api/v1';
const JWT_SECRET = 'fase01b2-evidence-retired-access-secret-min';

describe('Fase 01B.2 · acceso a evidencias retiradas (HTTP)', () => {
  let app: INestApplication<App>;
  let tokens: Record<ActorKey, string>;

  const situationsRepository = { findByIdWithRelations: jest.fn() };
  const evidenceRepository = {
    findBySituationId: jest.fn(),
    findByIdAndSituationId: jest.fn(),
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
      controllers: [SituationEvidenceController],
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
        SituationEvidenceService,
        { provide: SituationsRepository, useValue: situationsRepository },
        { provide: SituationEvidenceRepository, useValue: evidenceRepository },
        { provide: EvidenceStorageService, useValue: {} },
        { provide: SituationTimelineService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
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
    const rows = SITUATION_KEYS.flatMap((key) => [
      evidenceRow(key, false),
      evidenceRow(key, true),
    ]);
    evidenceRepository.findByIdAndSituationId.mockImplementation(
      (id: string, situationId: string) =>
        Promise.resolve(
          rows.find((r) => r.id === id && r.situationId === situationId) ??
            null,
        ),
    );
    evidenceRepository.findBySituationId.mockImplementation(
      (situationId: string, options: { includeRetired?: boolean }) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              r.situationId === situationId &&
              (options?.includeRetired === true || r.retiredAt === null),
          ),
        ),
    );
  });

  const cases = (expected: Record<ActorKey, number[]>) =>
    ACTOR_KEYS.flatMap((who) =>
      SITUATION_KEYS.map((target, index) => ({
        who,
        target,
        status: expected[who][index],
      })),
    );

  const get = (who: ActorKey, path: string) =>
    request(app.getHttpServer())
      .get(`/${API}/situations/${path}`)
      .set('Authorization', `Bearer ${tokens[who]}`);

  describe('GET /situations/:id/evidences/:evidenceId (ACTIVA)', () => {
    it.each(cases(READ_EXPECTED))(
      '$who consulta la activa de $target → $status',
      async ({ who, target, status }) => {
        const response = await get(
          who,
          `${SITUATIONS[target].id}/evidences/${evidenceId(target, false)}`,
        );
        expect(response.status).toBe(status);
        if (status === 200) {
          expect(response.body).toMatchObject({
            status: 'ACTIVE',
            retirement: null,
          });
        }
      },
    );
  });

  describe('GET /situations/:id/evidences/:evidenceId (RETIRADA, acceso directo por id)', () => {
    it.each(cases(RETIRED_GET_EXPECTED))(
      '$who consulta la retirada de $target → $status',
      async ({ who, target, status }) => {
        const response = await get(
          who,
          `${SITUATIONS[target].id}/evidences/${evidenceId(target, true)}`,
        );
        expect(response.status).toBe(status);
        if (status === 200) {
          expect(response.body).toMatchObject({
            status: 'RETIRED',
            retirement: { reason: RETIREMENT_REASON },
          });
        } else {
          // Sin permiso: ni el motivo ni el estado de retiro se filtran.
          const raw = JSON.stringify(response.body);
          expect(raw).not.toContain('Motivo-secreto');
          expect(raw).not.toContain('RETIRED');
        }
      },
    );

    it('la misma respuesta 404 que una evidencia inexistente (no revela existencia)', async () => {
      const retired = await get(
        'director',
        `${SITUATIONS.S1.id}/evidences/${evidenceId('S1', true)}`,
      );
      const missing = await get(
        'director',
        `${SITUATIONS.S1.id}/evidences/e9000000-0000-4000-8000-000000000001`,
      );
      expect(retired.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(Object.keys(retired.body as object).sort()).toEqual(
        Object.keys(missing.body as object).sort(),
      );
    });

    it('una evidencia de otro caso no se lee cambiando el :id de la ruta', async () => {
      // coordA opera S1, pero la evidencia retirada pertenece a S2 (de B).
      const response = await get(
        'coordA',
        `${SITUATIONS.S1.id}/evidences/${evidenceId('S2', true)}`,
      );
      expect(response.status).toBe(404);
    });
  });

  describe('GET /situations/:id/evidences?includeRetired=true', () => {
    it.each(cases(RETIRED_LIST_EXPECTED))(
      '$who pide el historial de $target → $status',
      async ({ who, target, status }) => {
        const response = await get(
          who,
          `${SITUATIONS[target].id}/evidences?includeRetired=true`,
        );
        expect(response.status).toBe(status);
        if (status === 200) {
          expect(response.body).toMatchObject({ total: 2 });
        } else {
          expect(JSON.stringify(response.body)).not.toContain('Motivo-secreto');
        }
      },
    );

    it.each(cases(READ_EXPECTED))(
      '$who lista sin includeRetired $target → $status, solo activas',
      async ({ who, target, status }) => {
        const response = await get(who, `${SITUATIONS[target].id}/evidences`);
        expect(response.status).toBe(status);
        if (status === 200) {
          expect(response.body).toMatchObject({ total: 1 });
          expect(JSON.stringify(response.body)).not.toContain('Motivo-secreto');
        }
      },
    );
  });
});

/*
 * Capa de SERVICIO: la regla no depende del controlador. Cualquier consumidor
 * que llame a `getById` / `findBySituation` sin pasar por HTTP recibe la misma
 * autorización.
 */
describe('Fase 01B.2 · SituationEvidenceService aplica la autorización', () => {
  const situation = SITUATIONS.S1;
  const retiredRow = evidenceRow('S1', true);
  const activeRow = evidenceRow('S1', false);

  function service() {
    const situations = {
      findByIdWithRelations: jest.fn().mockResolvedValue({ ...situation }),
    };
    const evidences = {
      findByIdAndSituationId: jest.fn((id: string) =>
        Promise.resolve(
          id === retiredRow.id
            ? retiredRow
            : id === activeRow.id
              ? activeRow
              : null,
        ),
      ),
      findBySituationId: jest.fn().mockResolvedValue([activeRow, retiredRow]),
    };
    const scope = new OperationalScopeService();
    return {
      evidences,
      svc: new SituationEvidenceService(
        evidences as never,
        new SituationAccessService(scope, situations as never),
        {} as never,
        {} as never,
        {} as never,
        scope,
      ),
    };
  }

  it('getById de una retirada: 404 para lectores sin permiso de historial', async () => {
    const { svc } = service();
    for (const who of [
      'director',
      'analista',
      'coordB',
      'coordNull',
    ] as const) {
      await expect(
        svc.getById(situation.id, retiredRow.id, ACTORS[who]),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('getById de una retirada: visible con motivo para quien opera y para ADMIN', async () => {
    const { svc } = service();
    for (const who of ['coordA', 'admin'] as const) {
      const evidence = await svc.getById(
        situation.id,
        retiredRow.id,
        ACTORS[who],
      );
      expect(evidence.retirement?.reason).toBe(RETIREMENT_REASON);
    }
  });

  it('getById de una activa: basta con leer el caso', async () => {
    const { svc } = service();
    const evidence = await svc.getById(
      situation.id,
      activeRow.id,
      ACTORS.director,
    );
    expect(evidence.status).toBe('ACTIVE');
  });

  it('findBySituation con includeRetired: rechaza sin consultar el historial', async () => {
    const { svc, evidences } = service();
    await expect(
      svc.findBySituation(situation.id, ACTORS.director, {
        includeRetired: true,
      }),
    ).rejects.toThrow();
    await expect(
      svc.findBySituation(situation.id, ACTORS.coordB, {
        includeRetired: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(evidences.findBySituationId).not.toHaveBeenCalled();
  });

  it('findBySituation por defecto pide solo activas', async () => {
    const { svc, evidences } = service();
    await svc.findBySituation(situation.id, ACTORS.director);
    expect(evidences.findBySituationId).toHaveBeenCalledWith(situation.id, {
      includeRetired: false,
    });
  });
});
