import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'npm:jose@6.1.0';

import { validateGoogleClaims } from './core.ts';
import { verifyGoogleToken } from './google-proof.ts';

Deno.test(
  'real RS256 verification rejects forged, expired, wrong audience/issuer and stale authentication',
  async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    const keys = createLocalJWKSet({
      keys: [{ ...jwk, kid: 'isolated', alg: 'RS256', use: 'sig' }],
    });
    const now = Math.floor(Date.now() / 1000);
    const base = {
      sub: 'google-a',
      nonce: 'isolated-nonce',
      auth_time: now,
      iss: 'https://accounts.google.com',
      aud: 'isolated-client',
      iat: now,
      exp: now + 60,
    };
    const challenge = {
      id: 'isolated',
      user_id: 'a',
      google_sub: 'google-a',
      nonce: 'isolated-nonce',
      purpose: 'delete_account' as const,
      status: 'pending',
      created_at: new Date(now * 1000).toISOString(),
      expires_at: new Date((now + 60) * 1000).toISOString(),
    };
    const sign = (payload: Record<string, unknown>, privateKey = pair.privateKey) =>
      new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'isolated' }).sign(privateKey);
    const verify = async (token: string) => {
      const claims = await verifyGoogleToken(token, keys, 'isolated-client');
      validateGoogleClaims(
        claims,
        challenge,
        { id: 'a', googleSub: 'google-a' },
        'isolated-client',
        now * 1000,
      );
    };
    await verify(await sign(base));
    const wrongKey = await generateKeyPair('RS256');
    const invalid = [
      await sign(base, wrongKey.privateKey),
      await sign({ ...base, exp: now - 1 }),
      await sign({ ...base, aud: 'another-client' }),
      await sign({ ...base, iss: 'https://attacker.invalid' }),
      await sign({ ...base, nonce: 'another-nonce' }),
      await sign({ ...base, sub: 'another-user' }),
      await sign({ ...base, auth_time: undefined }),
      await sign({ ...base, auth_time: now - 3600 }),
      await sign({ ...base, auth_time: now + 60 }),
    ];
    for (const token of invalid) {
      let rejected = false;
      try {
        await verify(token);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('Invalid proof accepted');
    }
  },
);
