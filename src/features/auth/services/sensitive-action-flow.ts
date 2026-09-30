export type SensitivePurpose = 'delete_account' | 'reset_parent_pin';
export type ReauthenticationChallenge = {
  id: string;
  nonce: string;
  expiresAt: string;
  audience: string;
};
type Result = { status?: string } & Partial<ReauthenticationChallenge>;
export type SensitiveActionDependencies = {
  currentUserId(): Promise<string | null>;
  invoke(body: Record<string, string>): Promise<Result>;
  cleanupDeletedAccount(userId: string): Promise<void>;
};

// Per-screen, memory-only controller. Caller supplies a freshly authenticated Google ID token;
// ordinary Supabase login/refresh tokens are never accepted as a substitute.
export function createSensitiveActionFlow(deps: SensitiveActionDependencies) {
  let owner: string | null = null;
  let challenge: ReauthenticationChallenge | null = null;
  let purpose: SensitivePurpose | null = null;
  let verified = false;
  let busy = false;
  let cancelled = false;
  let generation = 0;
  const sameUser = async () => {
    if (!owner || (await deps.currentUserId()) !== owner) throw new Error('ACCOUNT_CHANGED');
  };
  return {
    async begin(nextPurpose: SensitivePurpose) {
      if (busy || challenge) throw new Error('ACTION_IN_PROGRESS');
      busy = true;
      cancelled = false;
      const current = ++generation;
      try {
        owner = await deps.currentUserId();
        if (!owner) throw new Error('AUTH_REQUIRED');
        const result = await deps.invoke({ action: 'begin', purpose: nextPurpose });
        if (!result.id || !result.nonce || !result.expiresAt || !result.audience)
          throw new Error('INVALID_RESPONSE');
        if (cancelled || current !== generation) {
          await deps.invoke({ action: 'cancel', id: result.id });
          throw new Error('CANCELLED');
        }
        await sameUser();
        purpose = nextPurpose;
        challenge = result as ReauthenticationChallenge;
        return challenge;
      } finally {
        busy = false;
      }
    },
    async verify(idToken: string) {
      if (busy || cancelled || !challenge) throw new Error('REAUTH_REQUIRED');
      busy = true;
      const current = generation;
      try {
        await sameUser();
        const result = await deps.invoke({ action: 'verify', id: challenge.id, idToken });
        await sameUser();
        if (cancelled || current !== generation || result.status !== 'verified')
          throw new Error('REAUTH_REQUIRED');
        verified = true;
      } finally {
        busy = false;
      }
    },
    async cancel() {
      // Cancellation cannot undo an already submitted destructive operation.
      if (busy && verified) throw new Error('ACTION_IN_PROGRESS');
      cancelled = true;
      verified = false;
      generation++;
      if (challenge) {
        await sameUser();
        const result = await deps.invoke({ action: 'cancel', id: challenge.id });
        if (result.status !== 'cancelled') throw new Error('CANCEL_FAILED');
        challenge = null;
      }
    },
    async execute(newPin?: string) {
      if (busy || cancelled || !verified || !challenge || !purpose)
        throw new Error('REAUTH_REQUIRED');
      if (purpose === 'reset_parent_pin' && !/^[0-9]{4}$/.test(newPin ?? ''))
        throw new Error('INVALID_PIN');
      busy = true;
      try {
        await sameUser();
        const result = await deps.invoke(
          purpose === 'delete_account'
            ? { action: 'delete', id: challenge.id }
            : { action: 'reset_pin', id: challenge.id, newPin: newPin! },
        );
        const expected = purpose === 'delete_account' ? 'deleted' : 'pin_reset';
        if (result.status !== expected) throw new Error('INVALID_RESPONSE');
        if (purpose === 'delete_account') {
          const currentUser = await deps.currentUserId();
          if (currentUser && currentUser !== owner) throw new Error('ACCOUNT_CHANGED');
          await deps.cleanupDeletedAccount(owner!);
        } else {
          await sameUser();
        }
        return expected;
      } finally {
        // An ambiguous server response must not permit replay. Never clean locally on failure.
        verified = false;
        challenge = null;
        busy = false;
      }
    },
  };
}
