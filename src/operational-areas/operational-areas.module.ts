import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationalArea } from './entities/operational-area.entity';
import { OperationalAreasController } from './operational-areas.controller';
import { OperationalAreasService } from './operational-areas.service';
import { OperationalAreasRepository } from './repositories/operational-areas.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OperationalArea])],
  controllers: [OperationalAreasController],
  providers: [OperationalAreasService, OperationalAreasRepository],
  exports: [OperationalAreasService, OperationalAreasRepository],
})
export class OperationalAreasModule {}
