import { ActionError } from './core.ts';

export type PurgeDependencies<T = string> = {
  // Undefined disables the route entirely: no secret, no scheduled deletion.
  secret?: string;
  claim(): Promise<T | null>;
  due(): Promise<number>;
  deleteUser(lease: T): Promise<void>;
  now(): number;
  // Bounds new starts; an in-flight call can outlast this budget and recover by lease expiry.
  maxDeletions?: number;
  budgetMs?: number;
};

// Constant-time comparison: a scheduler secret must not be discoverable byte by byte.
export function sameSecret(provided: string, expected: string) {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.byteLength ^ b.byteLength;
  for (let index = 0; index < a.byteLength; index++) diff |= a[index] ^ b[index % b.byteLength];
  return diff === 0;
}

// Finishes deletions whose waiting period elapsed, for owners who never came back.
// Authorized by a dedicated scheduler secret, never by an app session: no user JWT can
// reach this route, and it can only delete accounts the server already marked as due.
export function createPurgeHandler<T = string>(deps: PurgeDependencies<T>) {
  const limit = deps.maxDeletions ?? 25;
  const budget = deps.budgetMs ?? 20000;
  return async (request: Request): Promise<Response> => {
    const response = (body: object, status = 200) =>
      Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
      if (request.method !== 'POST') throw new ActionError(405, 'METHOD_NOT_ALLOWED');
      if (!deps.secret) throw new ActionError(503, 'NOT_CONFIGURED');
      const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!bearer || !sameSecret(bearer, deps.secret)) throw new ActionError(401, 'AUTH_REQUIRED');
      const started = deps.now();
      let deleted = 0;
      let stopped: string | null = null;
      while (deleted < limit && deps.now() - started < budget) {
        const lease = await deps.claim();
        if (!lease) break;
        try {
          await deps.deleteUser(lease);
        } catch {
          // The request stays consumed and claimed; the next run retries after the backoff.
          // Never echo the SDK error or the account identifier.
          stopped = 'DELETE_FAILED';
          break;
        }
        deleted++;
      }
      return response(
        { deleted, due: await deps.due(), ...(stopped ? { stopped } : {}) },
        stopped ? 503 : 200,
      );
    } catch (error) {
      return error instanceof ActionError
        ? response({ code: error.code }, error.status)
        : response({ code: 'PURGE_FAILED' }, 503);
    }
  };
}
