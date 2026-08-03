import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../contracts/auth-payload.contract';

@Injectable()
export class OperationalScopeService {
  isCoordinationScoped(actor: AuthPayload): boolean {
    return actor.roleCode === 'COORDINADOR';
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
    situation: { coordinationId: string },
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

  resolveCreateCoordinationId(
    actor: AuthPayload,
    requestedCoordinationId: string,
  ): string {
    this.assertPermission(actor, 'SITUATIONS_CREATE');

    if (this.isCoordinationScoped(actor)) {
      if (!actor.coordinationId) {
        throw new ForbiddenException(
          'No tiene coordinación asignada para registrar situaciones.',
        );
      }
      if (requestedCoordinationId !== actor.coordinationId) {
        throw new ForbiddenException(
          'Solo puede registrar situaciones de su coordinación.',
        );
      }
      return actor.coordinationId;
    }
    return requestedCoordinationId;
  }

  assertCanUpdateSituation(
    actor: AuthPayload,
    situation: { coordinationId: string },
  ): void {
    this.assertPermission(actor, 'SITUATIONS_UPDATE');
    this.assertSituationInScope(actor, situation);
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
}
