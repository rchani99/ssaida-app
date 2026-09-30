export type DeletionReceipt = { operationId: string; receipt: string; expiresAt: string };
export type DeletionStatus = 'pending' | 'deleted' | 'failed' | 'expired';
export type RecoveryMarker = {
  version: 1;
  phase: 'unconfirmed' | 'cleanup';
  userId: string;
  operation?: DeletionReceipt;
};
export function isDeletionReceipt(value: unknown): value is DeletionReceipt {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as DeletionReceipt;
  return (
    typeof candidate.operationId === 'string' &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(candidate.operationId) &&
    typeof candidate.receipt === 'string' &&
    /^[0-9a-f]{64}$/.test(candidate.receipt) &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Object.keys(value).every((key) => ['operationId', 'receipt', 'expiresAt'].includes(key))
  );
}
export type RecoveryDependencies = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
  currentUserId(): Promise<string | null>;
  clearNotifications(userId: string): Promise<void>;
  clearPreferences(userId: string): Promise<void>;
  clearCache(): Promise<void>;
  clearSession(): Promise<void>;
  deletionStatus?(operation: DeletionReceipt): Promise<DeletionStatus>;
  changed(): void;
};

// Only a read-only deletion receipt is persisted, never Auth/Google credentials or PIN/proof.
// Legacy markers without a receipt remain readable. The UUID selects account-scoped
// preferences and prevents a retry from signing out a different account on a shared device.
export function createAccountRecovery(deps: RecoveryDependencies) {
  let running: Promise<void> | null = null;
  let preparing = false;
  const read = async (): Promise<RecoveryMarker | null> => {
    const raw = await deps.read();
    if (raw === null) return null;
    let marker: RecoveryMarker;
    try {
      marker = JSON.parse(raw);
    } catch {
      throw new Error('RECOVERY_STATE_INVALID');
    }
    if (
      !marker ||
      marker.version !== 1 ||
      !['unconfirmed', 'cleanup'].includes(marker.phase) ||
      typeof marker.userId !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(marker.userId) ||
      (marker.operation !== undefined && !isDeletionReceipt(marker.operation)) ||
      Object.keys(marker).some((key) => !['version', 'phase', 'userId', 'operation'].includes(key))
    )
      throw new Error('RECOVERY_STATE_INVALID');
    return marker;
  };
  const save = async (
    userId: string,
    phase: RecoveryMarker['phase'],
    operation?: DeletionReceipt,
  ) => {
    await deps.write(
      JSON.stringify({ version: 1, phase, userId, ...(operation ? { operation } : {}) }),
    );
    deps.changed();
  };
  const ensureOwner = async (userId: string) => {
    const current = await deps.currentUserId();
    if (current && current !== userId) throw new Error('ACCOUNT_CHANGED');
  };
  return {
    read,
    async prepare(userId: string, operation?: DeletionReceipt) {
      if (running || preparing) throw new Error('RECOVERY_REQUIRED');
      preparing = true;
      try {
        if (await read()) throw new Error('RECOVERY_REQUIRED');
        if (operation !== undefined && !isDeletionReceipt(operation))
          throw new Error('INVALID_RECEIPT');
        await ensureOwner(userId);
        await save(userId, 'unconfirmed', operation); // Must succeed BEFORE sending the destructive request.
      } finally {
        preparing = false;
      }
    },
    async rejected(userId: string) {
      const marker = await read();
      if (marker?.userId !== userId || marker.phase !== 'unconfirmed')
        throw new Error('RECOVERY_REQUIRED');
      await deps.remove();
      deps.changed();
    },
    async confirmed(userId: string) {
      const marker = await read();
      // A concurrent receipt lookup may finish cleanup before the original HTTP response arrives.
      if (!marker) return;
      if (marker.userId !== userId) throw new Error('RECOVERY_REQUIRED');
      await save(userId, 'cleanup', marker.operation);
    },
    resume(): Promise<void> {
      if (running) return running;
      running = (async () => {
        let marker = await read();
        if (!marker) return;
        if (marker.phase !== 'cleanup') {
          if (!marker.operation || !deps.deletionStatus) throw new Error('DELETE_OUTCOME_UNKNOWN');
          const previous = marker;
          const status = await deps.deletionStatus(marker.operation);
          marker = await read();
          if (!marker) return; // A concurrent confirmed cleanup/rejection already completed.
          if (
            marker.userId !== previous.userId ||
            marker.operation?.operationId !== previous.operation?.operationId
          )
            throw new Error('RECOVERY_STATE_CHANGED');
          if (marker.phase !== 'cleanup') {
            if (status !== 'deleted')
              throw new Error(
                status === 'pending'
                  ? 'DELETE_PENDING'
                  : status === 'failed'
                    ? 'DELETE_NOT_EXECUTED'
                    : 'DELETE_RECEIPT_EXPIRED',
              );
            await save(marker.userId, 'cleanup', marker.operation);
          }
        }
        await ensureOwner(marker.userId);
        // Fence/drain producers FIRST; do not remove data while an old task could rewrite it.
        await deps.clearNotifications(marker.userId);
        await ensureOwner(marker.userId);
        await deps.clearPreferences(marker.userId);
        await deps.clearCache();
        await ensureOwner(marker.userId);
        await deps.clearSession();
        // Retain the marker on ANY partial failure, including failure to remove the marker itself.
        await deps.remove();
        deps.changed();
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
