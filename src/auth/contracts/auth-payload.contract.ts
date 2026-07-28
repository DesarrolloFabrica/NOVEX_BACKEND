import { UserStatus } from '../../common/enums/identity.enums';

/**
 * Payload oficial del token JWT de CUNMARK.
 */
export interface AuthPayload {
  sub: string;
  email: string;
  roleId: string;
  roleCode: string;
  coordinationId: string;
  permissions: string[];
  status: UserStatus;
}
