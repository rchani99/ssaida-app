const { validateEnvironment } = require('./src/config/environment-policy');

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile && !['development', 'production'].includes(profile)) {
    throw new Error('[environment] Unsupported EAS profile.');
  }
  const release =
    profile === 'production' ||
    (profile !== 'development' && process.env.NODE_ENV === 'production') ||
    process.argv.some((arg) => /^(release|.*Release)$/.test(arg));
  const environment = validateEnvironment(
    {
      environment: process.env.EXPO_PUBLIC_APP_ENV ?? (release ? undefined : 'development'),
      developmentUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      developmentKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      productionUrl: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL,
      productionKey: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
      productionProjectRef: process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF,
      devLogin: process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN,
      redirectUri: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI,
    },
    release,
  );
  if (profile && environment.environment !== profile)
    throw new Error('[environment] EAS profile/environment mismatch.');
  return { ...config, extra: { ...config.extra, appEnvironment: environment.environment } };
};
