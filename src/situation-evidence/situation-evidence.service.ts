import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvidenceType } from '../common/enums/situation-evidence.enums';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { Situation } from '../situations/entities/situation.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import {
  CreateSituationEvidenceDto,
  SituationEvidenceResponseDto,
  SituationEvidencesListResponseDto,
} from './dto/situation-evidence.dto';
import { SituationEvidence } from './entities/situation-evidence.entity';
import { SituationEvidenceRepository } from './repositories/situation-evidence.repository';
import { EvidenceStorageService } from './storage/evidence-storage.service';

@Injectable()
export class SituationEvidenceService {
  constructor(
    private readonly evidenceRepository: SituationEvidenceRepository,
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    private readonly storageService: EvidenceStorageService,
    private readonly timelineService: SituationTimelineService,
  ) {}

  async create(
    situationId: string,
    dto: CreateSituationEvidenceDto,
    uploadedByUserId: string,
  ): Promise<SituationEvidenceResponseDto> {
    await this.ensureSituationExists(situationId);

    const fileFields = this.resolveFileFields(situationId, dto);

    const evidence = this.evidenceRepository.create({
      situationId,
      uploadedByUserId,
      type: dto.type,
      title: dto.title.trim(),
      description: dto.description.trim(),
      fileName: fileFields.fileName,
      storagePath: fileFields.storagePath,
      mimeType: fileFields.mimeType,
      fileSize: fileFields.fileSize,
    });

    const saved = await this.evidenceRepository.save(evidence);
    const withUser = await this.evidenceRepository.findByIdAndSituationId(
      saved.id,
      situationId,
    );

    await this.timelineService.createEntry({
      situationId,
      userId: uploadedByUserId,
      eventType: TimelineEventType.ATTACHMENT_ADDED,
      title: 'Evidencia agregada',
      description: `Se agregó la evidencia "${saved.title}" (${saved.type}).`,
      metadata: {
        evidenceId: saved.id,
        type: saved.type,
        fileName: saved.fileName,
        storagePath: saved.storagePath,
      },
    });

    return this.toResponse(withUser ?? saved);
  }

  async findBySituation(
    situationId: string,
  ): Promise<SituationEvidencesListResponseDto> {
    await this.ensureSituationExists(situationId);

    const items = await this.evidenceRepository.findBySituationId(situationId);

    return {
      situationId,
      items: items.map((item) => this.toResponse(item)),
      total: items.length,
    };
  }

  async getById(
    situationId: string,
    evidenceId: string,
  ): Promise<SituationEvidenceResponseDto> {
    const evidence = await this.findEvidenceOrFail(situationId, evidenceId);
    return this.toResponse(evidence);
  }

  async delete(situationId: string, evidenceId: string): Promise<void> {
    const evidence = await this.findEvidenceOrFail(situationId, evidenceId);
    await this.evidenceRepository.remove(evidence);
  }

  private resolveFileFields(
    situationId: string,
    dto: CreateSituationEvidenceDto,
  ): {
    fileName: string | null;
    storagePath: string | null;
    mimeType: string | null;
    fileSize: string | null;
  } {
    if (dto.type === EvidenceType.NOTE) {
      return {
        fileName: null,
        storagePath: null,
        mimeType: null,
        fileSize: null,
      };
    }

    const fileName = dto.fileName!.trim();
    const descriptor = this.storageService.resolveStorageDescriptor(
      situationId,
      fileName,
      dto.storagePath?.trim(),
    );

    return {
      fileName: descriptor.fileName,
      storagePath: descriptor.storagePath,
      mimeType: dto.mimeType!.trim(),
      fileSize: String(dto.fileSize!),
    };
  }

  private async ensureSituationExists(situationId: string): Promise<void> {
    const exists = await this.situationsRepository.exist({
      where: { id: situationId },
    });
    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }

  private async findEvidenceOrFail(
    situationId: string,
    evidenceId: string,
  ): Promise<SituationEvidence> {
    await this.ensureSituationExists(situationId);

    const evidence = await this.evidenceRepository.findByIdAndSituationId(
      evidenceId,
      situationId,
    );
    if (!evidence) {
      throw new NotFoundException(
        `Evidencia no encontrada: ${evidenceId}`,
      );
    }

    return evidence;
  }

  private toResponse(evidence: SituationEvidence): SituationEvidenceResponseDto {
    return {
      id: evidence.id,
      situationId: evidence.situationId,
      uploadedByUserId: evidence.uploadedByUserId,
      uploadedByUserName: evidence.uploadedByUser.fullName,
      type: evidence.type,
      title: evidence.title,
      description: evidence.description,
      fileName: evidence.fileName,
      storagePath: evidence.storagePath,
      mimeType: evidence.mimeType,
      fileSize: evidence.fileSize !== null ? Number(evidence.fileSize) : null,
      createdAt: evidence.createdAt,
    };
  }
}
