import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import type { AIAnalysisResult } from '../contracts/ai-analysis-result.contract';
import { AIAnalysisResultDto } from '../dto/ai-analysis.dto';

@Injectable()
export class AIAnalysisParser {
  parseAnalysis(payload: string | Record<string, unknown>): AIAnalysisResult {
    const parsed = this.parseJson(payload);
    return this.validateAnalysis(parsed);
  }

  validateAnalysis(payload: unknown): AIAnalysisResult {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new BadRequestException(
        'El análisis IA debe ser un objeto JSON válido.',
      );
    }

    this.assertRequiredBlocks(payload as Record<string, unknown>);

    const dto = plainToInstance(AIAnalysisResultDto, payload, {
      enableImplicitConversion: true,
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'El contrato de análisis IA es inválido.',
        errors: this.flattenValidationErrors(errors),
      });
    }

    return dto;
  }

  private parseJson(
    payload: string | Record<string, unknown>,
  ): Record<string, unknown> {
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new BadRequestException(
          'El análisis IA debe entregarse exclusivamente en formato JSON.',
        );
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          throw new Error('invalid root');
        }
        return parsed as Record<string, unknown>;
      } catch {
        throw new BadRequestException(
          'No fue posible parsear el análisis IA como JSON.',
        );
      }
    }

    return payload;
  }

  private assertRequiredBlocks(payload: Record<string, unknown>): void {
    const requiredBlocks = [
      'schemaVersion',
      'analyzedAt',
      'provider',
      'executiveSummary',
      'incidentClassification',
      'rootCause',
      'impactAssessment',
      'recommendations',
      'executiveConclusion',
      'confidence',
    ];

    const missing = requiredBlocks.filter(
      (block) => payload[block] === undefined,
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan bloques obligatorios del contrato IA: ${missing.join(', ')}`,
      );
    }
  }

  private flattenValidationErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children?.length) {
        messages.push(...this.flattenValidationErrors(error.children));
      }
    }

    return messages;
  }
}
