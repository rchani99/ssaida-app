import { ActionError } from './core.ts';

export type DeletionLease = { requestId: string; userId: string; leaseToken: string };
export type ExecutorDependencies = {
  prepare(lease: DeletionLease): Promise<void>;
  deleteAuth(userId: string): Promise<void>;
  completed(requestId: string): Promise<boolean>;
  fail(lease: DeletionLease, code: 'CLEANUP_FAILED' | 'AUTH_DELETE_FAILED'): Promise<void>;
};

// Both manual and scheduled execution use the same persisted, fenced state machine.
// Admin deletion is idempotent; only the Auth commit trigger is evidence of completion.
export function createDeletionExecutor(deps: ExecutorDependencies) {
  return async (lease: DeletionLease): Promise<void> => {
    let stage: 'CLEANUP_FAILED' | 'AUTH_DELETE_FAILED' = 'CLEANUP_FAILED';
    try {
      if (await deps.completed(lease.requestId)) return;
      await deps.prepare(lease);
      stage = 'AUTH_DELETE_FAILED';
      await deps.deleteAuth(lease.userId);
      if (!(await deps.completed(lease.requestId))) throw new Error('Unconfirmed deletion');
    } catch {
      // A lost HTTP response after Auth COMMIT must not turn a completed request into failure.
      try {
        if (await deps.completed(lease.requestId)) return;
      } catch {
        /* Keep the durable processing fence on ambiguous network failures. */
      }
      try {
        await deps.fail(lease, stage);
      } catch {
        /* Lease expiry permits recovery even if recording this failure was lost. */
      }
      throw new ActionError(503, 'DELETE_FAILED');
    }
  };
}
