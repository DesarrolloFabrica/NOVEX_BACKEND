import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';
import { CatalogSeedService } from './catalog-seed.service';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OperationalArea,
      IncidentCategory,
      OperationalEvent,
    ]),
  ],
  providers: [CatalogSeedService, DemoSeedService],
})
export class DatabaseSeedsModule {}
