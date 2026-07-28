import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './repositories/permissions.repository';
import { RolePermissionsRepository } from './repositories/role-permissions.repository';
import { PermissionCatalogSeedService } from './seeds/permission-catalog-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, RolePermission])],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    PermissionsRepository,
    RolePermissionsRepository,
    PermissionCatalogSeedService,
  ],
  exports: [
    PermissionsService,
    PermissionsRepository,
    RolePermissionsRepository,
  ],
})
export class PermissionsModule {}
