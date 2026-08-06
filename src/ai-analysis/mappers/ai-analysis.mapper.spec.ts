import type { AIAnalysisResult } from '../contracts/ai-analysis-result.contract';
import { AI_ANALYSIS_RESPONSE_JSON_SCHEMA } from '../schemas/ai-analysis-response.schema';
import { AIAnalysisMapper } from './ai-analysis.mapper';

describe('AIAnalysisMapper coordination references', () => {
  it('restringe el esquema de Gemini al catálogo de Red de Impacto', () => {
    const coordinationCodes =
      AI_ANALYSIS_RESPONSE_JSON_SCHEMA.properties.impactAssessment.properties
        .affectedCoordinations.items.properties.coordinationCode.enum;

    expect(coordinationCodes).toContain('coord-saber-pro');
    expect(coordinationCodes).not.toContain('coord-admisiones');
  });

  it('conserva solo coordinaciones activas de Red de Impacto', async () => {
    const coordinationsRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'coordination-id', code: 'coord-saber-pro', isActive: true },
        ]),
    };
    const mapper = new AIAnalysisMapper(coordinationsRepository as never);
    const analysis = {
      impactAssessment: {
        affectedCoordinations: [
          {
            coordinationCode: 'coord-saber-pro',
            impactLevel: 'HIGH',
            description: 'Coordinación responsable.',
          },
          {
            coordinationCode: 'coord-admisiones',
            impactLevel: 'MEDIUM',
            description: 'Código inventado por la IA.',
          },
        ],
        propagation: [
          {
            coordinationCode: 'coord-admisiones',
            depth: 1,
            impactLevel: 'MEDIUM',
            description: 'Referencia inválida.',
          },
        ],
      },
    } as AIAnalysisResult;

    const result = await mapper.normalizeCoordinationReferences(analysis);

    expect(
      result.impactAssessment.affectedCoordinations.map(
        (item) => item.coordinationCode,
      ),
    ).toEqual(['coord-saber-pro']);
    expect(result.impactAssessment.propagation).toEqual([]);
    expect(coordinationsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });
});
