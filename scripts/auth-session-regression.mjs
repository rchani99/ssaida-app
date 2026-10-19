import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const source = ts.transpileModule(
  readFileSync(
    new URL('../src/features/auth/providers/auth-provider.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function harness() {
  const slots = [];
  const effects = [];
  const timers = [];
  const profiles = [];
  const initial = deferred();
  let cursor = 0;
  let listener;
  let value;
  let clears = 0;
  let mode = 'parent';
  let signOutError = null;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initialValue) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useRef(initialValue) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initialValue });
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(callback, deps) {
      return react.useMemo(() => callback, deps);
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[i].cleanup = callback();
        });
      }
    },
  };
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {
                listener = undefined;
              },
            },
          },
        };
      },
      getSession: () => initial.promise,
      async signOut() {
        if (!signOutError) listener('SIGNED_OUT', null);
        return { error: signOutError };
      },
    },
    from() {
      const result = deferred();
      const query = {
        select() {
          return this;
        },
        eq(_field, userId) {
          result.userId = userId;
          return this;
        },
        maybeSingle() {
          profiles.push(result);
          return result.promise;
        },
      };
      return query;
    },
  };
  const imports = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/features/auth/hooks/use-auth': { AuthContext: { Provider: 'Provider' } },
    '@/lib/query-client': {
      queryClient: {
        clear() {
          clears++;
        },
      },
    },
    '@/lib/supabase/client': { getSupabaseClient: () => client },
    '@/store/app-mode.store': {
      useAppModeStore: {
        getState: () => ({
          setMode(next) {
            mode = next;
          },
        }),
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', source)(
    (id) => {
      assert.ok(id in imports, id);
      return imports[id];
    },
    module,
    module.exports,
    (callback) => {
      timers.push(callback);
    },
  );
  const render = () => {
    cursor = 0;
    value = module.exports.AuthProvider({ children: 'APP' }).props.value;
    effects.splice(0).forEach((run) => run());
    return value;
  };
  render();
  return {
    initial,
    profiles,
    get value() {
      return render();
    },
    get clears() {
      return clears;
    },
    get mode() {
      return mode;
    },
    set signOutError(error) {
      signOutError = error;
    },
    emit: (event, session) => listener(event, session),
    flushTimers: () => timers.splice(0).forEach((run) => run()),
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}
const session = (id) => ({ user: { id } });
const profile = (id) => ({ auth_user_id: id, onboarding_completed: true });
const settle = () => new Promise((resolve) => setImmediate(resolve));
const signedOut = (h) => {
  assert.equal(h.value.isAuthenticated, false, 'late initial session must not undo logout');
  assert.equal(h.value.profile, null, 'old profile must not reappear after logout');
  assert.equal(h.value.isLoading, false);
  assert.equal(h.value.errorMessage, null);
};

// Reproduce the race: initial snapshot arrives after a successful logout.
{
  const h = harness();
  h.emit('SIGNED_IN', session('parent-a'));
  h.flushTimers();
  h.profiles[0].resolve({ data: profile('parent-a'), error: null });
  await settle();
  assert.equal(h.value.isAuthenticated, true);
  await h.value.signOut();
  h.flushTimers();
  signedOut(h);
  h.initial.resolve({ data: { session: session('parent-a') }, error: null });
  await settle();
  signedOut(h);
  h.emit('INITIAL_SESSION', session('parent-a'));
  h.flushTimers();
  signedOut(h);
  assert.equal(h.mode, 'child');
  assert.ok(h.clears >= 2);
  h.unmount();
}

// A delayed profile response or scheduled load cannot contaminate the next session.
for (const lateError of [null, new Error('old request failed')]) {
  const h = harness();
  h.emit('INITIAL_SESSION', session('parent-a'));
  h.flushTimers();
  await h.value.signOut();
  signedOut(h);
  h.profiles[0].resolve({ data: profile('parent-a'), error: lateError });
  await settle();
  h.flushTimers();
  signedOut(h);
  h.emit('SIGNED_IN', session('parent-b'));
  h.flushTimers();
  h.profiles.at(-1).resolve({ data: profile('parent-b'), error: null });
  await settle();
  assert.equal(h.value.profile.auth_user_id, 'parent-b');
  assert.equal(h.value.isAuthenticated, true, 'intentional subsequent login still works');
  h.unmount();
}
{
  const h = harness();
  h.emit('INITIAL_SESSION', session('parent-a'));
  await h.value.signOut();
  h.flushTimers();
  assert.equal(h.profiles.length, 0, 'cancel profile work queued before logout');
  signedOut(h);
  h.unmount();
}

// Normal launch, token refresh, profile refresh and failed logout remain usable.
{
  const h = harness();
  h.emit('INITIAL_SESSION', session('parent-a'));
  h.flushTimers();
  const oldRequest = h.profiles.at(-1);
  const oldRefresh = h.value.refreshProfile;
  await h.value.signOut();
  h.emit('SIGNED_IN', session('parent-b'));
  h.flushTimers();
  h.profiles.at(-1).resolve({ data: profile('parent-b'), error: null });
  await settle();
  oldRequest.resolve({ data: profile('parent-a'), error: null });
  await settle();
  assert.equal(h.value.profile.auth_user_id, 'parent-b');
  const requests = h.profiles.length;
  await oldRefresh();
  assert.equal(
    h.profiles.length,
    requests,
    'old account refresh cannot start after account switch',
  );
  h.unmount();
}
{
  const h = harness();
  assert.equal(h.value.isLoading, true);
  h.emit('INITIAL_SESSION', session('parent-a'));
  h.flushTimers();
  h.profiles.at(-1).resolve({ data: profile('parent-a'), error: null });
  await settle();
  assert.equal(h.value.isAuthenticated, true);
  assert.equal(h.value.isLoading, false);
  h.emit('TOKEN_REFRESHED', session('parent-a'));
  h.flushTimers();
  h.profiles.at(-1).resolve({ data: profile('parent-a'), error: null });
  await settle();
  const refresh = h.value.refreshProfile();
  h.profiles.at(-1).resolve({ data: profile('parent-a'), error: null });
  await refresh;
  h.signOutError = new Error('offline');
  await assert.rejects(h.value.signOut(), /offline/);
  assert.equal(h.value.isAuthenticated, true);
  h.unmount();
}
{
  const h = harness();
  h.emit('INITIAL_SESSION', null);
  signedOut(h);
  h.unmount();
}
console.log(
  'PASS auth session: logout wins over stale initialization/profile work; normal restore, refresh and re-login work',
);
