import { validateEnvironment } from './environment-policy';

export function getAppEnvironment() {
  // Literal property accesses are required for Expo's build-time env substitution.
  return validateEnvironment(
    {
      environment: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : undefined),
      developmentUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      developmentKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      productionUrl: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL,
      productionKey: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
      productionProjectRef: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF,
      devLogin: process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN,
      redirectUri: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI,
    },
    !__DEV__,
  );
}
