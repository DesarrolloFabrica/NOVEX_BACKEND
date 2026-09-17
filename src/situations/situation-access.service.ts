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

    // LECTURA: alcance de coordinación O autoría propia. Esta es la puerta
    // que usan el detalle y sus secciones (análisis, evidencias, línea de
    // tiempo, recomendaciones), de modo que un reporte propio en otra área se
    // lee completo y no a medias.
    this.scopeService.assertSituationReadable(actor, situation);
    return situation;
  }

  /**
   * Para ESCRITURAS sobre el caso (evidencias, seguimiento), no solo lectura.
   *
   * Vuelve a exigir `assertSituationInScope` a propósito: `requireAccessibleSituation`
   * se amplió para dejar leer los reportes propios de otras coordinaciones, y
   * sin esta segunda comprobación esa ampliación de LECTURA se habría
   * convertido en permiso de ESCRITURA, porque `assertCanOperateSituation`
   * considera dueño al autor. El comportamiento de escritura queda por tanto
   * exactamente igual que antes de la fase 2.
   */
  async requireOperableSituation(
    actor: AuthPayload,
    situationId: string,
  ): Promise<Situation> {
    const situation = await this.requireAccessibleSituation(actor, situationId);
    this.scopeService.assertSituationInScope(actor, situation);
    this.scopeService.assertCanOperateSituation(actor, situation);
    return situation;
  }
}
