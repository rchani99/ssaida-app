import { getAppEnvironment } from '@/config/environment';

import type { DeletionReceipt, DeletionStatus } from './account-recovery-state';

// Deliberately bypass Auth/session refresh. Receipt authorizes ONLY the minimal status query.
export async function fetchDeletionStatus(operation: DeletionReceipt): Promise<DeletionStatus> {
  const { url, publishableKey } = getAppEnvironment();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(`${url}/functions/v1/account-actions/status`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: operation.operationId, receipt: operation.receipt }),
      signal: abort.signal,
    });
    if (!response.ok) throw new Error('STATUS_UNAVAILABLE');
    const result = await response.json();
    if (!result || !['pending', 'deleted', 'failed', 'expired'].includes(result.status))
      throw new Error('STATUS_UNAVAILABLE');
    return result.status;
  } catch {
    throw new Error('STATUS_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
