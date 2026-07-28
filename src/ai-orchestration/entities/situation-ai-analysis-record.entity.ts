import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';
import { SituationAnalysisSession } from '../../ai-analysis-sessions/entities/situation-analysis-session.entity';

@Entity({ name: 'situation_ai_analysis_records' })
export class SituationAIAnalysisRecord extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @ManyToOne(() => SituationAnalysisSession, { nullable: false })
  @JoinColumn({ name: 'current_session_id' })
  currentSession!: SituationAnalysisSession;

  @Index()
  @Column({ type: 'uuid', name: 'current_session_id' })
  currentSessionId!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'jsonb', name: 'analysis_result' })
  analysisResult!: AIAnalysisResult;
}
