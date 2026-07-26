/**
 * Resultado estructurado de Gemini, listo para mapear a AIInterpretation.
 * No es una entidad de persistencia.
 */

import { ExecutiveIntelligenceReport } from '../../contracts/executive-intelligence-report.contract';

export interface GeminiSuggestedIndicator {
  code: string;
  label: string;
  value: number;
  unit?: string;
  direction?: 'higher_is_worse' | 'higher_is_better';
}

export interface GeminiInterpretationResult {
  executiveSummary: string;
  narrative: string;
  /** Código de categoría del catálogo enviado a la IA. */
  categoryCode: string;
  categoryName: string;
  /** Severidad 1..5. */
  severity: number;
  internalImpact: number;
  externalImpact: number;
  studentImpact: number;
  /**
   * Porcentaje de afectación derivado (máximo de impactos)
   * para alinear con AIInterpretation.affectationPercentage.
   */
  affectationPercentage: number;
  /** Códigos de área del catálogo. */
  affectedAreaCodes: string[];
  affectedAreaNames: string[];
  suggestedIndicators: GeminiSuggestedIndicator[];
  recommendations: string[];
  confidence: number;
  /** Nivel de riesgo cualitativo derivado de severity + impactos. */
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  /** Puntaje 0..100 derivado. */
  riskScore: number;
  modelLabel: string;
  interpretedAt: string;
  /**
   * Reporte ejecutivo definitivo (contrato omega.intelligence.v2).
   * Producido por el proveedor de IA; el resto del sistema solo lo transporta.
   */
  executiveReport: ExecutiveIntelligenceReport;
}
