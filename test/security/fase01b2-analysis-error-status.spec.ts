import {
  GatewayTimeoutException,
  INestApplication,
  ServiceUnavailableException,
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
import { DataSource } from 'typeorm';
import configuration from '../../src/configuration/configuration';
import { AIOrchestrationController } from '../../src/ai-orchestration/ai-orchestration.controller';
import { AIOrchestrator } from '../../src/ai-orchestration/ai-orchestrator.service';
import {
  MAX_PROMPT_CHARACTERS,
  PROMPT_TOO_LARGE_CODE,
  assertPromptWithinLimits,
} from '../../src/ai-prompt-engine/privacy/prompt-privacy';
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
import { SituationAccessService } from '../../src/situations/situation-access.service';
import { SituationsRepository } from '../../src/situations/repositories/situations.repository';

/*
 * FASE 01B.2 · Código HTTP de `POST /situations/:id/analyze` ante fallos.
 *
 * Defecto corregido: `assertPromptWithinLimits` lanza 422 `PROMPT_TOO_LARGE`,
 * pero el orquestador lo convertía en 503. Ahora:
 *   - prompt fuera de límites            → 422 PROMPT_TOO_LARGE (y Gemini no se llama);
 *   - indisponibilidad real del proveedor → 503 (sin cambios);
 *   - cualquier otro fallo interno        → 503 genérico, sin el mensaje interno.
 *
 * El ORQUESTADOR es real (también su manejo de errores), igual que la
 * autorización, el controlador y el filtro global. Se simulan la persistencia,
 * el motor de prompts y el proveedor: Gemini real nunca se invoca.
 */

const COORD_GENERAL = 'c0000000-0000-4000-8000-000000000099';
const ANALYST_ID = '10000000-0000-4000-8000-000000000002';
const SITUATION_ID = '5a000000-0000-4000-8000-000000000001';
const INTERNAL_SECRET =
  'connect ECONNREFUSED 10.20.30.40:5432 password=SuperSecreta user=novex_app';

const ANALYST: AuthPayload = {
  sub: ANALYST_ID,
  email: 'analista@test.novex.invalid',
  roleId: 'role-analista',
  roleCode: 'ANALISTA',
  coordinationId: null,
  permissions: [...ROLE_PERMISSION_CODES.ANALISTA],
  status: UserStatus.ACTIVE,
};

const API = 'api/v1';
const JWT_SECRET = 'fase01b2-analysis-error-status-secret-min';

describe('Fase 01B.2 · estado HTTP de los fallos del análisis IA', () => {
  let app: INestApplication<App>;
  let token: string;

  const situationsRepository = {
    findByIdWithRelations: jest.fn(),
    exist: jest.fn(),
  };
  const promptEngine = { buildForSituation: jest.fn() };
  const geminiProvider = { name: 'gemini', executeAnalysis: jest.fn() };
  const timelineService = { createEntry: jest.fn() };
  const auditLogService = { record: jest.fn(), recordCritical: jest.fn() };
  const dataSource = { transaction: jest.fn(), query: jest.fn() };
  const analysisService = {
    normalizeCoordinationReferences: jest.fn(),
    validateAnalysis: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.DB_PASSWORD = 'test-db-password';

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
      controllers: [AIOrchestrationController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: AuthorizationEnrichmentGuard },
        PermissionsGuard,
        {
          provide: RbacService,
          useValue: {
            resolveActiveAuthorization: (sub: string) =>
              sub === ANALYST_ID
                ? Promise.resolve({
                    ...ANALYST,
                    permissions: [...ANALYST.permissions],
                  })
                : Promise.reject(
                    new UnauthorizedException('Sesión no válida.'),
                  ),
          },
        },
        OperationalScopeService,
        SituationAccessService,
        { provide: SituationsRepository, useValue: situationsRepository },
        {
          provide: AIOrchestrator,
          useFactory: () =>
            new AIOrchestrator(
              { get: jest.fn().mockReturnValue('gemini-test') } as never,
              dataSource as unknown as DataSource,
              situationsRepository as never,
              {} as never,
              promptEngine as never,
              geminiProvider as never,
              analysisService as never,
              {} as never,
              {} as never,
              timelineService as never,
              {} as never,
              { getLatestSession: jest.fn().mockResolvedValue(null) } as never,
              auditLogService as never,
            ),
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

    token = await moduleFixture.get(JwtService).signAsync({ ...ANALYST });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      id: SITUATION_ID,
      reportKind: SituationReportKind.INTERNAL,
      coordinationId: COORD_GENERAL,
      affectedCoordinationId: COORD_GENERAL,
      createdByUserId: ANALYST_ID,
      status: SituationStatus.OPEN,
    });
    situationsRepository.exist.mockResolvedValue(true);
    // Reclamo tomado (UPDATE … RETURNING) y liberación.
    dataSource.query.mockResolvedValue([[{ id: SITUATION_ID }], 1]);
    timelineService.createEntry.mockResolvedValue({ id: 'timeline-id' });
    auditLogService.record.mockResolvedValue(null);
    promptEngine.buildForSituation.mockResolvedValue({
      context: { situationId: SITUATION_ID },
      prompt: { templateVersion: 'v1', systemPrompt: 's', userPrompt: 'u' },
      metrics: { estimatedTokens: 10 },
    });
  });

  const analyze = () =>
    request(app.getHttpServer())
      .post(`/${API}/situations/${SITUATION_ID}/analyze`)
      .set('Authorization', `Bearer ${token}`);

  it('prompt fuera de límites → 422 PROMPT_TOO_LARGE, sin llamar al proveedor', async () => {
    promptEngine.buildForSituation.mockResolvedValue({
      context: { situationId: SITUATION_ID },
      prompt: {
        templateVersion: 'v1',
        systemPrompt: 's',
        userPrompt: 'x'.repeat(MAX_PROMPT_CHARACTERS + 1),
      },
      metrics: { estimatedTokens: 10 },
    });

    const response = await analyze();

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: PROMPT_TOO_LARGE_CODE });
    expect(geminiProvider.executeAnalysis).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    // El camino de fallo se conserva: línea de tiempo y reclamo liberado.
    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AI_ANALYSIS_FAILED' }),
    );
    expect(JSON.stringify(response.body)).not.toContain('xxxxxxxxxx');
  });

  it('422 también si el proveedor (última barrera) rechaza el tamaño', async () => {
    geminiProvider.executeAnalysis.mockImplementation(() =>
      Promise.resolve().then(() =>
        assertPromptWithinLimits('s', 'y'.repeat(MAX_PROMPT_CHARACTERS)),
      ),
    );

    const response = await analyze();

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: PROMPT_TOO_LARGE_CODE });
  });

  it('indisponibilidad real de Gemini → 503 con su mensaje', async () => {
    geminiProvider.executeAnalysis.mockRejectedValue(
      new ServiceUnavailableException(
        'No fue posible completar el análisis IA.',
      ),
    );

    const response = await analyze();

    expect(response.status).toBe(503);
    expect(response.body).not.toMatchObject({ code: PROMPT_TOO_LARGE_CODE });
  });

  it('tiempo agotado de Gemini → 503 (clasificación de disponibilidad)', async () => {
    geminiProvider.executeAnalysis.mockRejectedValue(
      new GatewayTimeoutException(
        'El análisis IA excedió el tiempo máximo permitido (30000ms).',
      ),
    );

    const response = await analyze();

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).toContain('tiempo máximo');
  });

  it('fallo interno no HTTP → 503 genérico, sin el mensaje interno', async () => {
    geminiProvider.executeAnalysis.mockRejectedValue(
      new Error(INTERNAL_SECRET),
    );

    const response = await analyze();

    expect(response.status).toBe(503);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('SuperSecreta');
    // Tampoco en la línea de tiempo, que leen los usuarios del caso.
    const timelineCalls = JSON.stringify(
      timelineService.createEntry.mock.calls,
    );
    expect(timelineCalls).not.toContain('ECONNREFUSED');
    expect(timelineCalls).not.toContain('SuperSecreta');
  });
});
