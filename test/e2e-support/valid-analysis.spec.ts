import { AIAnalysisParser } from '../../src/ai-analysis/parsers/ai-analysis.parser';
import { VALID_ANALYSIS_RESPONSE } from './valid-analysis.fixture';

describe('fixture de análisis para el stub de Gemini', () => {
  it('es aceptado por el parser real del contrato AIAnalysisResult', () => {
    const parser = new AIAnalysisParser();

    const parsed = parser.parseAnalysis(
      JSON.parse(JSON.stringify(VALID_ANALYSIS_RESPONSE)) as Record<
        string,
        unknown
      >,
    );

    expect(parsed.provider).toBe('gemini');
    expect(parsed.confidence.overall).toBe(0.8);
  });
});
