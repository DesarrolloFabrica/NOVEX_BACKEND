import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthPayload } from '../../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { ExportSituationsQueryDto } from './situations-export.dto';
import { SituationsExportService } from './situations-export.service';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * `GET /situations/export`: Excel (.xlsx) de situaciones activas para ADMIN,
 * DIRECTOR y ANALISTA (el rol lo verifica el servicio; el permiso, el guard).
 *
 * Controlador propio registrado ANTES de `SituationsController` en el módulo:
 * así «export» no cae en `GET /situations/:id` (que exige UUID).
 */
@Controller('situations/export')
@UseGuards(PermissionsGuard)
export class SituationsExportController {
  constructor(private readonly exportService: SituationsExportService) {}

  @Get()
  @RequirePermissions('SITUATIONS_VIEW')
  async export(
    @Query() query: ExportSituationsQueryDto,
    @CurrentUser() user: AuthPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.exportService.export(query, user);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(file.rows),
    });
    return new StreamableFile(file.buffer);
  }
}
