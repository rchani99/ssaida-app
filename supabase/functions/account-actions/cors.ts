// Browser origins are deployment configuration, never reflected without an exact match.
export function withCors(handler: (request: Request) => Promise<Response>, configured = '') {
  const allowed = new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (!origin) return handler(request);
    const reject = () =>
      Response.json(
        { code: 'ORIGIN_NOT_ALLOWED' },
        { status: 403, headers: { 'Cache-Control': 'no-store', Vary: 'Origin' } },
      );
    if (!allowed.has(origin) || origin === 'null') return reject();
    const headers = new Headers({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    });
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== 'POST') return reject();
      const requested =
        request.headers
          .get('access-control-request-headers')
          ?.toLowerCase()
          .split(',')
          .map((value) => value.trim()) ?? [];
      if (
        requested.some(
          (value) => !['authorization', 'apikey', 'content-type', 'x-client-info'].includes(value),
        )
      )
        return reject();
      return new Response(null, { status: 204, headers });
    }
    const response = await handler(request);
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  };
}
