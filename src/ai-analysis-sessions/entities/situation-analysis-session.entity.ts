import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';

@Entity({ name: 'situation_analysis_sessions' })
@Unique('uq_situation_analysis_sessions_situation_version', [
  'situationId',
  'version',
])
export class SituationAnalysisSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 120 })
  model!: string;

  @Column({ type: 'varchar', length: 16, name: 'prompt_version' })
  promptVersion!: string;

  @Column({ type: 'jsonb', name: 'analysis_result' })
  analysisResult!: AIAnalysisResult;

  @Column({ type: 'text', name: 'prompt_snapshot' })
  promptSnapshot!: string;

  @Column({ type: 'int', name: 'execution_time_ms' })
  executionTimeMs!: number;

  @Column({ type: 'int', name: 'token_estimate' })
  tokenEstimate!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
