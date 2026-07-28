import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from '../permissions/permissions.module';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';
import { RolePermissionCatalogSeedService } from './seeds/role-permission-catalog-seed.service';

@Module({
  imports: [
    PermissionsModule,
    TypeOrmModule.forFeature([Role, User]),
  ],
  providers: [RbacService, RolePermissionCatalogSeedService],
  exports: [RbacService],
})
export class RbacModule {}
