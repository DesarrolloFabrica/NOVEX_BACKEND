import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SituationsModule } from '../situations/situations.module';
import { CoordinationsController } from './coordinations.controller';
import { CoordinationsService } from './coordinations.service';
import { CoordinationDependency } from './entities/coordination-dependency.entity';
import { Coordination } from './entities/coordination.entity';
import { CoordinationDependenciesRepository } from './repositories/coordination-dependencies.repository';
import { CoordinationsRepository } from './repositories/coordinations.repository';
import { CoordinationCatalogSeedService } from './seeds/coordination-catalog-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coordination, CoordinationDependency]),
    AuthModule,
    forwardRef(() => SituationsModule),
  ],
  controllers: [CoordinationsController],
  providers: [
    CoordinationsService,
    CoordinationsRepository,
    CoordinationDependenciesRepository,
    CoordinationCatalogSeedService,
  ],
  exports: [
    CoordinationsService,
    CoordinationsRepository,
    CoordinationDependenciesRepository,
  ],
})
export class CoordinationsModule {}
