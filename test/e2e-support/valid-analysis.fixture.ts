/**
 * Respuesta de análisis válida para el contrato AIAnalysisResult. La usa el stub
 * de Gemini en pruebas E2E. Una prueba unitaria verifica que el parser real la acepta.
 */
export const VALID_ANALYSIS_RESPONSE = {
  schemaVersion: '1.0',
  analyzedAt: '2026-10-22T10:00:00.000Z',
  provider: 'gemini',
  executiveSummary: {
    headline: 'Incidente de red en prueba',
    summary: 'Resumen generado por el stub de pruebas E2E.',
    keyPoints: ['Punto de prueba'],
  },
  incidentClassification: {
    categoryCode: 'TECH',
    categoryName: 'Tecnología',
    operationalSeverity: 'MEDIUM',
    tags: ['red'],
  },
  rootCause: {
    summary: 'Causa probable de prueba.',
    hypotheses: [
      {
        statement: 'Falla de switch de piso.',
        likelihood: 'MEDIUM',
        supportingEvidence: ['Reporte del usuario'],
      },
    ],
  },
  impactAssessment: {
    operationalSeverity: 'MEDIUM',
    confidence: 0.8,
    estimatedDurationMinutes: 60,
    summary: 'Impacto moderado de prueba.',
    reasoning: 'Razonamiento de prueba.',
    affectedCoordinations: [],
    propagation: [],
  },
  recommendations: [
    {
      title: 'Revisar switch',
      description: 'Revisar el switch del piso afectado.',
      priority: 'MEDIUM',
    },
  ],
  immediateRisks: [
    {
      title: 'Interrupción',
      description: 'Pérdida de conexión en el piso.',
      severity: 'MEDIUM',
    },
  ],
  futureRisks: [
    {
      title: 'Reincidencia',
      description: 'Nueva falla del mismo equipo.',
      likelihood: 'LOW',
      timeframe: '1 semana',
    },
  ],
  missingInformation: [
    {
      topic: 'Causa exacta',
      question: '¿Qué equipo falló?',
      priority: 'LOW',
    },
  ],
  executiveConclusion: {
    conclusion: 'Atender el switch de piso.',
    recommendedNextStep: 'Revisión técnica.',
  },
  confidence: {
    overall: 0.8,
    factors: [{ name: 'Datos del reporte', score: 0.8 }],
  },
  executiveDecision: {
    decision: 'Atender hoy.',
    urgencyLevel: 'MEDIUM',
    recommendedActionTime: 'Hoy',
    initialResponsible: 'Coordinación responsable',
  },
  executivePriority: {
    level: 'MEDIA',
    justification: 'Impacto acotado a un piso.',
  },
  criticalWindow: {
    timeBeforeEscalation: '2 horas',
    explanation: 'Escalamiento si la falla persiste.',
  },
  riskBreakdown: {
    totalScore: 50,
    components: [
      { name: 'Impacto', score: 50, explanation: 'Afectación de un piso.' },
    ],
  },
  probableCauses: [
    {
      hypothesis: 'Switch de piso',
      probability: 60,
      justification: 'Coincide con el reporte.',
    },
  ],
  operationalPropagation: {
    chain: [
      { stage: 'Origen', description: 'Switch del piso 3.' },
      { stage: 'Destino', description: 'Usuarios del piso 3.' },
    ],
  },
  decisionMatrix: {
    resolveNow: [],
    resolveToday: [{ action: 'Revisar switch', reason: 'Causa probable.' }],
    monitor: [],
    escalate: [],
  },
  executiveNarrative: 'Narrativa de prueba para el stub de Gemini.',
  confidenceExplanation: {
    supportingFactors: ['Reporte claro'],
    reducingFactors: [],
  },
} as const;
