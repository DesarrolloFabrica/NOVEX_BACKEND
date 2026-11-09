import { Injectable } from '@nestjs/common';
import type { SituationContext } from '../contracts/situation-context.contract';
import type {
  CompletePrompt,
  PromptValidationResult,
} from '../contracts/prompt.contract';
import type { PromptTemplate } from '../contracts/prompt.contract';
import {
  MAX_PROMPT_BYTES,
  MAX_PROMPT_CHARACTERS,
  isPromptWithinLimits,
  measurePrompt,
} from '../privacy/prompt-privacy';

const MIN_DESCRIPTION_LENGTH = 80;
const MIN_EVIDENCE_COUNT_RECOMMENDED = 1;

@Injectable()
export class PromptValidator {
  validate(
    context: SituationContext,
    prompt: CompletePrompt,
    template: PromptTemplate,
  ): PromptValidationResult {
    const warnings: string[] = [];

    // Fase 01B.2: el exceso deja de ser un aviso. El orquestador corta la
    // llamada a Gemini con assertPromptWithinLimits; aquí se informa igual.
    const size = measurePrompt(prompt.systemPrompt, prompt.userPrompt);
    if (!isPromptWithinLimits(size)) {
      warnings.push(
        `El prompt excede el tamaño máximo (${size.characters}/${MAX_PROMPT_CHARACTERS} caracteres, ${size.bytes}/${MAX_PROMPT_BYTES} bytes): no se enviará a Gemini.`,
      );
    }

    if (!template.system.length) {
      warnings.push('La plantilla no define bloques de sistema.');
    }
    if (!template.context.length) {
      warnings.push('La plantilla no define bloques de contexto.');
    }
    if (!template.instructions.length) {
      warnings.push('La plantilla no define bloques de instrucciones.');
    }
    if (!template.outputFormat.length) {
      warnings.push('La plantilla no define el formato de salida esperado.');
    }

    if (context.situation.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      warnings.push(
        'La descripción de la situación es corta; el análisis podría ser menos confiable.',
      );
    }

    if (context.evidences.length < MIN_EVIDENCE_COUNT_RECOMMENDED) {
      warnings.push(
        'No hay evidencias registradas; considere adjuntar notas o archivos antes del análisis.',
      );
    }

    if (context.timeline.length === 0) {
      warnings.push(
        'El timeline del expediente está vacío; el análisis carecerá de historial operacional.',
      );
    }

    if (!context.previousAssessment) {
      warnings.push(
        'No existe evaluación de impacto previa; el análisis será completamente inicial.',
      );
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
