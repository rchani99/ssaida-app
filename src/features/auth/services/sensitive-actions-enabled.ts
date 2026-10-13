import type { SensitivePurpose } from './sensitive-action-flow';

// UI gate only; the Edge Function independently authenticates and verifies every action.
export function sensitiveActionsEnabled(purpose: SensitivePurpose = 'delete_account'): boolean {
  return purpose === 'reset_parent_pin' || purpose === 'delete_account';
}
