import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../contracts/auth-payload.contract';

/** Datos mínimos de una situación para decidir quién puede intervenirla. */
export interface SituationOwnership {
  coordinationId: string | null;
  /** Coordinación que sufre el impacto (INTER). Lectura, no cierre. */
  affectedCoordinationId?: string | null;
  createdByUserId: string;
}

/** Código del rol que coordina un área. */
export const COORDINATOR_ROLE_CODE = 'COORDINADOR';

/** Código del rol de analista operacional. */
export const ANALYST_ROLE_CODE = 'ANALISTA';

/**
 * Coordinación General de Operaciones: código de catálogo canónico.
 * Un ANALISTA solo puede resolver problemas cuya coordinación RESPONSABLE
 * (`coordinationId`) es esta área. Ser afectada no concede cierre.
 */
export const GENERAL_OPERATIONS_COORDINATION_CODE = 'coord-general';

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
    situation: {
      coordinationId: string | null;
      affectedCoordinationId?: string | null;
      createdByUserId: string;
    },
  ): void {
    this.assertPermission(actor, 'SITUATIONS_VIEW');

    if (this.isOwnReport(actor, situation)) {
      return;
    }

    /*
     * COORDINADOR DE LA AFECTADA: puede consultar el avance de una dependencia
     * que impacta su área, sin ganar permiso de cierre (eso sigue en
     * canResolveSituation / coordinación responsable).
     */
    if (
      this.isCoordinationScoped(actor) &&
      actor.coordinationId &&
      situation.affectedCoordinationId &&
      situation.affectedCoordinationId === actor.coordinationId
    ) {
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
   * REGLA DE RESOLUCIÓN (solucionar). Política ÚNICA del sistema: la consumen
   * el endpoint de resolución y el indicador `canResolve` de las respuestas.
   *
   *   COORDINADOR  Solo si coordina exactamente el área RESPONSABLE
   *                (`coordinationId` del problema).
   *   ANALISTA     Solo si la coordinación RESPONSABLE es Coordinación
   *                General de Operaciones (`coord-general` → UUID
   *                `generalCoordinationId`). `affectedCoordinationId` NO
   *                concede permiso de resolución, ni siquiera si el ANALISTA
   *                es el autor del reporte.
   *
   * NO conceden excepción: ADMIN, DIRECTOR, haber reportado, coordinar un
   * área solo relacionada o afectada.
   *
   * Un problema SIN coordinación responsable igual a General no lo resuelve
   * el ANALISTA por esta vía.
   */
  canResolveSituation(
    actor: AuthPayload,
    situation: Pick<
      SituationOwnership,
      'coordinationId' | 'affectedCoordinationId'
    >,
    generalCoordinationId: string | null = null,
  ): boolean {
    if (!actor.permissions.includes('SITUATIONS_CLOSE')) {
      return false;
    }

    const role = this.normalizeRoleCode(actor.roleCode);

    if (role === ANALYST_ROLE_CODE) {
      if (!generalCoordinationId || !situation.coordinationId) {
        return false;
      }
      return situation.coordinationId === generalCoordinationId;
    }

    if (role !== COORDINATOR_ROLE_CODE) {
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
    situation: Pick<
      SituationOwnership,
      'coordinationId' | 'affectedCoordinationId'
    >,
    generalCoordinationId: string | null = null,
  ): void {
    this.assertPermission(actor, 'SITUATIONS_CLOSE');

    if (
      this.canResolveSituation(actor, situation, generalCoordinationId)
    ) {
      return;
    }

    const role = this.normalizeRoleCode(actor.roleCode);
    if (role === ANALYST_ROLE_CODE) {
      throw new ForbiddenException(
        'Solo puede solucionar problemas de Coordinación General de Operaciones.',
      );
    }

    throw new ForbiddenException(
      'Solo el coordinador de la coordinación responsable puede solucionar este problema.',
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

  /**
   * REGLA DE AVANCE OPEN → IN_PROGRESS. Independiente de `canUpdateSituation`
   * (autoría u otras ediciones) y de `canResolveSituation`.
   *
   *   COORDINADOR  Solo si coordina el área RESPONSABLE.
   *   ANALISTA     Solo si la responsable es Coordinación General
   *                (`coord-general` → UUID). Autoría o ser afectada NO
   *                conceden el avance.
   *
   * ADMIN/DIRECTOR no avanzan. Reportar o haber creado el caso no basta.
   */
  canAdvanceSituationToInProgress(
    actor: AuthPayload,
    situation: Pick<SituationOwnership, 'coordinationId'>,
    generalCoordinationId: string | null = null,
  ): boolean {
    if (!actor.permissions.includes('SITUATIONS_UPDATE')) {
      return false;
    }

    const role = this.normalizeRoleCode(actor.roleCode);

    if (role === ANALYST_ROLE_CODE) {
      if (!generalCoordinationId || !situation.coordinationId) {
        return false;
      }
      return situation.coordinationId === generalCoordinationId;
    }

    if (role !== COORDINATOR_ROLE_CODE) {
      return false;
    }

    if (!actor.coordinationId || !situation.coordinationId) {
      return false;
    }

    return situation.coordinationId === actor.coordinationId;
  }

  assertCanAdvanceSituationToInProgress(
    actor: AuthPayload,
    situation: Pick<SituationOwnership, 'coordinationId'>,
    generalCoordinationId: string | null = null,
  ): void {
    this.assertPermission(actor, 'SITUATIONS_UPDATE');

    if (
      this.canAdvanceSituationToInProgress(
        actor,
        situation,
        generalCoordinationId,
      )
    ) {
      return;
    }

    const role = this.normalizeRoleCode(actor.roleCode);
    if (role === ANALYST_ROLE_CODE) {
      throw new ForbiddenException(
        'Solo puede pasar a «En atención» problemas cuya coordinación responsable es Coordinación General de Operaciones.',
      );
    }

    throw new ForbiddenException(
      'Solo el coordinador de la coordinación responsable puede pasar este problema a «En atención».',
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
