import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

/** Claims del ID token de Google que el guard necesita. */
export interface GoogleIdTokenClaims {
  iss?: string;
  aud?: string | string[];
  email?: string;
  email_verified?: boolean;
}

/**
 * Verificación criptográfica de un ID token emitido por Google (firma con las
 * claves públicas de Google, expiración y audiencia). Aislada en su propia
 * clase para poder sustituirla en tests sin red.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(
    idToken: string,
    audience: string,
  ): Promise<GoogleIdTokenClaims> {
    const ticket = await this.client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('ID token sin payload.');
    }
    return payload;
  }
}
