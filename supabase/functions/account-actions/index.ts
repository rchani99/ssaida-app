import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createRemoteJWKSet } from 'npm:jose@6.1.0';

import { ActionError, createHandler } from './core.ts';
import { verifyGoogleToken } from './google-proof.ts';

import type { Actor, Challenge } from './core.ts';

// Deno-only runtime. No module in this directory may be imported by the mobile app.
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const audience = Deno.env.get('ACCOUNT_ACTIONS_GOOGLE_CLIENT_ID');
const enabled = Deno.env.get('ACCOUNT_ACTIONS_ENABLED') === 'true';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

if (!enabled || !url || !key || !audience) {
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
  Deno.serve(
    createHandler({
      audience,
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
      async begin(actor, purpose) {
        return (await rpc('begin_sensitive_action', {
          p_user_id: actor.id,
          p_purpose: purpose,
          p_google_sub: actor.googleSub,
          p_nonce: crypto.randomUUID() + crypto.randomUUID(),
        })) as Challenge;
      },
      async get(actor, id) {
        const { data, error } = await admin
          .from('sensitive_action_challenges')
          .select('*')
          .eq('id', id)
          .eq('user_id', actor.id)
          .single();
        if (error || !data) throw new ActionError(403, 'REAUTH_REQUIRED');
        return data as Challenge;
      },
      async verifyGoogle(token) {
        return await verifyGoogleToken(token, googleKeys, audience);
      },
      verify: (actor, id, at) =>
        rpc('verify_sensitive_action', { ...args(actor, id), p_auth_time: at }),
      cancel: (actor, id) => rpc('cancel_sensitive_action', args(actor, id)),
      consumeDelete: (actor, id) =>
        rpc('consume_sensitive_action', { ...args(actor, id), p_purpose: 'delete_account' }),
      resetPin: (actor, id, pin) =>
        rpc('reset_parent_pin_with_proof', { ...args(actor, id), p_new_pin: pin }),
      async deleteUser(actor) {
        const { error } = await admin.auth.admin.deleteUser(actor.id, false);
        if (error) throw new ActionError(503, 'DELETE_FAILED');
      },
    }),
  );
}
