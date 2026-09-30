export type Purpose = 'delete_account' | 'reset_parent_pin';
export type Challenge = {
  id: string;
  user_id: string;
  google_sub: string;
  nonce: string;
  purpose: Purpose;
  status: string;
  created_at: string;
  expires_at: string;
};
export type Actor = { id: string; googleSub: string };
export type GoogleClaims = {
  sub?: string;
  nonce?: string;
  auth_time?: unknown;
  iat?: number;
  azp?: string;
};
export class ActionError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export function validateGoogleClaims(
  claims: GoogleClaims,
  challenge: Challenge,
  actor: Actor,
  audience: string,
  now: number,
) {
  const authTime = claims.auth_time;
  if (
    challenge.user_id !== actor.id ||
    challenge.google_sub !== actor.googleSub ||
    claims.sub !== actor.googleSub ||
    claims.nonce !== challenge.nonce ||
    (claims.azp !== undefined && claims.azp !== audience) ||
    challenge.status !== 'pending' ||
    Date.parse(challenge.expires_at) <= now ||
    typeof authTime !== 'number' ||
    !Number.isSafeInteger(authTime) ||
    authTime * 1000 < Date.parse(challenge.created_at) - 5000 ||
    authTime * 1000 < now - 300000 ||
    authTime * 1000 > now + 5000 ||
    typeof claims.iat !== 'number' ||
    claims.iat * 1000 > now + 5000
  ) {
    throw new ActionError(403, 'REAUTH_REQUIRED');
  }
  return new Date(authTime * 1000).toISOString();
}

export type Dependencies = {
  authenticate(token: string): Promise<Actor>;
  begin(actor: Actor, purpose: Purpose): Promise<Challenge>;
  get(actor: Actor, id: string): Promise<Challenge>;
  verifyGoogle(token: string): Promise<GoogleClaims>;
  verify(actor: Actor, id: string, at: string): Promise<boolean>;
  cancel(actor: Actor, id: string): Promise<boolean>;
  consumeDelete(actor: Actor, id: string): Promise<boolean>;
  deleteUser(actor: Actor): Promise<void>;
  resetPin(actor: Actor, id: string, pin: string): Promise<boolean>;
  audience: string;
  now(): number;
};

// This handler never trusts a body user ID, session iat or a client "reauthenticated" flag.
export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const response = (body: object, status = 200) =>
      Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
      });
    try {
      if (request.method !== 'POST') throw new ActionError(405, 'METHOD_NOT_ALLOWED');
      const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!bearer) throw new ActionError(401, 'AUTH_REQUIRED');
      const actor = await deps.authenticate(bearer);
      const raw = await request.text();
      if (raw.length > 16000) throw new ActionError(413, 'INVALID_REQUEST');
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new ActionError(400, 'INVALID_REQUEST');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new ActionError(400, 'INVALID_REQUEST');
      const keys: Record<string, string[]> = {
        begin: ['action', 'purpose'],
        verify: ['action', 'id', 'idToken'],
        cancel: ['action', 'id'],
        delete: ['action', 'id'],
        reset_pin: ['action', 'id', 'newPin'],
      };
      const action = typeof body.action === 'string' ? body.action : '';
      if (!keys[action] || Object.keys(body).some((key) => !keys[action].includes(key)))
        throw new ActionError(400, 'INVALID_REQUEST');
      if (action === 'begin') {
        if (body.purpose !== 'delete_account' && body.purpose !== 'reset_parent_pin')
          throw new ActionError(400, 'INVALID_REQUEST');
        const challenge = await deps.begin(actor, body.purpose);
        return response({
          id: challenge.id,
          nonce: challenge.nonce,
          expiresAt: challenge.expires_at,
          audience: deps.audience,
        });
      }
      if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id))
        throw new ActionError(400, 'INVALID_REQUEST');
      if (action === 'cancel') {
        if (!(await deps.cancel(actor, body.id))) throw new ActionError(409, 'NOT_CANCELLABLE');
        return response({ status: 'cancelled' });
      }
      if (action === 'verify') {
        if (typeof body.idToken !== 'string' || body.idToken.length > 12000)
          throw new ActionError(400, 'INVALID_REQUEST');
        const challenge = await deps.get(actor, body.id);
        let claims: GoogleClaims;
        try {
          claims = await deps.verifyGoogle(body.idToken);
        } catch {
          throw new ActionError(403, 'REAUTH_REQUIRED');
        }
        const at = validateGoogleClaims(claims, challenge, actor, deps.audience, deps.now());
        if (!(await deps.verify(actor, body.id, at))) throw new ActionError(403, 'REAUTH_REQUIRED');
        return response({ status: 'verified' });
      }
      if (action === 'reset_pin') {
        if (typeof body.newPin !== 'string' || !/^[0-9]{4}$/.test(body.newPin))
          throw new ActionError(400, 'INVALID_REQUEST');
        if (!(await deps.resetPin(actor, body.id, body.newPin)))
          throw new ActionError(403, 'REAUTH_REQUIRED');
        return response({ status: 'pin_reset' });
      }
      if (!(await deps.consumeDelete(actor, body.id)))
        throw new ActionError(403, 'REAUTH_REQUIRED');
      // Claim first, fail closed on admin failure. Retrying needs a NEW reauthentication.
      await deps.deleteUser(actor);
      return response({ status: 'deleted' });
    } catch (error) {
      // Never echo SDK errors, provider tokens, request bodies or PINs into responses/logs.
      return error instanceof ActionError
        ? response({ code: error.code }, error.status)
        : response({ code: 'ACTION_FAILED' }, 503);
    }
  };
}
