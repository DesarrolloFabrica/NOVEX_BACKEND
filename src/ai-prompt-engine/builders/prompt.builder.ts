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
  isSafeCatalogCode,
  sanitizeCatalogText,
  sanitizePromptText,
} from '../privacy/prompt-privacy';

/**
 * Expediente que viaja a Gemini (política context-min-v1). Lista blanca
 * explícita: un campo nuevo del contexto no llega al prompt hasta que se
 * añada aquí. Sin ids internos, marcas de construcción ni datos de personas;
 * las coordinaciones y categorías se referencian por código.
 *
 * Todo valor de texto pasa aquí por la política central (Fase 01B.2):
 * `sanitizePromptText` para relatos y `sanitizeCatalogText` para catálogos y
 * códigos. Es la última barrera antes del prompt, aunque el constructor del
 * contexto ya haya redactado algunos campos (la redacción es idempotente).
 */
export function toPromptDossier(context: SituationContext) {
  const text = (value: string) => sanitizePromptText(value);
  const catalog = (value: string) => sanitizeCatalogText(value);
  const optionalCatalog = (value: string | null) => sanitizeCatalogText(value);
  const coordination = (item: {
    code: string;
    name: string;
    shortName: string;
  }) => ({
    code: catalog(item.code),
    name: catalog(item.name),
    shortName: catalog(item.shortName),
  });
  const category = (item: {
    code: string;
    name: string;
    description: string | null;
  }) => ({
    code: catalog(item.code),
    name: catalog(item.name),
    description: optionalCatalog(item.description),
  });

  return {
    situation: {
      title: text(context.situation.title),
      description: text(context.situation.description),
      severity: context.situation.severity,
      status: context.situation.status,
      occurredAt: context.situation.occurredAt,
      createdAt: context.situation.createdAt,
      updatedAt: context.situation.updatedAt,
    },
    reporter: {
      coordinationCode: optionalCatalog(context.reporter.coordinationCode),
    },
    originCoordination: context.originCoordination
      ? coordination(context.originCoordination)
      : null,
    availableCoordinations: context.availableCoordinations.map(coordination),
    category: context.category ? category(context.category) : null,
    availableCategories: (context.availableCategories ?? []).map(category),
    evidences: context.evidences.map((item) => ({
      type: item.type,
      title: text(item.title),
      description: text(item.description),
      mimeType: optionalCatalog(item.mimeType),
      fileSize: item.fileSize,
      createdAt: item.createdAt,
    })),
    timeline: context.timeline.map((item) => ({
      eventType: item.eventType,
      title: text(item.title),
      description: text(item.description),
      createdAt: item.createdAt,
    })),
    confirmedRelatedCoordinations:
      context.relatedCoordinations.map(coordination),
    existingRecommendations: context.existingRecommendations.map((item) => ({
      title: text(item.title),
      description: text(item.description),
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
          summary: text(context.previousAssessment.summary),
          reasoning: text(context.previousAssessment.reasoning),
          suggestedAffectedCoordinations:
            context.previousAssessment.affectedCoordinations.map((item) => ({
              coordinationCode: catalog(item.coordinationCode),
              coordinationName: catalog(item.coordinationName),
              impactLevel: item.impactLevel,
              description: text(item.description),
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

    /*
     * Fuera del bloque no confiable solo viajan CÓDIGOS con forma de código
     * (`isSafeCatalogCode`); nombres y descripciones de catálogo, que son
     * editables, quedan dentro del expediente ya saneados. Un código con otra
     * forma no se enumera aquí: el modelo lo encuentra en el expediente.
     */
    const allowedCoordinationCodes = context.availableCoordinations
      .map((coordination) => coordination.code)
      .filter(isSafeCatalogCode);
    const catalogCategories =
      (context.availableCategories ?? []).length > 0
        ? context.availableCategories
        : context.category
          ? [context.category]
          : [];
    const allowedCategoryCodes = catalogCategories
      .map((category) => category.code)
      .filter(isSafeCatalogCode);
    const catalogList = (codes: string[]) =>
      codes.length > 0
        ? `${codes.join(', ')} (detalle en el expediente)`
        : '(ver el catálogo dentro del expediente)';
    const persistedCategoryCode =
      context.category && isSafeCatalogCode(context.category.code)
        ? context.category.code
        : null;
    const categoryInstruction = context.category
      ? `La categoría persistida es la del campo "category" del expediente${persistedCategoryCode ? ` (código ${persistedCategoryCode})` : ''}. No la cambies ni contradigas: incidentClassification.categoryCode debe ser exactamente su código y categoryName debe coincidir con su nombre en el catálogo. Códigos válidos del catálogo operativo: ${catalogList(allowedCategoryCodes)}.`
      : `Este expediente no tiene categoría persistida (p. ej. dependencia entre coordinaciones). Elige incidentClassification.categoryCode únicamente del catálogo operativo: ${catalogList(allowedCategoryCodes)}.`;
    const instructions = this.renderSections('INSTRUCCIONES', [
      ...template.instructions,
      {
        key: 'allowed_coordinations',
        title: 'Coordinaciones permitidas',
        body: `En impactAssessment.affectedCoordinations y impactAssessment.propagation usa exclusivamente códigos del catálogo Red de Impacto (campo "availableCoordinations" del expediente): ${catalogList(allowedCoordinationCodes)}. No inventes, traduzcas ni derives códigos nuevos.`,
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
