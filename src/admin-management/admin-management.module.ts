import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';

/**
 * Consola de Administración: roles, matriz de permisos, coordinaciones y
 * consulta de auditoría. Usa el DataSource (transacciones) y AuditLogService
 * (módulo global); AuthModule aporta PermissionsGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementService],
})
export class AdminManagementModule {}
