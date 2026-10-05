export type SensitivePurpose = 'delete_account' | 'reset_parent_pin';
export type SensitiveRequest = {
  id: string;
  purpose: SensitivePurpose;
  availableAt: string;
  expiresAt: string;
};
type Result = { status?: string } & Partial<SensitiveRequest>;
export type SensitiveActionDependencies = {
  currentUserId(): Promise<string | null>;
  invoke(body: Record<string, string>): Promise<Result>;
  cleanupDeletedAccount(userId: string): Promise<void>;
  now?(): number;
};

// Per-screen, memory-only controller. Authorization is the waiting period recorded on the
// server, so this holds no proof and nothing here can shorten a wait: the local availableAt
// check only avoids a pointless request, and the server re-checks it on every execution.
export function createSensitiveActionFlow(deps: SensitiveActionDependencies) {
  const now = () => deps.now?.() ?? Date.now();
  let owner: string | null = null;
  let request: SensitiveRequest | null = null;
  let busy = false;
  let cancelled = false;
  let generation = 0;
  const sameUser = async () => {
    if (!owner || (await deps.currentUserId()) !== owner) throw new Error('ACCOUNT_CHANGED');
  };
  return {
    get request() {
      return request;
    },
    // Idempotent: the server returns the original record, so pressing this again after a
    // restart resumes the same window instead of starting a longer one.
    async begin(purpose: SensitivePurpose) {
      if (busy) throw new Error('ACTION_IN_PROGRESS');
      busy = true;
      cancelled = false;
      const current = ++generation;
      try {
        owner = await deps.currentUserId();
        if (!owner) throw new Error('AUTH_REQUIRED');
        const result = await deps.invoke({ action: 'begin', purpose });
        if (!result.id || !result.availableAt || !result.expiresAt || result.purpose !== purpose)
          throw new Error('INVALID_RESPONSE');
        if (cancelled || current !== generation) throw new Error('CANCELLED');
        await sameUser();
        request = result as SensitiveRequest;
        return request;
      } finally {
        busy = false;
      }
    },
    async cancel() {
      // Cancellation cannot undo an already submitted destructive operation.
      if (busy && request) throw new Error('ACTION_IN_PROGRESS');
      cancelled = true;
      generation++;
      if (request) {
        await sameUser();
        const result = await deps.invoke({ action: 'cancel', id: request.id });
        if (result.status !== 'cancelled') throw new Error('CANCEL_FAILED');
        request = null;
      }
    },
    async execute(newPin?: string) {
      if (busy || cancelled || !request) throw new Error('WAIT_REQUIRED');
      const purpose = request.purpose;
      if (purpose === 'reset_parent_pin' && !/^[0-9]{4}$/.test(newPin ?? ''))
        throw new Error('INVALID_PIN');
      const current = now();
      if (current < Date.parse(request.availableAt)) throw new Error('WAIT_REQUIRED');
      if (current >= Date.parse(request.expiresAt)) throw new Error('REQUEST_EXPIRED');
      busy = true;
      const target = request;
      try {
        await sameUser();
        const result = await deps.invoke(
          purpose === 'delete_account'
            ? { action: 'delete', id: target.id }
            : { action: 'reset_pin', id: target.id, newPin: newPin! },
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
        request = null;
        busy = false;
      }
    },
  };
}
