import { SchemaType, type ResponseSchema } from '@google/generative-ai';

/**
 * Response Schema oficial de Gemini (JSON estructurado).
 * La IA no debe devolver texto libre: solo este contrato.
 *
 * Sprint 12 — contrato definitivo cunmark.intelligence.v2:
 * se conservan los campos base (compatibilidad) y se añade `executiveReport`,
 * la respuesta completa del Asistente Ejecutivo Operacional.
 */

const RISK_LEVEL_ENUM = ['low', 'moderate', 'high', 'critical'];

const EXECUTIVE_REPORT_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  description:
    'Reporte ejecutivo completo dirigido al Director de Operaciones.',
  properties: {
    incidentSummary: {
      type: SchemaType.OBJECT,
      description: '1. ¿Qué ocurrió?',
      properties: {
        executiveTitle: {
          type: SchemaType.STRING,
          description: 'Título ejecutivo normalizado del incidente.',
        },
        executiveSummary: {
          type: SchemaType.STRING,
          description: 'Resumen para dirección en 2-3 oraciones.',
        },
      },
      required: ['executiveTitle', 'executiveSummary'],
    },
    riskAssessment: {
      type: SchemaType.OBJECT,
      description: '2. ¿Qué tan grave es?',
      properties: {
        riskScore: {
          type: SchemaType.INTEGER,
          description: 'Puntaje de riesgo 0..100.',
          format: 'int32',
        },
        riskLevel: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: RISK_LEVEL_ENUM,
        },
        severity: {
          type: SchemaType.INTEGER,
          description: 'Severidad 1..5.',
          format: 'int32',
        },
        certainty: {
          type: SchemaType.OBJECT,
          description:
            'Nivel de certeza del análisis con explicación (reemplaza "confianza").',
          properties: {
            level: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['low', 'medium', 'high'],
            },
            percentage: {
              type: SchemaType.INTEGER,
              description: 'Certeza 0..100.',
              format: 'int32',
            },
            explanation: {
              type: SchemaType.STRING,
              description:
                'Por qué la IA tiene (o no) certeza: señales, fuentes y vacíos.',
            },
          },
          required: ['level', 'percentage', 'explanation'],
        },
      },
      required: ['riskScore', 'riskLevel', 'severity', 'certainty'],
    },
    impactAnalysis: {
      type: SchemaType.OBJECT,
      description: '4. ¿A quién afecta?',
      properties: {
        internalImpactPercentage: {
          type: SchemaType.INTEGER,
          format: 'int32',
        },
        externalImpactPercentage: {
          type: SchemaType.INTEGER,
          format: 'int32',
        },
        studentImpactPercentage: {
          type: SchemaType.INTEGER,
          format: 'int32',
        },
        affectedProcesses: {
          type: SchemaType.ARRAY,
          description: 'Procesos institucionales interrumpidos o degradados.',
          items: { type: SchemaType.STRING },
        },
        estimatedAffectedStudents: {
          type: SchemaType.INTEGER,
          description:
            'Estudiantes afectados estimados. Usar null si no es inferible del contexto.',
          format: 'int32',
          nullable: true,
        },
        estimatedAffectedAreas: {
          type: SchemaType.INTEGER,
          format: 'int32',
        },
      },
      required: [
        'internalImpactPercentage',
        'externalImpactPercentage',
        'studentImpactPercentage',
        'affectedProcesses',
        'estimatedAffectedAreas',
      ],
    },
    affectedAreas: {
      type: SchemaType.ARRAY,
      description: 'Lista completa de áreas afectadas con nivel y motivo.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          affectationLevel: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: RISK_LEVEL_ENUM,
          },
          reason: { type: SchemaType.STRING },
        },
        required: ['name', 'affectationLevel', 'reason'],
      },
    },
    rootCause: {
      type: SchemaType.OBJECT,
      description:
        '¿Por qué ocurrió? Solo sobre el contexto recibido, sin inventar.',
      properties: {
        detectedCauses: {
          type: SchemaType.ARRAY,
          description: 'Causas con evidencia directa en el relato.',
          items: { type: SchemaType.STRING },
        },
        hypotheses: {
          type: SchemaType.ARRAY,
          description: 'Hipótesis plausibles, marcadas como tales.',
          items: { type: SchemaType.STRING },
        },
        dependencies: {
          type: SchemaType.ARRAY,
          description: 'Dependencias técnicas u organizacionales.',
          items: { type: SchemaType.STRING },
        },
      },
      required: ['detectedCauses', 'hypotheses', 'dependencies'],
    },
    decisionFactors: {
      type: SchemaType.ARRAY,
      description:
        '5. Factores por los que la IA clasificó el incidente con ese riesgo.',
      items: { type: SchemaType.STRING },
    },
    recommendedActions: {
      type: SchemaType.ARRAY,
      description: '6. Acciones recomendadas, priorizadas.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          priority: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['immediate', 'high', 'medium', 'scheduled'],
          },
          action: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING },
          suggestedArea: { type: SchemaType.STRING },
          recommendedTime: {
            type: SchemaType.STRING,
            description: 'Ventana recomendada, ej. "30 minutos", "24 horas".',
          },
        },
        required: [
          'priority',
          'action',
          'reason',
          'suggestedArea',
          'recommendedTime',
        ],
      },
    },
    operationalConsequences: {
      type: SchemaType.ARRAY,
      description: '7. Proyección de lo que ocurre si nadie actúa.',
      items: { type: SchemaType.STRING },
    },
    operationalIndicators: {
      type: SchemaType.ARRAY,
      description: '8. Indicadores operacionales sugeridos.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          unit: { type: SchemaType.STRING },
          suggestedValue: { type: SchemaType.NUMBER },
          trend: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['up', 'down', 'stable'],
          },
        },
        required: ['name', 'explanation', 'unit', 'suggestedValue', 'trend'],
      },
    },
    timelineSuggestions: {
      type: SchemaType.ARRAY,
      description: '9. Hitos de seguimiento sugeridos (30 min, 2h, 24h, 48h).',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          horizon: { type: SchemaType.STRING },
          checkpoint: { type: SchemaType.STRING },
        },
        required: ['horizon', 'checkpoint'],
      },
    },
    executiveConclusion: {
      type: SchemaType.OBJECT,
      description: '10. Conclusión breve dirigida al Director.',
      properties: {
        gravity: { type: SchemaType.STRING },
        urgency: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: ['immediate', 'high', 'medium', 'low'],
        },
        recommendation: { type: SchemaType.STRING },
      },
      required: ['gravity', 'urgency', 'recommendation'],
    },
    dataGaps: {
      type: SchemaType.ARRAY,
      description:
        'Información que la IA NO pudo inferir del contexto. Declarar explícitamente, nunca inventar.',
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    'incidentSummary',
    'riskAssessment',
    'impactAnalysis',
    'affectedAreas',
    'rootCause',
    'decisionFactors',
    'recommendedActions',
    'operationalConsequences',
    'operationalIndicators',
    'timelineSuggestions',
    'executiveConclusion',
    'dataGaps',
  ],
};

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
      description:
        'Recomendaciones accionables para la Dirección de Operaciones.',
      items: { type: SchemaType.STRING },
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Confianza del modelo entre 0 y 1.',
    },
    executiveReport: EXECUTIVE_REPORT_SCHEMA,
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
    'executiveReport',
  ],
};

