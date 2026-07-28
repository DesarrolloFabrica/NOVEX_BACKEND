/**
 * Ejemplo estático del prompt generado por AIPromptEngine (v1).
 * No proviene de una situación real; ilustra la estructura final.
 */
export const PROMPT_ENGINE_EXAMPLE = {
  templateId: 'operational-analysis',
  templateVersion: 'v1',
  systemPrompt: `## SISTEMA

### Rol
Eres un analista de inteligencia operacional de CUNMARK. Tu función es interpretar expedientes operacionales universitarios con rigor, trazabilidad y enfoque en impacto institucional.

### Principios
Basa el análisis únicamente en el contexto provisto. Distingue hechos confirmados de hipótesis. Prioriza impacto operacional, continuidad académica y riesgo institucional.

### Restricciones
No inventes datos. No asumas hechos no respaldados por el expediente. Si falta información, declárala explícitamente en missingInformation.`,
  userPrompt: `## CONTEXTO

### Contexto del expediente
A continuación se entrega el expediente operacional completo en formato estructurado JSON.

### Expediente estructurado
{
  "situationId": "…",
  "situation": { "title": "…", "description": "…" },
  "createdBy": { "fullName": "…" },
  "originCoordination": { "code": "COA", "name": "…" },
  "category": { "code": "TECH_DEGRADATION", "name": "…" },
  "evidences": [],
  "timeline": [],
  "relatedCoordinations": [],
  "existingRecommendations": [],
  "previousAssessment": null
}

## INSTRUCCIONES

### Objetivo del análisis
Evalúa la situación, clasifica el incidente, estima impacto operacional, identifica coordinaciones afectadas, propone recomendaciones accionables y resume riesgos inmediatos y futuros.

### Profundidad esperada
Considera evidencias, timeline, recomendaciones previas y evaluación de impacto existente (si aplica) para enriquecer el análisis sin contradecir el historial del expediente.`,
  expectedSchema: `AIAnalysisResult/1.0
## FORMATO ESPERADO

### Formato de salida
Responde exclusivamente con un objeto JSON válido que cumpla el contrato AIAnalysisResult schemaVersion 1.0. No incluyas texto libre, markdown ni comentarios fuera del JSON.

### Bloques obligatorios
schemaVersion, analyzedAt, provider, executiveSummary, incidentClassification, rootCause, impactAssessment, recommendations, immediateRisks, futureRisks, missingInformation, executiveConclusion, confidence.`,
} as const;
