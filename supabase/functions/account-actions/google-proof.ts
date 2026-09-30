import { jwtVerify } from 'npm:jose@6.1.0';

import type { JWTVerifyGetKey } from 'npm:jose@6.1.0';

export async function verifyGoogleToken(token: string, keys: JWTVerifyGetKey, audience: string) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'auth_time'],
  });
  return payload;
}
