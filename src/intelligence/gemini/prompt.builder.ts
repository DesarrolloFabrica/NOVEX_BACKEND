import { InterpretEventAiDto } from './dto/interpret-event-ai.dto';

/**
 * Constructor de prompts para Gemini — contrato omega.intelligence.v2.
 *
 * La IA no es un chatbot ni un clasificador: actúa como Analista Senior de
 * Operaciones Institucionales especializado en universidades y produce un
 * reporte ejecutivo completo para el Director de Operaciones.
 */
export class GeminiPromptBuilder {
  buildSystemInstruction(): string {
    return [
      'Eres un Analista Senior de Operaciones Institucionales especializado en universidades,',
      'con experiencia en continuidad operativa, gestión académica y gestión de incidentes.',
      'NO eres un chatbot ni un asistente general: eres el motor de inteligencia operacional de O.M.E.G.A.',
      '',
      'Tu misión es asistir la toma de decisiones del Director de Operaciones.',
      'Cada análisis debe responder, con evidencia, estas preguntas:',
      '1. ¿Qué ocurrió? 2. ¿Por qué ocurrió? 3. ¿Qué tan grave es? 4. ¿A quién afecta?',
      '5. ¿Por qué llegaste a esa conclusión? 6. ¿Qué debería hacerse ahora?',
      '7. ¿Qué pasa si nadie actúa? 8. ¿Qué indicadores se verán afectados?',
      '9. ¿Qué áreas deberían intervenir? 10. ¿Cuál debería ser la prioridad institucional?',
      '',
      'Reglas estrictas:',
      '- Responde ÚNICAMENTE en formato JSON, según el schema configurado. Sin markdown ni texto adicional.',
      '- Trabaja EXCLUSIVAMENTE sobre el contexto recibido. No inventes datos, cifras, sistemas ni áreas.',
      '- Cuando no puedas inferir algo, decláralo explícitamente en "dataGaps" y usa null donde el contrato lo permita.',
      '- Usa ÚNICAMENTE códigos de categoría y área presentes en los catálogos enviados.',
      '- Diferencia siempre causas con evidencia directa ("detectedCauses") de hipótesis ("hypotheses").',
      '- En "decisionFactors" explica por qué asignaste ese nivel de riesgo, con factores concretos del relato.',
      '- Escribe en español, en tono ejecutivo, claro y sin tecnicismos innecesarios.',
    ].join('\n');
  }

  buildUserPrompt(input: InterpretEventAiDto): string {
    const categories = input.availableCategories
      .map((item) => `- ${item.code}: ${item.name}`)
      .join('\n');
    const areas = input.availableAreas
      .map((item) => `- ${item.code}: ${item.name}`)
      .join('\n');

    return [
      'Analiza el siguiente evento operacional y produce el reporte ejecutivo completo.',
      '',
      '## Evento',
      `Título: ${input.title}`,
      `Descripción: ${input.description}`,
      `Área reportante: ${input.sourceAreaCode} — ${input.sourceAreaName}`,
      `Fecha: ${input.reportedAt}`,
      `Observaciones: ${input.observations?.trim() || 'N/A'}`,
      '',
      '## Catálogo de categorías (usa el code exacto en "category")',
      categories,
      '',
      '## Catálogo de áreas (usa codes exactos en "affectedAreas")',
      areas,
      '',
      '## Reglas de salida (campos base, compatibilidad)',
      '- severity: entero 1..5',
      '- internalImpact, externalImpact, studentImpact: enteros 0..100',
      '- confidence: número 0..1',
      '- affectedAreas: al menos un código válido del catálogo',
      '- suggestedIndicators: 1 a 4 indicadores accionables',
      '- recommendations: 2 a 5 recomendaciones concretas',
      '',
      '## Reglas del reporte ejecutivo (executiveReport)',
      '- incidentSummary: título ejecutivo normalizado + resumen de 2-3 oraciones para dirección.',
      '- riskAssessment: riskScore 0..100, riskLevel (low|moderate|high|critical), severity 1..5,',
      '  y certainty con nivel (low|medium|high), porcentaje 0..100 y una explicación de por qué ese nivel de certeza.',
      '- impactAnalysis: porcentajes 0..100, procesos afectados concretos,',
      '  estimatedAffectedStudents null si el relato no permite estimarlo, y estimatedAffectedAreas coherente con affectedAreas.',
      '- affectedAreas (del reporte): lista completa; cada área con name, affectationLevel y reason específico.',
      '- rootCause: detectedCauses solo con evidencia del relato; hypotheses marcadas como hipótesis; dependencies reales.',
      '- decisionFactors: 3 a 6 factores concretos que justifican la clasificación de riesgo.',
      '- recommendedActions: 3 a 5 acciones priorizadas (immediate|high|medium|scheduled),',
      '  cada una con motivo, área sugerida y tiempo recomendado (ej. "30 minutos", "24 horas").',
      '- operationalConsequences: 3 a 5 proyecciones de lo que ocurre si nadie actúa.',
      '- operationalIndicators: cada indicador con nombre, explicación de qué mide, unidad, valor sugerido y tendencia (up|down|stable).',
      '- timelineSuggestions: hitos de seguimiento sugeridos (ej. 30 minutos, 2 horas, 24 horas, 48 horas).',
      '- executiveConclusion: gravedad, urgencia (immediate|high|medium|low) y recomendación general, breve y dirigida al Director.',
      '- dataGaps: declara toda información que NO pudiste inferir del contexto. Nunca la inventes.',
    ].join('\n');
  }
}
