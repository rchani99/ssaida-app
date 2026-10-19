export type DeletionMail = { requestId: string; email: string; code: string };
export interface DeletionEmailSender {
  send(message: DeletionMail): Promise<void>;
}
export function isLocalMockEnabled(mode: string | undefined, url: string) {
  return (
    mode === 'mock' &&
    ['localhost', '127.0.0.1', 'kong', 'host.docker.internal'].includes(new URL(url).hostname)
  );
}
export class EmailDeliveryError extends Error {
  constructor(
    public outcome: 'RETRY' | 'FAILED' | 'UNKNOWN',
    public retryAfterSeconds = 15,
  ) {
    super('Email delivery unavailable');
  }
}
// Test/local dependency only. No console logging and no public inbox endpoint.
export class MockDeletionEmailSender implements DeletionEmailSender {
  readonly messages = new Map<string, DeletionMail>();
  async send(message: DeletionMail) {
    this.messages.set(message.requestId, { ...message });
  }
}
export type MailLease = { requestId: string; leaseToken: string; ciphertext: string };
export type DeliveryOutcome = 'SENT' | 'RETRY' | 'FAILED' | 'UNKNOWN';
export function createEmailDispatcher(deps: {
  claim(): Promise<MailLease | null>;
  finish(lease: MailLease, outcome: DeliveryOutcome, retryAfterSeconds: number): Promise<void>;
  open(requestId: string, ciphertext: string): Promise<{ email: string; code: string }>;
  sender: DeletionEmailSender;
}) {
  return async () => {
    let attempted = 0;
    for (; attempted < 10; attempted++) {
      const lease = await deps.claim();
      if (!lease) break;
      let outcome: DeliveryOutcome = 'UNKNOWN';
      let retryAfterSeconds = 15;
      try {
        const message = await deps.open(lease.requestId, lease.ciphertext);
        await deps.sender.send({ ...message, requestId: lease.requestId });
        outcome = 'SENT';
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          outcome = error.outcome;
          retryAfterSeconds = error.retryAfterSeconds;
        }
      }
      // If no completion commits, the DB lease expires to UNKNOWN. A committed
      // completion remains authoritative even if the RPC response is lost.
      await deps.finish(lease, outcome, retryAfterSeconds);
      // Let the persisted backoff elapse before another worker invocation. In
      // particular, do not immediately drain more messages after a provider 429.
      if (outcome === 'RETRY') return { attempted: attempted + 1 };
    }
    return { attempted };
  };
}
