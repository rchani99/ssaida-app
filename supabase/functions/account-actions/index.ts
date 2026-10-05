import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

import { ActionError, createHandler } from './core.ts';
import { createPurgeHandler } from './purge.ts';
import { generateReceipt, hashReceipt } from './receipt.ts';

import type { Actor, Challenge } from './core.ts';

// Deno-only runtime. No module in this directory may be imported by the mobile app.
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const enabled = Deno.env.get('ACCOUNT_ACTIONS_ENABLED') === 'true';
const purgeSecret = Deno.env.get('ACCOUNT_ACTIONS_PURGE_SECRET');

if (!enabled || !url || !key) {
  Deno.serve(() => Response.json({ code: 'NOT_CONFIGURED' }, { status: 503 }));
} else {
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new ActionError(409, 'ACTION_UNAVAILABLE');
    return data;
  };
  const args = (actor: Actor, id: string) => ({ p_user_id: actor.id, p_id: id });
  const handler = createHandler({
    now: Date.now,
    async authenticate(token) {
      // Network check: deleted users cannot reuse an otherwise unexpired JWT here.
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) throw new ActionError(401, 'AUTH_REQUIRED');
      const google = data.user.identities?.find((identity) => identity.provider === 'google');
      const sub = google?.identity_data?.sub;
      if (typeof sub !== 'string' || !sub) throw new ActionError(403, 'GOOGLE_IDENTITY_REQUIRED');
      return { id: data.user.id, googleSub: sub };
    },
    async request(actor, purpose) {
      return (await rpc('request_sensitive_action', {
        p_user_id: actor.id,
        p_purpose: purpose,
      })) as Challenge;
    },
    cancel: (actor, id) => rpc('cancel_sensitive_action', args(actor, id)),
    async prepareDelete(actor, id) {
      const receipt = generateReceipt();
      const operation = await rpc('prepare_account_deletion', {
        p_user_id: actor.id,
        p_challenge_id: id,
        p_receipt_hash: await hashReceipt(receipt),
      });
      return { ...operation, receipt };
    },
    consumeDelete: (actor, id, operationId) =>
      rpc('start_account_deletion', {
        p_user_id: actor.id,
        p_challenge_id: id,
        p_operation_id: operationId,
      }),
    deletionStatus: async (operationId, receipt) =>
      rpc('get_account_deletion_status', {
        p_operation_id: operationId,
        p_receipt_hash: await hashReceipt(receipt),
      }),
    resetPin: (actor, id, pin) =>
      rpc('reset_parent_pin_with_proof', { ...args(actor, id), p_new_pin: pin }),
    async deleteUser(actor) {
      const { error } = await admin.auth.admin.deleteUser(actor.id, false);
      if (error) throw new ActionError(503, 'DELETE_FAILED');
    },
  });
  const purge = createPurgeHandler({
    secret: purgeSecret,
    now: Date.now,
    claim: () => rpc('claim_due_account_deletion', {}) as Promise<string | null>,
    due: () => rpc('count_due_account_deletions', {}) as Promise<number>,
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw new ActionError(503, 'DELETE_FAILED');
    },
  });
  Deno.serve((request) =>
    new URL(request.url).pathname.endsWith('/account-actions/purge')
      ? purge(request)
      : handler(request),
  );
}
