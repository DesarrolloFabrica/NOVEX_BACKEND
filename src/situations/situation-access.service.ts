import { Injectable, NotFoundException } from '@nestjs/common';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';

@Injectable()
export class SituationAccessService {
  constructor(
    private readonly scopeService: OperationalScopeService,
    private readonly situationsRepository: SituationsRepository,
  ) {}

  async requireAccessibleSituation(
    actor: AuthPayload,
    situationId: string,
  ): Promise<Situation> {
    const situation =
      await this.situationsRepository.findByIdWithRelations(situationId);

    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }

    this.scopeService.assertSituationInScope(actor, situation);
    return situation;
  }
}
