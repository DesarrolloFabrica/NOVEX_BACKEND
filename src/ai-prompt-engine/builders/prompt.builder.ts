import { Injectable } from '@nestjs/common';
import { AIAnalysisSchemaVersion } from '../../ai-analysis/enums/ai-analysis.enums';
import type { SituationContext } from '../contracts/situation-context.contract';
import type {
  CompletePrompt,
  PromptTemplate,
  PromptTemplateSection,
} from '../contracts/prompt.contract';
import { getActivePromptTemplate } from '../templates/prompt-template.registry';
import {
  PROMPT_CONTEXT_POLICY_VERSION,
  UNTRUSTED_DOSSIER_BEGIN,
  UNTRUSTED_DOSSIER_END,
  UNTRUSTED_DOSSIER_NOTICE,
} from '../privacy/prompt-privacy';

/**
 * Expediente que viaja a Gemini (política context-min-v1). Lista blanca
 * explícita: un campo nuevo del contexto no llega al prompt hasta que se
 * añada aquí. Sin ids internos, marcas de construcción ni datos de personas;
 * las coordinaciones y categorías se referencian por código.
 */
export function toPromptDossier(context: SituationContext) {
  const coordination = (item: {
    code: string;
    name: string;
    shortName: string;
  }) => ({
    code: item.code,
    name: item.name,
    shortName: item.shortName,
  });
  const category = (item: {
    code: string;
    name: string;
    description: string | null;
  }) => ({
    code: item.code,
    name: item.name,
    description: item.description,
  });

  return {
    situation: {
      title: context.situation.title,
      description: context.situation.description,
      severity: context.situation.severity,
      status: context.situation.status,
      occurredAt: context.situation.occurredAt,
      createdAt: context.situation.createdAt,
      updatedAt: context.situation.updatedAt,
    },
    reporter: { coordinationCode: context.reporter.coordinationCode },
    originCoordination: context.originCoordination
      ? coordination(context.originCoordination)
      : null,
    availableCoordinations: context.availableCoordinations.map(coordination),
    category: context.category ? category(context.category) : null,
    availableCategories: (context.availableCategories ?? []).map(category),
    evidences: context.evidences.map((item) => ({
      type: item.type,
      title: item.title,
      description: item.description,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      createdAt: item.createdAt,
    })),
    timeline: context.timeline.map((item) => ({
      eventType: item.eventType,
      title: item.title,
      description: item.description,
      createdAt: item.createdAt,
    })),
    confirmedRelatedCoordinations:
      context.relatedCoordinations.map(coordination),
    existingRecommendations: context.existingRecommendations.map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      generatedBy: item.generatedBy,
      hasAssignee: item.hasAssignee,
      dueAt: item.dueAt,
      completedAt: item.completedAt,
    })),
    previousAiAssessment: context.previousAssessment
      ? {
          nature: 'AI_SUGGESTION',
          operationalSeverity: context.previousAssessment.operationalSeverity,
          confidence: context.previousAssessment.confidence,
          estimatedDurationMinutes:
            context.previousAssessment.estimatedDurationMinutes,
          summary: context.previousAssessment.summary,
          reasoning: context.previousAssessment.reasoning,
          suggestedAffectedCoordinations:
            context.previousAssessment.affectedCoordinations.map((item) => ({
              coordinationCode: item.coordinationCode,
              coordinationName: item.coordinationName,
              impactLevel: item.impactLevel,
              description: item.description,
            })),
          updatedAt: context.previousAssessment.updatedAt,
        }
      : null,
  };
}

@Injectable()
export class PromptBuilder {
  buildCompletePrompt(
    context: SituationContext,
    template: PromptTemplate = getActivePromptTemplate(),
  ): CompletePrompt {
    return {
      templateId: template.id,
      templateVersion: template.version,
      systemPrompt: this.buildSystemPrompt(template),
      userPrompt: this.buildUserPrompt(context, template),
      expectedSchema: this.buildOutputSchema(template),
    };
  }

  buildSystemPrompt(
    template: PromptTemplate = getActivePromptTemplate(),
  ): string {
    return this.renderSections('SISTEMA', [
      ...template.system,
      {
        key: 'untrusted_dossier',
        title: `Expediente no confiable (política ${PROMPT_CONTEXT_POLICY_VERSION})`,
        body: UNTRUSTED_DOSSIER_NOTICE,
      },
    ]);
  }

  buildUserPrompt(
    context: SituationContext,
    template: PromptTemplate = getActivePromptTemplate(),
  ): string {
    const contextSections = [
      ...template.context,
      {
        key: 'expediente_json',
        title: 'Expediente estructurado',
        body: [
          UNTRUSTED_DOSSIER_BEGIN,
          JSON.stringify(toPromptDossier(context), null, 2),
          UNTRUSTED_DOSSIER_END,
        ].join('\n'),
      },
    ];

    const allowedCoordinationCodes = context.availableCoordinations.map(
      (coordination) => coordination.code,
    );
    const catalogCategories =
      (context.availableCategories ?? []).length > 0
        ? context.availableCategories
        : context.category
          ? [context.category]
          : [];
    const allowedCategoryCodes = catalogCategories.map(
      (category) => category.code,
    );
    const categoryInstruction = context.category
      ? `La categoría persistida del expediente es ${context.category.code} (${context.category.name}). No la cambies ni contradigas: incidentClassification.categoryCode debe ser ${context.category.code} y categoryName debe coincidir con el catálogo. Códigos válidos del catálogo operativo: ${allowedCategoryCodes.join(', ')}.`
      : `Este expediente no tiene categoría persistida (p. ej. dependencia entre coordinaciones). Elige incidentClassification.categoryCode únicamente del catálogo operativo: ${allowedCategoryCodes.join(', ') || '(vacío)'}.`;
    const instructions = this.renderSections('INSTRUCCIONES', [
      ...template.instructions,
      {
        key: 'allowed_coordinations',
        title: 'Coordinaciones permitidas',
        body: `En impactAssessment.affectedCoordinations y impactAssessment.propagation usa exclusivamente códigos del catálogo Red de Impacto: ${allowedCoordinationCodes.join(', ')}. No inventes, traduzcas ni derives códigos nuevos.`,
      },
      {
        key: 'allowed_categories',
        title: 'Categoría del expediente',
        body: categoryInstruction,
      },
    ]);
    const contextBlock = this.renderSections('CONTEXTO', contextSections);

    return [contextBlock, instructions].filter(Boolean).join('\n\n');
  }

  buildOutputSchema(
    template: PromptTemplate = getActivePromptTemplate(),
  ): string {
    const formatBlock = this.renderSections(
      'FORMATO ESPERADO',
      template.outputFormat,
    );
    return [`AIAnalysisResult/${AIAnalysisSchemaVersion.V1}`, formatBlock].join(
      '\n',
    );
  }

  private renderSections(
    heading: string,
    sections: readonly PromptTemplateSection[],
  ): string {
    const rendered = sections
      .map((section) => this.renderSection(section))
      .join('\n\n');

    return `## ${heading}\n\n${rendered}`;
  }

  private renderSection(section: PromptTemplateSection): string {
    return `### ${section.title}\n${section.body}`;
  }
}
