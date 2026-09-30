// Public deployment policy, not credentials. Update when DEV projects change.
const developmentProjectRefs = Object.freeze(['ffnxodulitwzuqswlaga']);
const authRedirectUri = 'ssaida://auth/callback';

function isDevelopmentEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return false;
    return (
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)) ||
      (url.protocol === 'https:' &&
        !url.port &&
        developmentProjectRefs.some((ref) => url.hostname === `${ref}.supabase.co`))
    );
  } catch {
    return false;
  }
}

function validateEnvironment(input, release = false) {
  const fail = (reason) => {
    throw new Error(`[environment] ${reason}`);
  };
  const environment = input.environment;
  if (!['development', 'production'].includes(environment))
    fail('Choose development or production.');
  if (release && environment !== 'production') fail('Release requires production environment.');
  const production = environment === 'production';
  if (input.devLogin !== undefined && !['true', 'false', ''].includes(input.devLogin))
    fail('Invalid DEV login flag.');
  if (production && input.devLogin !== 'false')
    fail('Production requires DEV login explicitly false.');
  const urlValue = production ? input.productionUrl : input.developmentUrl;
  const key = production ? input.productionKey : input.developmentKey;
  if (!urlValue || !key)
    fail('Missing selected environment Supabase URL or public key; fallback is disabled.');
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    fail('Invalid Supabase URL.');
  }
  if (production) {
    const ref = input.productionProjectRef;
    if (!ref || !/^[a-z]{20}$/.test(ref))
      fail('Production project reference is required (20 lowercase letters).');
    if (
      developmentProjectRefs.includes(ref) ||
      developmentProjectRefs.some((dev) => url.hostname === `${dev}.supabase.co`)
    )
      fail('DEV Supabase project is forbidden in production.');
    if (
      url.origin !== `https://${ref}.supabase.co` ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      fail('Production URL must match the production project reference over HTTPS.');
  } else if (!isDevelopmentEndpoint(urlValue)) {
    fail('Development requires a local or approved DEV Supabase project.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    let payload;
    try {
      payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      fail('Use a publishable key or legacy anon key, never a secret key.');
    }
    if (key.split('.').length !== 3 || payload.role !== 'anon')
      fail('Only legacy anon JWT keys are allowed.');
    if (production && payload.ref !== input.productionProjectRef)
      fail('Anon key belongs to a different project.');
  }
  if (input.redirectUri !== authRedirectUri)
    fail('OAuth redirect must match ssaida://auth/callback.');
  return {
    environment,
    url: url.origin,
    publishableKey: key,
    redirectUri: authRedirectUri,
    devLogin: !production && input.devLogin === 'true',
  };
}

module.exports = {
  developmentProjectRefs,
  authRedirectUri,
  isDevelopmentEndpoint,
  validateEnvironment,
};
