import { Injectable } from '@nestjs/common';
import { AIAnalysisSchemaVersion } from '../../ai-analysis/enums/ai-analysis.enums';
import type { SituationContext } from '../contracts/situation-context.contract';
import type {
  CompletePrompt,
  PromptTemplate,
  PromptTemplateSection,
} from '../contracts/prompt.contract';
import { getActivePromptTemplate } from '../templates/prompt-template.registry';

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
    return this.renderSections('SISTEMA', template.system);
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
        body: JSON.stringify(context, null, 2),
      },
    ];

    const allowedCoordinationCodes = context.availableCoordinations.map(
      (coordination) => coordination.code,
    );
    const instructions = this.renderSections('INSTRUCCIONES', [
      ...template.instructions,
      {
        key: 'allowed_coordinations',
        title: 'Coordinaciones permitidas',
        body: `En impactAssessment.affectedCoordinations y impactAssessment.propagation usa exclusivamente códigos del catálogo Red de Impacto: ${allowedCoordinationCodes.join(', ')}. No inventes, traduzcas ni derives códigos nuevos.`,
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
