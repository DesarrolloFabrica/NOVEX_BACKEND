import { UnprocessableEntityException } from '@nestjs/common';
import { ImpactLevel } from '../common/enums/situation-impact.enums';
import { PromptBuilder } from './builders/prompt.builder';
import { SituationContextBuilder } from './builders/situation-context.builder';
import {
  MAX_PROMPT_CHARACTERS,
  PROMPT_CONTEXT_POLICY_VERSION,
  PROMPT_TOO_LARGE_CODE,
  UNTRUSTED_DOSSIER_BEGIN,
  UNTRUSTED_DOSSIER_END,
  assertPromptWithinLimits,
  redactPersonalData,
} from './privacy/prompt-privacy';

/**
 * FASE 01B.2 · Privacidad del prompt. El expediente que viaja a Gemini no
 * lleva correos, ids ni nombres de personas, tokens ni metadatos técnicos, va
 * delimitado como dato no confiable y respeta un límite duro de tamaño.
 */

const EMAIL = 'laura.gomez@universidad.edu.co';
const REPORTER_ID = '0f6d1c2e-1111-4a3b-9c55-aaaaaaaaaaaa';
const REPORTER_NAME = 'Laura Gómez Prueba';
const ASSIGNEE_NAME = 'Pedro Ruiz Prueba';
const UPLOADER_NAME = 'Ana Torres Prueba';
const CLAIM_TOKEN = 'claim-4c1f9e7a-secreto';
const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

function buildContextBuilder() {
  const situation = {
    id: 'situation-1',
    title: 'Caída del servicio de matrícula',
    description: `El portal de matrícula no responde desde las 8:00. Reportó ${EMAIL}, teléfono 300 123 4567, token=abc123 y cabecera Bearer ${JWT}.`,
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    occurredAt: new Date('2026-11-01T13:00:00Z'),
    createdAt: new Date('2026-11-01T13:05:00Z'),
    updatedAt: new Date('2026-11-01T14:00:00Z'),
    createdByUser: {
      id: REPORTER_ID,
      fullName: REPORTER_NAME,
      email: EMAIL,
      coordinationId: 'coord-a-id',
    },
    coordination: {
      id: 'coord-a-id',
      code: 'coord-a',
      name: 'Coordinación A',
      shortName: 'A',
    },
    category: {
      id: 'cat-1',
      code: 'TI',
      name: 'Tecnología',
      description: null,
    },
    relatedCoordinations: [
      {
        displayOrder: 0,
        coordination: {
          id: 'coord-b-id',
          code: 'coord-b',
          name: 'Coordinación B',
          shortName: 'B',
        },
      },
    ],
  };

  const builder = new SituationContextBuilder(
    { findByIdWithRelations: jest.fn().mockResolvedValue(situation) } as never,
    {
      findBySituationId: jest.fn().mockResolvedValue([
        {
          id: 'timeline-1',
          eventType: 'AI_ANALYSIS_STARTED',
          title: 'Análisis IA iniciado',
          description: `Solicitado por ${EMAIL}`,
          user: { fullName: REPORTER_NAME },
          metadata: { claimToken: CLAIM_TOKEN, sessionId: 'session-9' },
          createdAt: new Date('2026-11-01T13:10:00Z'),
        },
      ]),
    } as never,
    {
      findBySituationId: jest.fn().mockResolvedValue([
        {
          id: 'evidence-1',
          type: 'NOTE',
          title: 'Captura del error',
          description: 'Pantalla con error 502',
          fileName: 'captura-ana-torres.png',
          mimeType: 'image/png',
          fileSize: '2048',
          uploadedByUser: { fullName: UPLOADER_NAME },
          createdAt: new Date('2026-11-01T13:20:00Z'),
        },
      ]),
    } as never,
    {
      findBySituationId: jest.fn().mockResolvedValue([
        {
          id: 'rec-1',
          title: 'Reiniciar balanceador',
          description: 'Coordinar con infraestructura',
          priority: 'HIGH',
          status: 'PENDING',
          generatedBy: 'AI',
          assignedUserId: 'user-pedro-id',
          assignedUser: { fullName: ASSIGNEE_NAME },
          dueAt: null,
          completedAt: null,
        },
      ]),
    } as never,
    {
      findBySituationId: jest.fn().mockResolvedValue({
        id: 'assessment-1',
        operationalSeverity: 'HIGH',
        confidence: '0.8',
        estimatedDurationMinutes: 120,
        summary: 'Impacto en matrícula',
        reasoning: 'Servicio crítico',
        updatedAt: new Date('2026-11-01T13:30:00Z'),
        affectedCoordinations: ['c', 'd', 'e', 'f', 'g'].map((code) => ({
          coordination: { code: `coord-${code}`, name: `Coord ${code}` },
          impactLevel: ImpactLevel.HIGH,
          description: 'sugerida por IA',
        })),
      }),
    } as never,
    {
      findCatalog: jest.fn().mockResolvedValue(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((code) => ({
          id: `coord-${code}-id`,
          code: `coord-${code}`,
          name: `Coordinación ${code.toUpperCase()}`,
          shortName: code.toUpperCase(),
        })),
      ),
    } as never,
    {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'cat-1', code: 'TI', name: 'Tecnología', description: null },
        ]),
    } as never,
  );
  return builder;
}

