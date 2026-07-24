import { BadRequestException } from '@nestjs/common';
import { RiskLevel } from '../../common/enums/operational.enums';
import { InterpretEventAiDto } from './dto/interpret-event-ai.dto';
import {
  GeminiInterpretationResult,
  GeminiSuggestedIndicator,
} from './dto/gemini-interpretation.result';
import { GeminiRawInterpretationPayload } from './response.schema';

/**
 * Parser de la respuesta estructurada de Gemini hacia el dominio de inteligencia.
 * No interpreta texto libre: valida y transforma el JSON del schema.
 */
export class GeminiResponseParser {
  parse(
    raw: unknown,
    input: InterpretEventAiDto,
    modelLabel: string,
  ): GeminiInterpretationResult {
    const payload = this.asPayload(raw);
    const category = this.resolveCategory(payload.category, input);
    const affected = this.resolveAffectedAreas(payload.affectedAreas, input);

    const severity = this.clampInt(payload.severity, 1, 5);
    const internalImpact = this.clampInt(payload.internalImpact, 0, 100);
    const externalImpact = this.clampInt(payload.externalImpact, 0, 100);
    const studentImpact = this.clampInt(payload.studentImpact, 0, 100);
    const confidence = this.clampNumber(payload.confidence, 0, 1);

    const affectationPercentage = Math.max(
      internalImpact,
      externalImpact,
      studentImpact,
    );
    const riskScore = this.deriveRiskScore(
      severity,
      affectationPercentage,
      confidence,
    );

    return {
      executiveSummary: payload.executiveSummary.trim(),
      narrative: payload.narrative.trim(),
      categoryCode: category.code,
      categoryName: category.name,
      severity,
      internalImpact,
      externalImpact,
      studentImpact,
      affectationPercentage,
      affectedAreaCodes: affected.map((area) => area.code),
      affectedAreaNames: affected.map((area) => area.name),
      suggestedIndicators: this.parseIndicators(payload.suggestedIndicators),
      recommendations: (payload.recommendations ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      confidence,
      riskLevel: this.mapRiskLevel(riskScore, severity),
      riskScore,
      modelLabel,
      interpretedAt: new Date().toISOString(),
    };
  }

  private asPayload(raw: unknown): GeminiRawInterpretationPayload {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException(
        'La respuesta de Gemini no es un objeto JSON válido.',
      );
    }

    const payload = raw as Partial<GeminiRawInterpretationPayload>;
    const required: Array<keyof GeminiRawInterpretationPayload> = [
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
    ];

    for (const key of required) {
      if (payload[key] === undefined || payload[key] === null) {
        throw new BadRequestException(
          `La respuesta de Gemini carece del campo requerido: ${key}`,
        );
      }
    }

    return payload as GeminiRawInterpretationPayload;
  }

  private resolveCategory(
    categoryCode: string,
    input: InterpretEventAiDto,
  ): { code: string; name: string } {
    const normalized = categoryCode.trim().toUpperCase();
    const match = input.availableCategories.find(
      (item) => item.code.trim().toUpperCase() === normalized,
    );
    if (!match) {
      throw new BadRequestException(
        `Gemini devolvió una categoría fuera de catálogo: ${categoryCode}`,
      );
    }
    return match;
  }

  private resolveAffectedAreas(
    codes: string[],
    input: InterpretEventAiDto,
  ): Array<{ code: string; name: string }> {
    if (!Array.isArray(codes) || codes.length === 0) {
      throw new BadRequestException(
        'Gemini no devolvió áreas afectadas válidas.',
      );
    }

    const resolved: Array<{ code: string; name: string }> = [];
    for (const code of codes) {
      const normalized = code.trim().toUpperCase();
      const match = input.availableAreas.find(
        (item) => item.code.trim().toUpperCase() === normalized,
      );
      if (!match) {
        throw new BadRequestException(
          `Gemini devolvió un área fuera de catálogo: ${code}`,
        );
      }
      if (!resolved.some((item) => item.code === match.code)) {
        resolved.push(match);
      }
    }
    return resolved;
  }

  private parseIndicators(
    indicators: GeminiRawInterpretationPayload['suggestedIndicators'],
  ): GeminiSuggestedIndicator[] {
    if (!Array.isArray(indicators)) return [];
    return indicators
      .filter((item) => item?.code && item?.label && item?.value !== undefined)
      .map((item) => ({
        code: String(item.code).trim(),
        label: String(item.label).trim(),
        value: Number(item.value),
        unit: item.unit ? String(item.unit) : undefined,
        direction:
          item.direction === 'higher_is_better' ||
          item.direction === 'higher_is_worse'
            ? item.direction
            : undefined,
      }));
  }

  private deriveRiskScore(
    severity: number,
    affectationPercentage: number,
    confidence: number,
  ): number {
    const base = severity * 12 + affectationPercentage * 0.35;
    const adjusted = base * (0.85 + confidence * 0.15);
    return this.clampInt(Math.round(adjusted), 0, 100);
  }

  private mapRiskLevel(
    riskScore: number,
    severity: number,
  ): GeminiInterpretationResult['riskLevel'] {
    if (severity >= 5 || riskScore >= 70) return RiskLevel.CRITICAL;
    if (riskScore >= 50) return RiskLevel.HIGH;
    if (riskScore >= 30) return RiskLevel.MODERATE;
    return RiskLevel.LOW;
  }

  private clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Valor numérico inválido en respuesta Gemini.');
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Valor numérico inválido en respuesta Gemini.');
    }
    return Math.min(max, Math.max(min, value));
  }
}
