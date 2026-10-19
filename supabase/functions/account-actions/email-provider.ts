import { isLocalMockEnabled, MockDeletionEmailSender } from './email-mailer.ts';
import { ResendDeletionEmailSender, validResendSettings } from './email-resend.ts';

import type { DeletionEmailSender } from './email-mailer.ts';

export function createDeletionEmailSender(config: {
  mode?: string;
  supabaseUrl: string;
  resendApiKey?: string;
  from?: string;
}): DeletionEmailSender | undefined {
  if (isLocalMockEnabled(config.mode, config.supabaseUrl)) return new MockDeletionEmailSender();
  if (
    config.mode === 'resend' &&
    config.resendApiKey &&
    config.from &&
    validResendSettings(config.resendApiKey, config.from)
  )
    return new ResendDeletionEmailSender(config.resendApiKey, config.from);
  return undefined;
}
