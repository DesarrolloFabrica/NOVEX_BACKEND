import { BadRequestException } from '@nestjs/common';
import { RiskLevel } from '../../common/enums/operational.enums';
import {
  ActionPriority,
  CertaintyLevel,
  ExecutiveIntelligenceReport,
  ExecutiveUrgency,
  IndicatorTrend,
  INTELLIGENCE_CONTRACT_VERSION,
} from '../contracts/executive-intelligence-report.contract';
import { InterpretEventAiDto } from './dto/interpret-event-ai.dto';
import {
  GeminiInterpretationResult,
  GeminiSuggestedIndicator,
} from './dto/gemini-interpretation.result';
import {
  GeminiRawExecutiveReport,
  GeminiRawInterpretationPayload,
} from './response.schema';

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
      executiveReport: this.parseExecutiveReport(payload.executiveReport),
    };
  }

  /**
   * Normaliza el reporte ejecutivo (contrato cunmark.intelligence.v2).
   * Valida presencia de secciones, sanea enums y acota valores numéricos.
   */
  private parseExecutiveReport(
    raw: GeminiRawExecutiveReport,
  ): ExecutiveIntelligenceReport {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException(
        'Gemini no devolvió el reporte ejecutivo (executiveReport).',
      );
    }

    const sections: Array<keyof GeminiRawExecutiveReport> = [
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
    ];
    for (const key of sections) {
      if (raw[key] === undefined || raw[key] === null) {
        throw new BadRequestException(
          `El reporte ejecutivo carece de la sección requerida: ${key}`,
        );
      }
    }

    const students = raw.impactAnalysis.estimatedAffectedStudents;

    return {
      contractVersion: INTELLIGENCE_CONTRACT_VERSION,
      incidentSummary: {
        executiveTitle: String(raw.incidentSummary.executiveTitle).trim(),
        executiveSummary: String(raw.incidentSummary.executiveSummary).trim(),
      },
      riskAssessment: {
        riskScore: this.clampInt(raw.riskAssessment.riskScore, 0, 100),
        riskLevel: this.asRiskLevel(raw.riskAssessment.riskLevel),
        severity: this.clampInt(raw.riskAssessment.severity, 1, 5),
        certainty: {
          level: this.asEnum<CertaintyLevel>(
            raw.riskAssessment.certainty.level,
            ['low', 'medium', 'high'],
            'medium',
          ),
          percentage: this.clampInt(
            raw.riskAssessment.certainty.percentage,
            0,
            100,
          ),
          explanation: String(raw.riskAssessment.certainty.explanation).trim(),
        },
      },
      impactAnalysis: {
        internalImpactPercentage: this.clampInt(
          raw.impactAnalysis.internalImpactPercentage,
          0,
          100,
        ),
        externalImpactPercentage: this.clampInt(
          raw.impactAnalysis.externalImpactPercentage,
          0,
          100,
        ),
        studentImpactPercentage: this.clampInt(
          raw.impactAnalysis.studentImpactPercentage,
          0,
          100,
        ),
        affectedProcesses: this.asStringList(
          raw.impactAnalysis.affectedProcesses,
        ),
        estimatedAffectedStudents:
          students === null ||
          students === undefined ||
          !Number.isFinite(students)
            ? null
            : Math.max(0, Math.round(students)),
        estimatedAffectedAreas: this.clampInt(
          raw.impactAnalysis.estimatedAffectedAreas,
          0,
          100,
        ),
      },
      affectedAreas: (raw.affectedAreas ?? []).map((area) => ({
        name: String(area.name).trim(),
        affectationLevel: this.asRiskLevel(area.affectationLevel),
        reason: String(area.reason).trim(),
      })),
      rootCause: {
        detectedCauses: this.asStringList(raw.rootCause.detectedCauses),
        hypotheses: this.asStringList(raw.rootCause.hypotheses),
        dependencies: this.asStringList(raw.rootCause.dependencies),
      },
      decisionFactors: this.asStringList(raw.decisionFactors),
      recommendedActions: (raw.recommendedActions ?? []).map((item) => ({
        priority: this.asEnum<ActionPriority>(
          item.priority,
          ['immediate', 'high', 'medium', 'scheduled'],
          'medium',
        ),
        action: String(item.action).trim(),
        reason: String(item.reason).trim(),
        suggestedArea: String(item.suggestedArea).trim(),
        recommendedTime: String(item.recommendedTime).trim(),
      })),
      operationalConsequences: this.asStringList(raw.operationalConsequences),
      operationalIndicators: (raw.operationalIndicators ?? []).map((item) => ({
        name: String(item.name).trim(),
        explanation: String(item.explanation).trim(),
        unit: String(item.unit).trim(),
        suggestedValue: Number.isFinite(item.suggestedValue)
          ? Number(item.suggestedValue)
          : 0,
        trend: this.asEnum<IndicatorTrend>(
          item.trend,
          ['up', 'down', 'stable'],
          'stable',
        ),
      })),
      timelineSuggestions: (raw.timelineSuggestions ?? []).map((item) => ({
        horizon: String(item.horizon).trim(),
        checkpoint: String(item.checkpoint).trim(),
      })),
      executiveConclusion: {
        gravity: String(raw.executiveConclusion.gravity).trim(),
        urgency: this.asEnum<ExecutiveUrgency>(
          raw.executiveConclusion.urgency,
          ['immediate', 'high', 'medium', 'low'],
          'medium',
        ),
        recommendation: String(raw.executiveConclusion.recommendation).trim(),
      },
      dataGaps: this.asStringList(raw.dataGaps),
    };
  }

  private asRiskLevel(value: string): RiskLevel {
    const normalized = String(value).trim().toLowerCase();
    const valid = Object.values(RiskLevel) as string[];
    return valid.includes(normalized)
      ? (normalized as RiskLevel)
      : RiskLevel.MODERATE;
  }

  private asEnum<T extends string>(
    value: string,
    allowed: readonly T[],
    fallback: T,
  ): T {
    const normalized = String(value).trim().toLowerCase() as T;
    return allowed.includes(normalized) ? normalized : fallback;
  }

  private asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item).trim()).filter(Boolean);
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
      'executiveReport',
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
      throw new BadRequestException(
        'Valor numérico inválido en respuesta Gemini.',
      );
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(
        'Valor numérico inválido en respuesta Gemini.',
      );
    }
    return Math.min(max, Math.max(min, value));
  }
}