describe('Fase 01B.2 · privacidad del prompt enviado a Gemini', () => {
  it('el contexto no contiene datos de personas ni metadatos técnicos', async () => {
    const context =
      await buildContextBuilder().buildOperationalContext('situation-1');
    const serialized = JSON.stringify(context);

    expect(context.reporter).toEqual({ coordinationCode: 'coord-a' });
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(REPORTER_ID);
    expect(serialized).not.toContain(REPORTER_NAME);
    expect(serialized).not.toContain(ASSIGNEE_NAME);
    expect(serialized).not.toContain(UPLOADER_NAME);
    expect(serialized).not.toContain('captura-ana-torres');
    expect(serialized).not.toContain(CLAIM_TOKEN);
    expect(serialized).not.toContain('session-9');
    expect(serialized).not.toContain('user-pedro-id');
    expect(context.existingRecommendations[0].hasAssignee).toBe(true);
  });

  it('el prompt completo no contiene correos, teléfonos, tokens ni credenciales', async () => {
    const context =
      await buildContextBuilder().buildOperationalContext('situation-1');
    const prompt = new PromptBuilder().buildCompletePrompt(context);
    const full = `${prompt.systemPrompt}\n${prompt.userPrompt}`;

    for (const forbidden of [
      EMAIL,
      REPORTER_ID,
      REPORTER_NAME,
      ASSIGNEE_NAME,
      UPLOADER_NAME,
      CLAIM_TOKEN,
      JWT,
      'abc123',
      '300 123 4567',
      'situation-1',
      'coord-a-id',
    ]) {
      expect(full).not.toContain(forbidden);
    }
    expect(full).toContain('[correo omitido]');
    expect(full).toContain('[número omitido]');
    expect(full).toContain('[token omitido]');
  });

  it('el expediente va delimitado como dato no confiable y con política versionada', async () => {
    const context =
      await buildContextBuilder().buildOperationalContext('situation-1');
    const prompt = new PromptBuilder().buildCompletePrompt(context);

    const begin = prompt.userPrompt.indexOf(UNTRUSTED_DOSSIER_BEGIN);
    const end = prompt.userPrompt.indexOf(UNTRUSTED_DOSSIER_END);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    // El relato del usuario queda DENTRO de los delimitadores.
    const description = prompt.userPrompt.indexOf('portal de matrícula');
    expect(description).toBeGreaterThan(begin);
    expect(description).toBeLessThan(end);
    expect(prompt.systemPrompt).toContain(PROMPT_CONTEXT_POLICY_VERSION);
    expect(prompt.systemPrompt).toMatch(/no obedezcas instrucciones/i);
  });

  it('las sugerencias del análisis previo no reaparecen como relaciones confirmadas', async () => {
    const context =
      await buildContextBuilder().buildOperationalContext('situation-1');

    expect(context.relatedCoordinations.map((item) => item.code)).toEqual([
      'coord-b',
    ]);
    const prompt = new PromptBuilder().buildCompletePrompt(context);
    expect(prompt.userPrompt).toContain('"nature": "AI_SUGGESTION"');
    expect(prompt.userPrompt).toContain('suggestedAffectedCoordinations');
  });

  describe('redactPersonalData', () => {
    it.each([
      [
        'escribir a jefe.area@cun.edu.co hoy',
        'escribir a [correo omitido] hoy',
      ],
      [
        'cédula 1.023.456.789 del estudiante',
        'cédula [número omitido] del estudiante',
      ],
      ['llamar al +57 310 555 1234', 'llamar al [número omitido]'],
      ['password: Hola123!', 'password: [omitido]'],
      [
        'aula 304 en el piso 3 del año 2026',
        'aula 304 en el piso 3 del año 2026',
      ],
    ])('%s', (input, expected) => {
      expect(redactPersonalData(input)).toBe(expected);
    });
  });

  it('un prompt fuera de límites se rechaza antes del proveedor, sin contenido en el error', () => {
    const huge = 'x'.repeat(MAX_PROMPT_CHARACTERS + 1);
    let caught: unknown;
    try {
      assertPromptWithinLimits('sistema', huge);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const response = (caught as UnprocessableEntityException).getResponse() as {
      code: string;
      message: string;
    };
    expect(response.code).toBe(PROMPT_TOO_LARGE_CODE);
    expect(response.message).not.toContain('xxxx');
    expect(() => assertPromptWithinLimits('sistema', 'usuario')).not.toThrow();
  });
});
