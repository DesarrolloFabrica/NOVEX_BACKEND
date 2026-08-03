/**
 * Payload oficial del token JWT de NOVEX.
 * Incluye id (sub), rol, coordinación y permisos embebidos
 * para autorizar sin consultas adicionales por request.
 */
import { UserStatus } from '../../common/enums/identity.enums';

export interface AuthPayload {
  /** Identificador del usuario (claim estándar JWT). */
  sub: string;
  email: string;
  roleId: string;
  roleCode: string;
  /** Coordinación principal del usuario; null si no tiene asignación. */
  coordinationId: string | null;
  permissions: string[];
  status: UserStatus;
}
