import { SchemaType, type ResponseSchema } from '@google/generative-ai';

/**
 * Response Schema oficial de Gemini (JSON estructurado).
 * La IA no debe devolver texto libre: solo este contrato.
 */
export const GEMINI_INTERPRETATION_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    executiveSummary: {
      type: SchemaType.STRING,
      description: 'Resumen ejecutivo breve del incidente (1-2 oraciones).',
    },
    narrative: {
      type: SchemaType.STRING,
      description: 'Narrativa operacional extendida para dirección.',
    },
    category: {
      type: SchemaType.STRING,
      description:
        'Código exacto de categoría tomado del catálogo availableCategories.',
    },
    severity: {
      type: SchemaType.INTEGER,
      description: 'Severidad de impacto en escala 1 a 5.',
      format: 'int32',
    },
    internalImpact: {
      type: SchemaType.INTEGER,
      description: 'Impacto interno 0..100.',
      format: 'int32',
    },
    externalImpact: {
      type: SchemaType.INTEGER,
      description: 'Impacto externo 0..100.',
      format: 'int32',
    },
    studentImpact: {
      type: SchemaType.INTEGER,
      description: 'Impacto sobre estudiantes 0..100.',
      format: 'int32',
    },
    affectedAreas: {
      type: SchemaType.ARRAY,
      description:
        'Códigos exactos de áreas afectadas tomados de availableAreas.',
      items: { type: SchemaType.STRING },
    },
    suggestedIndicators: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          code: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          value: { type: SchemaType.NUMBER },
          unit: { type: SchemaType.STRING },
          direction: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['higher_is_worse', 'higher_is_better'],
          },
        },
        required: ['code', 'label', 'value'],
      },
    },
    recommendations: {
      type: SchemaType.ARRAY,
      description: 'Recomendaciones accionables para la Dirección de Operaciones.',
      items: { type: SchemaType.STRING },
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Confianza del modelo entre 0 y 1.',
    },
  },
  required: [
    'executiveSummary',
    'narrative',
    'category',
    'severity',
    'internalImpact',
    'externalImpact',
    'studentImpact',
    'affectedAreas',
    'suggestedIndicators',
    'recommendations',
    'confidence',
  ],
};

/** Forma cruda esperada del JSON de Gemini (antes del parser de dominio). */
export interface GeminiRawInterpretationPayload {
  executiveSummary: string;
  narrative: string;
  category: string;
  severity: number;
  internalImpact: number;
  externalImpact: number;
  studentImpact: number;
  affectedAreas: string[];
  suggestedIndicators: Array<{
    code: string;
    label: string;
    value: number;
    unit?: string;
    direction?: 'higher_is_worse' | 'higher_is_better';
  }>;
  recommendations: string[];
  confidence: number;
}
