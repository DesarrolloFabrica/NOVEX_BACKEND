/**
 * JSON Schema para forzar la estructura AIAnalysisResult en Gemini.
 * Debe mantenerse alineado con AIAnalysisResultDto.
 */
export const AI_ANALYSIS_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  required: [
    'schemaVersion',
    'analyzedAt',
    'provider',
    'executiveSummary',
    'incidentClassification',
    'rootCause',
    'impactAssessment',
    'recommendations',
    'immediateRisks',
    'futureRisks',
    'missingInformation',
    'executiveConclusion',
    'confidence',
    'executiveDecision',
    'executivePriority',
    'criticalWindow',
    'riskBreakdown',
    'probableCauses',
    'operationalPropagation',
    'decisionMatrix',
    'executiveNarrative',
    'confidenceExplanation',
  ],
  properties: {
    schemaVersion: { type: 'string', enum: ['1.0'] },
    analyzedAt: { type: 'string' },
    provider: { type: 'string' },
    executiveSummary: {
      type: 'object',
      required: ['headline', 'summary', 'keyPoints'],
      properties: {
        headline: { type: 'string' },
        summary: { type: 'string' },
        keyPoints: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
      },
    },
    incidentClassification: {
      type: 'object',
      required: ['categoryCode', 'categoryName', 'operationalSeverity', 'tags'],
      properties: {
        categoryCode: { type: 'string' },
        categoryName: { type: 'string' },
        operationalSeverity: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    rootCause: {
      type: 'object',
      required: ['summary', 'hypotheses'],
      properties: {
        summary: { type: 'string' },
        hypotheses: {
          type: 'array',
          items: {
            type: 'object',
            required: ['statement', 'likelihood', 'supportingEvidence'],
            properties: {
              statement: { type: 'string' },
              likelihood: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH'],
              },
              supportingEvidence: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    impactAssessment: {
      type: 'object',
      required: [
        'operationalSeverity',
        'confidence',
        'estimatedDurationMinutes',
        'summary',
        'reasoning',
        'affectedCoordinations',
        'propagation',
      ],
      properties: {
        operationalSeverity: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        estimatedDurationMinutes: { type: 'integer', minimum: 0 },
        summary: { type: 'string' },
        reasoning: { type: 'string' },
        affectedCoordinations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['coordinationCode', 'impactLevel', 'description'],
            properties: {
              coordinationCode: { type: 'string' },
              impactLevel: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              },
              description: { type: 'string' },
            },
          },
        },
        propagation: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'coordinationCode',
              'depth',
              'impactLevel',
              'description',
            ],
            properties: {
              coordinationCode: { type: 'string' },
              depth: { type: 'integer', minimum: 0 },
              impactLevel: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'priority'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          },
        },
      },
    },
    immediateRisks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'severity'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          },
        },
      },
    },
    futureRisks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'likelihood', 'timeframe'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          likelihood: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH'],
          },
          timeframe: { type: 'string' },
        },
      },
    },
    missingInformation: {
      type: 'array',
      items: {
        type: 'object',
        required: ['topic', 'question', 'priority'],
        properties: {
          topic: { type: 'string' },
          question: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH'],
          },
        },
      },
    },
    executiveConclusion: {
      type: 'object',
      required: ['conclusion', 'recommendedNextStep'],
      properties: {
        conclusion: { type: 'string' },
        recommendedNextStep: { type: 'string' },
      },
    },
    confidence: {
      type: 'object',
      required: ['overall', 'factors'],
      properties: {
        overall: { type: 'number', minimum: 0, maximum: 1 },
        factors: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['name', 'score'],
            properties: {
              name: { type: 'string' },
              score: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
    executiveDecision: {
      type: 'object',
      required: [
        'decision',
        'urgencyLevel',
        'recommendedActionTime',
        'initialResponsible',
      ],
      properties: {
        decision: { type: 'string' },
        urgencyLevel: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        recommendedActionTime: { type: 'string' },
        initialResponsible: { type: 'string' },
      },
    },
    executivePriority: {
      type: 'object',
      required: ['level', 'justification'],
      properties: {
        level: {
          type: 'string',
          enum: ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'],
        },
        justification: { type: 'string' },
      },
    },
    criticalWindow: {
      type: 'object',
      required: ['timeBeforeEscalation', 'explanation'],
      properties: {
        timeBeforeEscalation: { type: 'string' },
        explanation: { type: 'string' },
      },
    },
    riskBreakdown: {
      type: 'object',
      required: ['totalScore', 'components'],
      properties: {
        totalScore: { type: 'number', minimum: 0, maximum: 100 },
        components: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['name', 'score', 'explanation'],
            properties: {
              name: { type: 'string' },
              score: { type: 'number', minimum: 0, maximum: 100 },
              explanation: { type: 'string' },
            },
          },
        },
      },
    },
    probableCauses: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['hypothesis', 'probability', 'justification'],
        properties: {
          hypothesis: { type: 'string' },
          probability: { type: 'number', minimum: 0, maximum: 100 },
          justification: { type: 'string' },
        },
      },
    },
    operationalPropagation: {
      type: 'object',
      required: ['chain'],
      properties: {
        chain: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            required: ['stage', 'description'],
            properties: {
              stage: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    decisionMatrix: {
      type: 'object',
      required: ['resolveNow', 'resolveToday', 'monitor', 'escalate'],
      properties: {
        resolveNow: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'reason'],
            properties: {
              action: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        resolveToday: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'reason'],
            properties: {
              action: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        monitor: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'reason'],
            properties: {
              action: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        escalate: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'reason'],
            properties: {
              action: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
    executiveNarrative: { type: 'string' },
    confidenceExplanation: {
      type: 'object',
      required: ['supportingFactors', 'reducingFactors'],
      properties: {
        supportingFactors: {
          type: 'array',
          items: { type: 'string' },
        },
        reducingFactors: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
} as const;
