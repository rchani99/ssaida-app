import { getAppEnvironment } from '@/config/environment';

// UI gate only; the Edge Function independently authenticates and verifies every action.
export function sensitiveActionsEnabled(): boolean {
  if (!__DEV__ || process.env.EXPO_PUBLIC_ENABLE_SENSITIVE_ACCOUNT_ACTIONS !== 'true') return false;
  try {
    return getAppEnvironment().environment === 'development';
  } catch {
    return false;
  }
}
