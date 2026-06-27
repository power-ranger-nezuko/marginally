import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

/**
 * Logs in and returns the access token string.
 */
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  const token: string = res.body.accessToken;
  if (!token) {
    throw new Error(
      `loginAs: no accessToken in response body: ${JSON.stringify(res.body)}`,
    );
  }
  return token;
}

export function getAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Returns an unsigned JWT-shaped string useful for testing rejection of
 * tampered tokens.  The signature segment is intentionally wrong.
 */
export function makeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const fakeSignature = 'invalidsignatureXXXXXXXXXXXXXXXXXXXXXXX';
  return `${header}.${body}.${fakeSignature}`;
}
