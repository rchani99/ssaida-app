import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

import { ActionError, createHandler } from './core.ts';
import { withCors } from './cors.ts';
import { createEmailCrypto } from './email-crypto.ts';
import { createEmailDispatcher } from './email-mailer.ts';
import { createDeletionEmailSender } from './email-provider.ts';
import { createEmailHandler } from './email.ts';
import { createDeletionExecutor } from './executor.ts';
import { createPurgeHandler, sameSecret } from './purge.ts';
import { generateReceipt, hashReceipt } from './receipt.ts';

import type { Actor, Challenge } from './core.ts';
import type { EmailCrypto } from './email-crypto.ts';
import type { MailLease } from './email-mailer.ts';
import type { DeletionLease } from './executor.ts';

// Deno-only runtime. No module in this directory may be imported by the mobile app.
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const enabled = Deno.env.get('ACCOUNT_ACTIONS_ENABLED') === 'true';
const pinRecoveryEnabled = Deno.env.get('PIN_RECOVERY_ENABLED') === 'true';
const purgeSecret = Deno.env.get('ACCOUNT_ACTIONS_PURGE_SECRET');

if ((!enabled && !pinRecoveryEnabled) || !url || !key) {
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
  // Explicit provider selection; missing production secrets never fall back to mock.
  let emailCrypto: EmailCrypto | undefined;
  const mailWorkerSecret = Deno.env.get('ACCOUNT_DELETION_MAIL_WORKER_SECRET');
  const emailSender = createDeletionEmailSender({
    mode: Deno.env.get('ACCOUNT_DELETION_EMAIL_MODE'),
    supabaseUrl: url,
    resendApiKey: Deno.env.get('RESEND_API_KEY'),
    from: Deno.env.get('DELETION_EMAIL_FROM'),
  });
  if (emailSender && enabled && purgeSecret && mailWorkerSecret && mailWorkerSecret.length >= 32) {
    try {
      emailCrypto = createEmailCrypto(
        Deno.env.get('ACCOUNT_DELETION_EMAIL_HMAC_KEY') ?? '',
        Deno.env.get('ACCOUNT_DELETION_EMAIL_ENCRYPTION_KEY') ?? '',
      );
    } catch {
      /* Invalid configuration fails closed without echoing secrets. */
    }
  }
  const dispatchEmail =
    emailCrypto && emailSender
      ? createEmailDispatcher({
          claim: () => rpc('claim_deletion_email_delivery', {}) as Promise<MailLease | null>,
          async finish(lease, outcome, retryAfterSeconds) {
            await rpc('finish_deletion_email_delivery', {
              p_id: lease.requestId,
              p_lease_token: lease.leaseToken,
              p_outcome: outcome,
              p_retry_after_seconds: retryAfterSeconds,
            });
          },
          open: emailCrypto.open,
          sender: emailSender,
        })
      : undefined;
  const executeDeletion = createDeletionExecutor({
    async prepare(lease) {
      await rpc('prepare_account_deletion_cleanup', {
        p_request_id: lease.requestId,
        p_lease_token: lease.leaseToken,
      });
    },
    async deleteAuth(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw new ActionError(503, 'DELETE_FAILED');
    },
    completed: (requestId) => rpc('account_deletion_completed', { p_request_id: requestId }),
    async fail(lease, code) {
      await rpc('fail_account_deletion', {
        p_request_id: lease.requestId,
        p_lease_token: lease.leaseToken,
        p_code: code,
      });
    },
  });
  const handler = createHandler({
    enabled: (purpose) =>
      purpose === 'delete_account'
        ? enabled && Boolean(purgeSecret)
        : enabled || pinRecoveryEnabled,
    now: Date.now,
    async authenticate(token) {
      // Network check: deleted users cannot reuse an otherwise unexpired JWT here.
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) throw new ActionError(401, 'AUTH_REQUIRED');
      const google = data.user.identities?.find((identity) => identity.provider === 'google');
      const sub = google?.identity_data?.sub;
      await rpc('assert_account_access', { p_user_id: data.user.id });
      return { id: data.user.id, googleSub: typeof sub === 'string' ? sub : '' };
    },
    // Stage-1 confirmation had no explicit consent or web capability binding. It is
    // deliberately unavailable; all new confirmations use the dedicated /email route.
    async request(actor, purpose) {
      if (purpose === 'delete_account') {
        const { data, error } = await admin
          .from('sensitive_action_challenges')
          .select('id')
          .eq('user_id', actor.id)
          .eq('purpose', purpose)
          .eq('status', 'consumed')
          .limit(1);
        if (error || data?.length) throw new ActionError(409, 'ACTION_UNAVAILABLE');
      }
      return (await rpc('request_sensitive_action', {
        p_user_id: actor.id,
        p_purpose: purpose,
      })) as Challenge;
    },
    async resume(actor, purpose) {
      let query = admin
        .from('sensitive_action_challenges')
        .select('id,user_id,purpose,status,created_at,available_at,expires_at')
        .eq('user_id', actor.id)
        .eq('purpose', purpose)
        .in('status', purpose === 'delete_account' ? ['pending', 'consumed'] : ['pending']);
      if (purpose !== 'delete_account') query = query.gt('expires_at', new Date().toISOString());
      const { data, error } = await query.maybeSingle();
      if (error) throw new ActionError(409, 'ACTION_UNAVAILABLE');
      return data as Challenge | null;
    },
    async cancel(actor, id) {
      if (!actor.googleSub) {
        const { data, error } = await admin
          .from('sensitive_action_challenges')
          .select('purpose')
          .eq('id', id)
          .eq('user_id', actor.id)
          .maybeSingle();
        if (error) throw new ActionError(409, 'ACTION_UNAVAILABLE');
        if (data?.purpose === 'reset_parent_pin')
          throw new ActionError(403, 'GOOGLE_IDENTITY_REQUIRED');
      }
      return rpc('cancel_sensitive_action', args(actor, id));
    },
    async watchDelete(actor, id) {
      const receipt = generateReceipt();
      const operation = await rpc('watch_account_deletion', {
        p_user_id: actor.id,
        p_challenge_id: id,
        p_receipt_hash: await hashReceipt(receipt),
      });
      return { ...operation, receipt };
    },
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
      rpc('validate_account_deletion_operation', {
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
      const lease = (await rpc('claim_account_deletion', {
        p_user_id: actor.id,
      })) as DeletionLease | null;
      if (!lease) throw new ActionError(503, 'DELETE_FAILED');
      await executeDeletion(lease);
    },
  });
  const purge = createPurgeHandler({
    secret: enabled ? purgeSecret : undefined,
    now: Date.now,
    claim: () => rpc('claim_account_deletion', {}) as Promise<DeletionLease | null>,
    due: () => rpc('count_due_account_deletions', {}) as Promise<number>,
    deleteUser: executeDeletion,
  });
  Deno.serve((request, info) =>
    withCors(async (incoming) => {
      const path = new URL(incoming.url).pathname;
      if (path.endsWith('/account-actions/email/send')) {
        const bearer = incoming.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
        const response = (body: object, status = 200) =>
          Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
        if (incoming.method !== 'POST') return response({ code: 'METHOD_NOT_ALLOWED' }, 405);
        if (!dispatchEmail || !mailWorkerSecret)
          return response({ code: 'EMAIL_NOT_CONFIGURED' }, 503);
        if (!bearer || !sameSecret(bearer, mailWorkerSecret))
          return response({ code: 'AUTH_REQUIRED' }, 401);
        try {
          return response(await dispatchEmail());
        } catch {
          return response({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }, 503);
        }
      }
      if (path.endsWith('/account-actions/email')) {
        if (!emailCrypto)
          return Response.json(
            { code: 'EMAIL_NOT_CONFIGURED' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          );
        return createEmailHandler({
          configured: true,
          crypto: emailCrypto,
          rpc,
          // Hosted gateway attribution requires separate validation before production is
          // enabled. Never trust arbitrary client-supplied forwarded IP headers here.
          clientIp: () => info.remoteAddr.hostname,
          async authenticate(token) {
            const { data, error } = await admin.auth.getUser(token);
            if (error || !data.user?.email) throw new ActionError(401, 'AUTH_REQUIRED');
            await rpc('assert_account_access', { p_user_id: data.user.id });
            return { id: data.user.id, email: data.user.email };
          },
        })(incoming);
      }
      return path.endsWith('/account-actions/purge') ? purge(incoming) : handler(incoming);
    }, Deno.env.get('ACCOUNT_ACTIONS_ALLOWED_ORIGINS'))(request),
  );
}
