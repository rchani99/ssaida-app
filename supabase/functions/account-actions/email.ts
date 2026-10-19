import { ActionError, readSmallJson } from './core.ts';

import type { EmailCrypto } from './email-crypto.ts';

type Channel = 'app' | 'web';
export type EmailDependencies = {
  configured: boolean;
  crypto: EmailCrypto;
  authenticate(token: string): Promise<{ id: string; email: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  // Must come from the connection or a verified overwriting proxy, never arbitrary XFF.
  clientIp(request: Request): string;
};
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const token = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function createEmailHandler(deps: EmailDependencies) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: object, status = 200) =>
      Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
      if (request.method !== 'POST') throw new ActionError(405, 'METHOD_NOT_ALLOWED');
      if (!deps.configured) throw new ActionError(503, 'EMAIL_NOT_CONFIGURED');
      const body = await readSmallJson(request);
      const action = body.action;
      const keys: Record<string, string[]> = {
        request_deletion_email: ['action', 'channel', 'email'],
        verify_deletion_email: ['action', 'channel', 'requestId', 'flowToken', 'code'],
        confirm_deletion: [
          'action',
          'channel',
          'proofId',
          'flowToken',
          'proofToken',
          'receipt',
          'consent',
        ],
      };
      if (
        typeof action !== 'string' ||
        !keys[action] ||
        Object.keys(body).some((key) => !keys[action].includes(key)) ||
        (body.channel !== 'app' && body.channel !== 'web')
      )
        throw new ActionError(400, 'INVALID_REQUEST');
      const channel: Channel = body.channel;
      let actor: { id: string; email: string } | null = null;
      if (channel === 'app') {
        const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
        if (!bearer) throw new ActionError(401, 'AUTH_REQUIRED');
        actor = await deps.authenticate(bearer);
        if ('email' in body) throw new ActionError(400, 'INVALID_REQUEST');
      } else if (request.headers.has('authorization'))
        throw new ActionError(400, 'INVALID_REQUEST');
      const ip = deps.clientIp(request);
      if (!ip) throw new ActionError(503, 'EMAIL_NOT_CONFIGURED');
      const ipHash = await deps.crypto.tag('ip', ip);
      if (action === 'request_deletion_email') {
        const email = (actor?.email ?? (typeof body.email === 'string' ? body.email : ''))
          .trim()
          .toLowerCase();
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new ActionError(400, 'INVALID_REQUEST');
        const requestId = crypto.randomUUID(),
          flowToken = deps.crypto.token();
        const emailHash = await deps.crypto.tag('email', email);
        const allowed = await deps.rpc('deletion_email_budget', {
          p_action: 'request',
          p_ip_hash: ipHash,
          p_email_hash: emailHash,
        });
        if (allowed === true) {
          const code = deps.crypto.code();
          await deps.rpc('enqueue_deletion_email', {
            p_id: requestId,
            p_channel: channel,
            p_user_id: actor?.id ?? null,
            p_email: email,
            p_email_hash: emailHash,
            p_flow_hash: await deps.crypto.hash(flowToken),
            p_code_hmac: await deps.crypto.tag('code', `${requestId}:${code}`),
            p_ciphertext: await deps.crypto.seal(requestId, { email, code }),
          });
        }
        // Real, unknown, cooldown and rate-limited email addresses have the same envelope.
        return respond(
          { status: 'accepted', requestId, flowToken, expiresIn: 600, retryAfter: 60 },
          202,
        );
      }
      const allowed = await deps.rpc('deletion_email_budget', {
        p_action: action === 'verify_deletion_email' ? 'verify' : 'confirm',
        p_ip_hash: ipHash,
      });
      if (allowed !== true) throw new ActionError(429, 'RATE_LIMITED');
      if (!token(body.flowToken)) throw new ActionError(400, 'INVALID_REQUEST');
      const flowHash = await deps.crypto.hash(body.flowToken);
      if (action === 'verify_deletion_email') {
        // Malformed codes use an impossible HMAC too, and consume the same attempt budget.
        if (!uuid(body.requestId) || typeof body.code !== 'string' || body.code.length > 128)
          throw new ActionError(400, 'INVALID_REQUEST');
        const proofToken = deps.crypto.token();
        const result = await deps.rpc('verify_deletion_email_code', {
          p_id: body.requestId,
          p_channel: channel,
          p_user_id: actor?.id ?? null,
          p_flow_hash: flowHash,
          p_code_hmac: await deps.crypto.tag(
            'code',
            `${body.requestId}:${/^[0-9]{8}$/.test(body.code) ? body.code : 'invalid'}`,
          ),
          p_token_hash: await deps.crypto.hash(proofToken),
        });
        if (!result || typeof result !== 'object')
          throw new ActionError(400, 'VERIFICATION_UNAVAILABLE');
        return respond({ ...result, proofToken });
      }
      if (
        !uuid(body.proofId) ||
        !token(body.proofToken) ||
        !token(body.receipt) ||
        body.consent !== true ||
        body.receipt === body.proofToken ||
        body.receipt === body.flowToken ||
        body.proofToken === body.flowToken
      )
        throw new ActionError(400, 'INVALID_REQUEST');
      const result = await deps.rpc('confirm_deletion_email', {
        p_proof_id: body.proofId,
        p_channel: channel,
        p_user_id: actor?.id ?? null,
        p_flow_hash: flowHash,
        p_token_hash: await deps.crypto.hash(body.proofToken),
        p_receipt_hash: await deps.crypto.hash(body.receipt),
        p_consent: true,
      });
      if (!result || typeof result !== 'object')
        throw new ActionError(409, 'CONFIRMATION_UNAVAILABLE');
      return respond(result);
    } catch (error) {
      return error instanceof ActionError
        ? respond({ code: error.code }, error.status)
        : respond({ code: 'EMAIL_ACTION_UNAVAILABLE' }, 503);
    }
  };
}
