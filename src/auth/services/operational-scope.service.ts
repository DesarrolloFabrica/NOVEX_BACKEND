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

/** Código del rol que coordina un área. Única vía a la resolución. */
export const COORDINATOR_ROLE_CODE = 'COORDINADOR';

@Injectable()
export class OperationalScopeService {
  isCoordinationScoped(actor: AuthPayload): boolean {
    return this.normalizeRoleCode(actor.roleCode) === COORDINATOR_ROLE_CODE;
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
   * ¿Es este caso un REPORTE PROPIO del actor? La autoría es la única vía por
   * la que alguien ve un caso fuera de su alcance de coordinación.
   *
   * La identidad sale SIEMPRE de `actor.sub`, que el guard de autorización
   * resuelve desde la base en cada petición. Nunca de un identificador de autor
   * enviado por el cliente: un parámetro así permitiría leer los reportes de
   * cualquier otra persona.
   */
  isOwnReport(
    actor: AuthPayload,
    situation: Pick<SituationOwnership, 'createdByUserId'>,
  ): boolean {
    return situation.createdByUserId === actor.sub;
  }

  /**
   * ALCANCE DE **LECTURA** de un caso concreto. Es una ampliación deliberada y
   * acotada de `assertSituationInScope`: además de lo que el alcance de
   * coordinación permite, cada persona puede LEER los casos que ella misma
   * reportó, aunque pertenezcan a otra área.
   *
   * Vive como método APARTE, y no como un relajamiento de
   * `assertSituationInScope`, porque ese método lo comparten rutas de ESCRITURA
   * —`assertCanUpdateSituation` y `requireOperableSituation`— donde ampliarlo
   * habría convertido «puedo verlo» en «puedo modificarlo»: `ownsSituation`
   * ya considera dueño al autor, así que el alcance de coordinación es hoy lo
   * único que impide a un coordinador editar un reporte suyo en otra área.
   * Leer un caso propio no autoriza a editarlo, resolverlo ni operarlo.
   */
  assertSituationReadable(
    actor: AuthPayload,
    situation: { coordinationId: string | null; createdByUserId: string },
  ): void {
    this.assertPermission(actor, 'SITUATIONS_VIEW');

    if (this.isOwnReport(actor, situation)) {
      return;
    }

    this.assertSituationInScope(actor, situation);
  }

  /**
   * REGLA DE CREACIÓN (reportar). Deliberadamente SEPARADA de las reglas de
   * lectura y de intervención: reportar un problema en otra área no concede
   * ningún acceso adicional sobre ella.
   *
   * Cualquier rol con `SITUATIONS_CREATE` puede declarar explícitamente la
   * coordinación RESPONSABLE del problema, incluida la propia. La selección del
   * usuario MANDA SIEMPRE y nunca se sustituye en silencio por la suya; si la
   * coordinación pedida no existe o no está activa, la creación falla en
   * `ensureCoordination`, que es donde vive la validación de catálogo.
   *
   * COMPATIBILIDAD con los consumidores que ya existen. Omitir la coordinación
   * sigue significando lo mismo que antes para cada rol:
   *   - ANALISTA (y cualquier rol sin área): el caso nace SIN coordinación
   *     dueña y queda trazado por autoría. Es el contrato que usa hoy el
   *     asistente de captura al registrar a nombre del analista.
   *   - COORDINADOR: el caso nace a nombre de SU área, como hasta ahora.
   *
   * Qué cambia respecto a la regla anterior: un ANALISTA ya no es rechazado por
   * enviar una coordinación (antes era `ForbiddenException`) y un COORDINADOR
   * ya no queda limitado a la suya. La AUTORÍA del reporte no se toca: vive en
   * `createdByUserId`, que es un dato distinto de la coordinación responsable.
   */
  resolveCreateCoordinationId(
    actor: AuthPayload,
    requestedCoordinationId?: string,
  ): string | null {
    this.assertPermission(actor, 'SITUATIONS_CREATE');

    // La coordinación seleccionada gana siempre. Nunca se descarta.
    if (requestedCoordinationId) {
      return requestedCoordinationId;
    }

    // Sin selección explícita se conserva el contrato histórico por rol.
    if (this.isCoordinationScoped(actor)) {
      return actor.coordinationId ?? null;
    }

    return null;
  }

  /**
   * REGLA DE RESOLUCIÓN (solucionar). Es la política ÚNICA del sistema para
   * decidir quién puede cerrar un problema registrando su aprendizaje, y la
   * consumen tanto el endpoint de resolución como el indicador `canResolve` de
   * las respuestas: no puede haber dos criterios que discrepen.
   *
   * Solo resuelve quien COORDINA EL ÁREA RESPONSABLE:
   *   - rol COORDINADOR, y
   *   - su coordinación asignada es exactamente la coordinación responsable
   *     persistida del problema.
   *
   * El vínculo real del dominio entre una persona y su área es
   * `users.coordination_id`, que `AuthorizationEnrichmentGuard` resuelve desde
   * la base de datos en CADA petición. Por eso `actor.coordinationId` es el
   * valor vigente y no un dato de sesión que pudiera haber quedado obsoleto.
   *
   * NO conceden excepción, por decisión funcional explícita:
   *   - ADMIN ni DIRECTOR, por transversales que sean;
   *   - haber REPORTADO el problema: la autoría no otorga resolución;
   *   - coordinar un área RELACIONADA o AFECTADA por el problema;
   *   - coordinar un área padre o hija de la responsable. La jerarquía entre
   *     coordinaciones no se consulta aquí a propósito: la responsabilidad es
   *     el vínculo directo, no una relación derivada.
   *
   * Un problema SIN coordinación responsable (`coordinationId === null`, el
   * caso histórico del Registro de analista) no lo resuelve nadie por esta vía:
   * no hay área responsable con la que comparar.
   */
  canResolveSituation(
    actor: AuthPayload,
    situation: Pick<SituationOwnership, 'coordinationId'>,
  ): boolean {
    if (!actor.permissions.includes('SITUATIONS_CLOSE')) {
      return false;
    }

    if (this.normalizeRoleCode(actor.roleCode) !== COORDINATOR_ROLE_CODE) {
      return false;
    }

    if (!actor.coordinationId || !situation.coordinationId) {
      return false;
    }

    return situation.coordinationId === actor.coordinationId;
  }

  /** Variante que lanza. Misma política, para las rutas de escritura. */
  assertCanResolveSituation(
    actor: AuthPayload,
    situation: Pick<SituationOwnership, 'coordinationId'>,
  ): void {
    this.assertPermission(actor, 'SITUATIONS_CLOSE');

    if (!this.canResolveSituation(actor, situation)) {
      throw new ForbiddenException(
        'Solo el coordinador de la coordinación responsable puede solucionar este problema.',
      );
    }
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
