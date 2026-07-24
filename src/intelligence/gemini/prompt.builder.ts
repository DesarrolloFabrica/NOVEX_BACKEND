import { InterpretEventAiDto } from './dto/interpret-event-ai.dto';

/**
 * Constructor de prompts para Gemini.
 * Separa instrucciones del sistema del payload del evento.
 */
export class GeminiPromptBuilder {
  buildSystemInstruction(): string {
    return [
      'Eres el motor de inteligencia operacional de O.M.E.G.A.',
      'Tu tarea es interpretar un evento operacional reportado por un usuario.',
      'Debes clasificar, estimar impactos y proponer indicadores.',
      'Usa ÚNICAMENTE códigos de categoría y área presentes en los catálogos enviados.',
      'No inventes códigos fuera del catálogo.',
      'Responde estrictamente según el schema JSON configurado.',
      'No incluyas markdown ni texto fuera del JSON.',
    ].join(' ');
  }

  buildUserPrompt(input: InterpretEventAiDto): string {
    const categories = input.availableCategories
      .map((item) => `- ${item.code}: ${item.name}`)
      .join('\n');
    const areas = input.availableAreas
      .map((item) => `- ${item.code}: ${item.name}`)
      .join('\n');

    return [
      'Interpreta el siguiente evento operacional.',
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
      '## Reglas de salida',
      '- severity: entero 1..5',
      '- internalImpact, externalImpact, studentImpact: enteros 0..100',
      '- confidence: número 0..1',
      '- affectedAreas: al menos un código válido del catálogo',
      '- suggestedIndicators: 1 a 4 indicadores accionables',
      '- recommendations: 2 a 5 recomendaciones concretas',
    ].join('\n');
  }
}
