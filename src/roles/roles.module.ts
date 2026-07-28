import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { Role } from './entities/role.entity';
import { RolesRepository } from './repositories/roles.repository';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RoleCatalogSeedService } from './seeds/role-catalog-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Role]), RbacModule],
  controllers: [RolesController],
  providers: [RolesService, RolesRepository, RoleCatalogSeedService],
  exports: [RolesService, RolesRepository],
})
export class RolesModule {}
