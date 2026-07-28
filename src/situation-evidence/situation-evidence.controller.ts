import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSituationEvidenceDto } from './dto/situation-evidence.dto';
import { SituationEvidenceService } from './situation-evidence.service';

@Controller('situations')
export class SituationEvidenceController {
  constructor(private readonly evidenceService: SituationEvidenceService) {}

  @Post(':id/evidences')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Body() dto: CreateSituationEvidenceDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.evidenceService.create(situationId, dto, user.sub);
  }

  @Get(':id/evidences')
  findBySituation(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.evidenceService.findBySituation(situationId);
  }

  @Get(':id/evidences/:evidenceId')
  getById(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidenceService.getById(situationId, evidenceId);
  }

  @Delete(':id/evidences/:evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidenceService.delete(situationId, evidenceId);
  }
}