/** Forma cruda del reporte ejecutivo dentro del JSON de Gemini. */
export interface GeminiRawExecutiveReport {
  incidentSummary: { executiveTitle: string; executiveSummary: string };
  riskAssessment: {
    riskScore: number;
    riskLevel: string;
    severity: number;
    certainty: { level: string; percentage: number; explanation: string };
  };
  impactAnalysis: {
    internalImpactPercentage: number;
    externalImpactPercentage: number;
    studentImpactPercentage: number;
    affectedProcesses: string[];
    estimatedAffectedStudents?: number | null;
    estimatedAffectedAreas: number;
  };
  affectedAreas: Array<{
    name: string;
    affectationLevel: string;
    reason: string;
  }>;
  rootCause: {
    detectedCauses: string[];
    hypotheses: string[];
    dependencies: string[];
  };
  decisionFactors: string[];
  recommendedActions: Array<{
    priority: string;
    action: string;
    reason: string;
    suggestedArea: string;
    recommendedTime: string;
  }>;
  operationalConsequences: string[];
  operationalIndicators: Array<{
    name: string;
    explanation: string;
    unit: string;
    suggestedValue: number;
    trend: string;
  }>;
  timelineSuggestions: Array<{ horizon: string; checkpoint: string }>;
  executiveConclusion: {
    gravity: string;
    urgency: string;
    recommendation: string;
  };
  dataGaps: string[];
}

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
  executiveReport: GeminiRawExecutiveReport;
}
