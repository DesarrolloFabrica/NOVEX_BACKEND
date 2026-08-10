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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { CreateSituationEvidenceDto } from './dto/situation-evidence.dto';
import { SituationEvidenceService } from './situation-evidence.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
export class SituationEvidenceController {
  constructor(
    private readonly evidenceService: SituationEvidenceService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Post(':id/evidences')
  @RequirePermissions('SITUATIONS_CREATE')
  async create(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Body() dto: CreateSituationEvidenceDto,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireOperableSituation(
      user,
      situationId,
    );
    return this.evidenceService.create(situationId, dto, user.sub);
  }

  @Get(':id/evidences')
  @RequirePermissions('SITUATIONS_VIEW')
  async findBySituation(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.evidenceService.findBySituation(situationId);
  }

  @Get(':id/evidences/:evidenceId')
  @RequirePermissions('SITUATIONS_VIEW')
  async getById(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.evidenceService.getById(situationId, evidenceId);
  }

  @Delete(':id/evidences/:evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('SITUATIONS_UPDATE')
  async delete(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireOperableSituation(
      user,
      situationId,
    );
    return this.evidenceService.delete(situationId, evidenceId);
  }
}
