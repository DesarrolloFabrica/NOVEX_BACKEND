import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../contracts/auth-payload.contract';

/** Datos mínimos de una situación para decidir quién puede intervenirla. */
export interface SituationOwnership {
  coordinationId: string | null;
  createdByUserId: string;
}

@Injectable()
export class OperationalScopeService {
  isCoordinationScoped(actor: AuthPayload): boolean {
    return this.normalizeRoleCode(actor.roleCode) === 'COORDINADOR';
  }

  isAnalyst(actor: AuthPayload): boolean {
    return this.normalizeRoleCode(actor.roleCode) === 'ANALISTA';
  }

  assertPermission(actor: AuthPayload, permission: string): void {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException(
        `No tienes permiso para ejecutar esta acción (${permission}).`,
      );
    }
  }

  resolveSituationListCoordinationId(
    actor: AuthPayload,
    requestedCoordinationId?: string,
  ): string | undefined {
    if (this.isCoordinationScoped(actor)) {
      if (!actor.coordinationId) {
        return undefined;
      }
      return actor.coordinationId ?? undefined;
    }

    return requestedCoordinationId;
  }

  assertSituationInScope(
    actor: AuthPayload,
    situation: { coordinationId: string | null },
  ): void {
    this.assertPermission(actor, 'SITUATIONS_VIEW');

    if (
      this.isCoordinationScoped(actor) &&
      (!actor.coordinationId ||
        situation.coordinationId !== actor.coordinationId)
    ) {
      throw new NotFoundException('Situación no encontrada.');
    }
  }

  /**
   * El coordinador registra siempre a nombre de su área. El analista no
   * representa ninguna, así que su caso nace sin coordinación dueña y queda
   * trazado por autoría.
   */
  resolveCreateCoordinationId(
    actor: AuthPayload,
    requestedCoordinationId?: string,
  ): string | null {
    this.assertPermission(actor, 'SITUATIONS_CREATE');

    if (this.isAnalyst(actor)) {
      if (requestedCoordinationId) {
        throw new ForbiddenException(
          'El analista registra situaciones a su propio nombre, sin coordinación responsable.',
        );
      }
      return null;
    }

    if (this.isCoordinationScoped(actor)) {
      if (!actor.coordinationId) {
        throw new ForbiddenException(
          'No tiene coordinación asignada para registrar situaciones.',
        );
      }
      if (
        requestedCoordinationId &&
        requestedCoordinationId !== actor.coordinationId
      ) {
        throw new ForbiddenException(
          'Solo puede registrar situaciones de su coordinación.',
        );
      }
      return actor.coordinationId;
    }

    throw new ForbiddenException(
      'Solo los roles Analista y Coordinador pueden registrar situaciones.',
    );
  }

  /**
   * Un caso pertenece a quien lo registró y a la coordinación dueña. Los roles
   * transversales (director, admin y el analista fuera de sus propios
   * registros) consultan la operación pero no intervienen en ella.
   */
  ownsSituation(actor: AuthPayload, situation: SituationOwnership): boolean {
    if (situation.createdByUserId === actor.sub) {
      return true;
    }

    return (
      this.isCoordinationScoped(actor) &&
      Boolean(actor.coordinationId) &&
      situation.coordinationId === actor.coordinationId
    );
  }

  canUpdateSituation(
    actor: AuthPayload,
    situation: SituationOwnership,
  ): boolean {
    return (
      actor.permissions.includes('SITUATIONS_UPDATE') &&
      this.ownsSituation(actor, situation)
    );
  }

  assertCanOperateSituation(
    actor: AuthPayload,
    situation: SituationOwnership,
  ): void {
    if (!this.ownsSituation(actor, situation)) {
      throw new ForbiddenException(
        'Solo quien registró la situación o su coordinación pueden intervenirla.',
      );
    }
  }

  assertCanUpdateSituation(
    actor: AuthPayload,
    situation: SituationOwnership,
  ): void {
    this.assertPermission(actor, 'SITUATIONS_UPDATE');
    this.assertSituationInScope(actor, situation);
    this.assertCanOperateSituation(actor, situation);
  }

  assertCoordinationInScope(actor: AuthPayload, coordinationId: string): void {
    this.assertPermission(actor, 'COORDINATIONS_VIEW');

    if (
      this.isCoordinationScoped(actor) &&
      (!actor.coordinationId || coordinationId !== actor.coordinationId)
    ) {
      throw new NotFoundException('Coordinación no encontrada.');
    }
  }

  filterCoordinationsByScope<T extends { id: string }>(
    actor: AuthPayload,
    items: T[],
  ): T[] {
    if (!this.isCoordinationScoped(actor)) {
      return items;
    }

    if (!actor.coordinationId) {
      return [];
    }

    return items.filter((item) => item.id === actor.coordinationId);
  }

  private normalizeRoleCode(roleCode: string): string {
    return roleCode.trim().toUpperCase();
  }
}
