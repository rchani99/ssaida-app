// Runs production provider effects against controlled AppState/timers/query/OS ports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const slots = [];
let cursor = 0;
let dirty = true;
let effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[i],
      (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) dirty = true;
        slots[i] = next;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: initial });
  },
  useCallback(callback, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) slots[i] = { deps, callback };
    return slots[i].callback;
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
const defaults = {
  notificationsEnabled: false,
  parentCheckReminderEnabled: false,
  parentCheckReminderTime: '',
  unfinishedReminderEnabled: false,
  unfinishedReminderTime: '',
};
let auth = {
  isLoading: false,
  session: { user: { id: 'user' } },
  profile: { onboarding_completed: true },
};
let persisted = { settings: { ...defaults }, ledger: {} };
let date = '2026-09-10';
let displayedDate = date;
let appStateListener;
let mutationListener;
let interval;
let timer;
let clears = 0;
let syncs = 0;
let ensures = 0;
let invalidations = 0;
let asks = 0;
let initializations = 0;
let reads = 0;
let fetches = 0;
let failEnsure = false;
let resolveSnapshot;
let delaySnapshot = false;
const port = {
  supported: true,
  initialize: async () => {
    initializations++;
  },
  permission: async (request) => {
    if (request) asks++;
    return 'granted';
  },
  listen: () => () => {},
};
const imports = {
  react,
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  'react-native': {
    AppState: {
      currentState: 'active',
      addEventListener: (_event, callback) => {
        appStateListener = callback;
        return { remove() {} };
      },
    },
  },
  '@/features/auth/hooks/use-auth': { useAuth: () => auth },
  '@/features/learning/api/learning-api': {
    fetchCurrentChild: async () => ({ id: 'child' }),
    ensureDailyPlan: async () => {
      ensures++;
      if (failEnsure) throw Error('offline');
    },
  },
  '@/features/learning/hooks/use-learning': { learningKeys: { all: ['learning'] } },
  '@/features/notifications/api': { fetchNotificationSnapshot: async () => ({ childId: 'child' }) },
  '@/features/notifications/notification-context': {
    NotificationContext: { Provider: 'Provider' },
  },
  '@/features/notifications/notification-port': { notificationPort: port },
  '@/features/notifications/reconcile': {
    clearNotices: async () => {
      clears++;
    },
    clearOtherAccounts: async () => {},
    pruneSettings: async () => {},
    reconcile: async (_port, _snapshot, _settings, _ledger, _save, current) => {
      if (current()) syncs++;
    },
  },
  '@/features/notifications/storage': {
    registerDeletionCleanup: () => {},
    removePreferences: async (id) => {
      assert.equal(id, 'user');
      persisted = null;
    },
    readPreferences: async () => {
      reads++;
      return structuredClone(persisted);
    },
    writePreferences: async (_id, settings, ledger) => {
      persisted = structuredClone({ settings, ledger });
    },
  },
  '@/features/notifications/types': { defaultSettings: defaults },
  '@/lib/query-client': {
    queryClient: {
      fetchQuery: async () => {
        fetches++;
        return delaySnapshot
          ? new Promise((resolve) => {
              resolveSnapshot = resolve;
            })
          : { childId: 'child' };
      },
      invalidateQueries: async () => {
        invalidations++;
      },
      getMutationCache: () => ({
        subscribe: (callback) => {
          mutationListener = callback;
          return () => {};
        },
      }),
    },
  },
  '@/shared/hooks/use-today': {
    refreshToday: () => {
      const changed = date !== displayedDate;
      displayedDate = date;
      return changed;
    },
  },
  '@/shared/utils/date': { toLocalDateString: () => date },
};
const code = ts.transpileModule(
  readFileSync(
    new URL('../src/features/notifications/notification-provider.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
  code,
)(
  (id) => {
    assert.ok(id in imports, id);
    return imports[id];
  },
  module,
  module.exports,
  (callback) => {
    interval = callback;
    return 1;
  },
  () => {},
  (callback) => {
    timer = callback;
    return 1;
  },
  () => {
    timer = undefined;
  },
);
let value;
function render() {
  dirty = false;
  cursor = 0;
  value = module.exports.NotificationProvider({ children: 'APP' }).props.value;
  const jobs = effects;
  effects = [];
  jobs.forEach((job) => job());
}
async function settle() {
  for (let i = 0; i < 30; i++) {
    if (dirty) render();
    await new Promise((resolve) => setImmediate(resolve));
  }
}
await settle();
assert.equal(asks, 0);
assert.equal(value.ready, true);
assert.equal(syncs, 0);
await value.enable();
await settle();
assert.equal(asks, 1);
assert.ok(syncs > 0);
const idleCounts = () => [initializations, reads, fetches, syncs, ensures, invalidations];
const beforeIdle = idleCounts();
for (let i = 0; i < 3; i++) {
  interval();
  await settle();
}
assert.deepEqual(idleCounts(), beforeIdle, 'same-day interval must not perform any full sync work');
const beforeMutation = syncs;
mutationListener({ type: 'updated', action: { type: 'success' } });
timer();
await settle();
assert.equal(syncs, beforeMutation + 1);
const beforeRollover = syncs;
date = '2026-09-11';
interval();
await settle();
assert.equal(ensures, 1);
assert.equal(displayedDate, date);
assert.equal(invalidations, 1);
assert.equal(syncs, beforeRollover + 1, 'date change triggers full sync');
const afterRollover = idleCounts();
interval();
await settle();
assert.deepEqual(idleCounts(), afterRollover);
appStateListener('active');
await settle();
assert.equal(ensures, 1);
assert.equal(invalidations, 2);
date = '2026-09-12';
failEnsure = true;
interval();
await settle();
assert.equal(ensures, 2);
failEnsure = false;
interval();
await settle();
assert.equal(ensures, 2, 'same-date interval cannot retry network work');
appStateListener('active');
await settle();
assert.equal(ensures, 3, 'retry rollover ensure after offline failure');
assert.ok(value.error === null);
const beforeDisable = clears;
await value.save({ ...defaults });
await settle();
assert.ok(clears > beforeDisable);
await value.enable();
await settle();
delaySnapshot = true;
mutationListener({ type: 'updated', action: { type: 'success' } });
timer();
await settle();
assert.equal(typeof resolveSnapshot, 'function');
const beforeLogout = syncs;
auth = { isLoading: false, session: null, profile: null };
dirty = true;
await settle();
resolveSnapshot({ childId: 'child' });
await settle();
assert.equal(syncs, beforeLogout, 'late old-account response cannot schedule');
assert.equal(value.settings.notificationsEnabled, false);
// A confirmed deletion fences in-flight reconciliation and drains it before erasing preferences.
delaySnapshot = false;
auth = {
  isLoading: false,
  session: { user: { id: 'user' } },
  profile: { onboarding_completed: true },
};
dirty = true;
await settle();
delaySnapshot = true;
mutationListener({ type: 'updated', action: { type: 'success' } });
timer();
await settle();
const beforeDeletion = syncs;
const beforeDeletionClear = clears;
const deletionCleanup = value.clearDeletedAccount('user');
await settle();
resolveSnapshot({ childId: 'child' });
await deletionCleanup;
await settle();
assert.equal(syncs, beforeDeletion, 'late response after deletion must not reschedule');
assert.equal(persisted, null, 'account-scoped preferences removed after queued writes');
assert.ok(clears > beforeDeletionClear);
assert.equal(value.ready, false);
slots.forEach((slot) => slot?.cleanup?.());
console.log(
  'PASS lifecycle: date-only interval, midnight sync, resume retry, mutation sync, enable/disable, logout during in-flight query',
);
