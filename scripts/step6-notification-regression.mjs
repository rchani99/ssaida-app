// Production planner/reconciler/native adapter with fake OS clock/storage.
// This is not a claim of real Android/iOS delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { create } from 'zustand';

function load(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in imports) return imports[id];
      throw new Error(`Unexpected import ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const types = load('src/features/notifications/types.ts');
const planner = load('src/features/notifications/planner.ts', {
  '@/features/notifications/types': types,
});
const { reconcile, clearNotices, clearOtherAccounts, pruneSettings } = load(
  'src/features/notifications/reconcile.ts',
  { '@/features/notifications/types': types, '@/features/notifications/planner': planner },
);
const now = new Date(2026, 8, 10, 12).getTime();
const task = (id, status = 'CHILD_COMPLETED', age = 0) => ({
  id,
  status,
  parent_verified_at: null,
  child_completed_at: new Date(now - age * 86400000).toISOString(),
  daily_plans: { day_type: 'STUDY' },
});
let snapshot = {
  userId: 'parent',
  childId: 'child',
  date: '2026-09-10',
  plan: { day_type: 'STUDY' },
  tasks: [task('a'), task('b', 'PLANNED')],
  pending: [],
};
let settings = { ...types.defaultSettings, notificationsEnabled: true };
const completes = (tasks) =>
  planner.planNotices({ ...snapshot, tasks }, settings, {}, now).immediate.length;
for (const status of ['SKIPPED', 'PARENT_CONFIRMED', 'PARTIAL']) {
  assert.equal(completes([task('waiting'), task('finished', status)]), 1, status);
  assert.equal(completes([task('finished', status)]), 0, 'must have unverified completion');
}
for (const status of ['PLANNED', 'IN_PROGRESS', 'RETRY'])
  assert.equal(completes([task('waiting'), task('left', status)]), 0, status);
assert.equal(completes([]), 0);
assert.equal(
  completes([{ ...task('verified'), parent_verified_at: new Date(now).toISOString() }]),
  0,
);
let ledger = {};
let durableLedger = {};
const scheduled = new Map();
const presented = new Map();
const deliveries = [];
let failure = false;
const port = {
  scheduled: async () => [...scheduled.values()],
  presented: async () => [...presented.values()],
  cancel: async (id) => {
    scheduled.delete(id);
  },
  dismiss: async (id) => {
    presented.delete(id);
  },
  schedule: async (notice) => {
    if (failure) throw new Error('OS failure');
    deliveries.push(notice);
    (notice.trigger ? scheduled : presented).set(notice.id, {
      id: notice.id,
      signature: types.signature(notice),
    });
  },
};
const sync = (current = () => true, time = now) =>
  reconcile(
    port,
    snapshot,
    settings,
    ledger,
    async () => {
      durableLedger = { ...ledger };
    },
    current,
    time,
  );
await sync();
assert.equal(deliveries.length, 0);
snapshot.tasks[1] = task('b');
await sync();
await sync();
assert.equal(deliveries.length, 1);
ledger = JSON.parse(JSON.stringify(durableLedger));
await sync();
assert.equal(deliveries.length, 1, 'restart receipt');
snapshot.tasks = [];
await sync();
assert.equal(presented.size, 0, 'no empty-day completion');
console.log(
  'PASS A: no unfinished tasks + unverified completion, finalized mix, empty/verified exclusions, restart receipt',
);

settings = { ...settings, unfinishedReminderEnabled: true, unfinishedReminderTime: '19:30' };
snapshot.plan.day_type = 'REST';
snapshot.tasks = [task('c', 'PLANNED')];
await sync();
assert.equal(scheduled.size, 0);
snapshot.tasks = [task('c')];
await sync();
assert.equal(deliveries.length, 1);
snapshot.plan.day_type = 'STUDY';
snapshot.tasks = [];
snapshot.pending = [
  task('old1', 'CHILD_COMPLETED', 3),
  task('old2', 'CHILD_COMPLETED', 4),
  { ...task('rest', 'CHILD_COMPLETED', 4), daily_plans: { day_type: 'REST' } },
  task('young', 'CHILD_COMPLETED', 2.99),
];
await sync();
await sync();
assert.equal(deliveries.length, 2);
snapshot.pending = snapshot.pending.slice(1);
await sync();
assert.equal(deliveries.length, 2, 'oldest confirmed must not repeat old2');
snapshot.pending = [
  'PLANNED',
  'IN_PROGRESS',
  'RETRY',
  'PARENT_CONFIRMED',
  'PARTIAL',
  'SKIPPED',
].map((state, index) => task(`excluded${index}`, state, 5));
snapshot.pending.push({
  ...task('verified', 'CHILD_COMPLETED', 5),
  parent_verified_at: new Date(now).toISOString(),
});
snapshot.pending.push({ ...task('missing', 'CHILD_COMPLETED', 5), child_completed_at: null });
await sync();
assert.equal(deliveries.length, 2);
assert.equal(presented.size, 0);
console.log(
  'PASS B-D: REST excluded, exact 72h, once per completion, subset/RETRY/confirmed/null exclusions and dismissal',
);

settings = { ...settings, parentCheckReminderEnabled: true, parentCheckReminderTime: '20:30' };
await sync();
assert.equal(scheduled.size, 1);
assert.deepEqual(deliveries.at(-1).trigger, { hour: 20, minute: 30 });
const count = deliveries.length;
await sync();
assert.equal(deliveries.length, count);
scheduled.clear();
await sync();
assert.equal(scheduled.size, 1, 'lost OS schedule restored');
settings.parentCheckReminderTime = '21:15';
await sync();
assert.equal(scheduled.size, 1);
settings.parentCheckReminderEnabled = false;
await sync();
assert.equal(scheduled.size, 0);
snapshot.tasks = [task('left', 'IN_PROGRESS')];
await sync();
assert.equal(scheduled.size, 1);
snapshot.tasks = [task('done')];
await sync();
assert.equal(scheduled.size, 0);
snapshot.tasks = [task('left', 'PLANNED')];
await sync();
snapshot.date = '2026-09-11';
await sync(() => true, new Date(2026, 8, 11, 12).getTime());
assert.deepEqual([...scheduled.keys()], ['ssaida:unfinished:child:2026-09-11']);
await sync(() => true, new Date(2026, 8, 11, 20).getTime());
assert.equal(scheduled.size, 1, 'allow OS-delayed delivery while still unfinished');
scheduled.clear(); // OS delivered the one-shot; do not recreate it later that date.
await sync(() => true, new Date(2026, 8, 11, 20).getTime());
assert.equal(scheduled.size, 0);
console.log(
  'PASS E-G: daily time/change/disable, unfinished cancel, missing-schedule restore, rollover, no late replay',
);

assert.equal(
  planner.tapDestination(
    { userId: 'parent', childId: 'child', destination: 'parent' },
    'parent',
    'child',
    'child',
  ),
  'pin',
);
assert.equal(
  planner.tapDestination(
    { userId: 'parent', childId: 'child', destination: 'parent' },
    'parent',
    'child',
    'parent',
  ),
  'parent',
);
assert.equal(
  planner.tapDestination(
    { userId: 'other', childId: 'child', destination: 'parent' },
    'parent',
    'child',
    'parent',
  ),
  null,
);
assert.equal(
  planner.tapDestination(
    { userId: 'parent', childId: 'child', destination: 'https://bad' },
    'parent',
    'child',
    'parent',
  ),
  null,
);
console.log(
  'PASS H: parent tap requires PIN in child mode; wrong account/arbitrary route rejected',
);

snapshot.date = '2026-09-12';
snapshot.tasks = [task('newdone')];
const before = deliveries.length;
await sync(() => false);
assert.equal(deliveries.length, before);
failure = true;
await assert.rejects(sync());
failure = false;
assert.ok(!ledger['ssaida:daily-complete:child:2026-09-12']);
await sync();
assert.equal(deliveries.length, before + 1);
await clearOtherAccounts(port, 'different');
assert.equal(presented.size, 0);
await clearNotices(port);
assert.equal(scheduled.size, 0);
assert.equal(types.parseTime('24:00'), null);
assert.equal(types.parseTime('9:30'), null);
assert.equal(types.defaultSettings.parentCheckReminderTime, '');
assert.equal(types.defaultSettings.notificationsEnabled, false);

const memory = new Map();
await port.schedule({
  id: 'ssaida:parent-check:child',
  target: { userId: 'parent' },
  trigger: { hour: 20, minute: 30 },
});
await pruneSettings(port, { ...settings, parentCheckReminderEnabled: false }, new Date(now));
assert.equal(scheduled.size, 0, 'disable cancellation does not need a DB snapshot');
const futureAt = new Date(2026, 8, 10, 19, 30).getTime();
await port.schedule({
  id: 'ssaida:unfinished:child:2026-09-10',
  target: { userId: 'parent' },
  trigger: { at: futureAt },
});
await pruneSettings(port, settings, new Date(2026, 8, 10, 20));
assert.equal(scheduled.size, 1, 'keep a delayed but still-valid same-day OS request');
await pruneSettings(port, settings, new Date(2026, 8, 11, 0));
assert.equal(scheduled.size, 0, 'old-date schedule removed even if DB unavailable');
const storage = load('src/features/notifications/storage.ts', {
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (key) => memory.get(key),
      setItem: async (key, value) => {
        memory.set(key, value);
      },
    },
  },
  '@/features/notifications/types': types,
});
await storage.writePreferences('parent', settings, durableLedger);
assert.deepEqual((await storage.readPreferences('parent')).ledger, durableLedger);
assert.deepEqual((await storage.readPreferences('other')).settings, types.defaultSettings);
for (const malformed of ['{', 'null', '[]', '42', '"text"', '{"settings":null}', '{"ledger":[]}']) {
  memory.set('ssaida.notifications.v1:corrupt', malformed);
  assert.deepEqual(await storage.readPreferences('corrupt'), {
    settings: types.defaultSettings,
    ledger: {},
  });
}
await storage.writePreferences('corrupt', settings, durableLedger);
assert.deepEqual((await storage.readPreferences('corrupt')).settings, settings);
console.log(
  'PASS persistence: account isolation, failure retry, stale session cancellation, no forced default time',
);

const dates = load('src/shared/utils/date.ts');
const today = load('src/shared/hooks/use-today.ts', {
  zustand: { create },
  '@/shared/utils/date': dates,
});
today.refreshToday(new Date(2026, 8, 10, 23, 59));
assert.equal(today.refreshToday(new Date(2026, 8, 11, 0, 0)), true);
assert.equal(today.refreshToday(new Date(2026, 8, 11, 12, 0)), false);
console.log('PASS local date: midnight and resumed same-date do not create repeated rollover');

let osPermission = { status: 'undetermined', granted: false, canAskAgain: true };
let requests = 0;
let channel;
let responseListener;
let cleared = 0;
const os = {
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async (id) => {
    channel = id;
  },
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4, NOT_DETERMINED: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  getPermissionsAsync: async () => osPermission,
  requestPermissionsAsync: async () => {
    requests++;
    return { ...osPermission, status: 'granted', granted: true };
  },
  DEFAULT_ACTION_IDENTIFIER: 'tap',
  getLastNotificationResponseAsync: async () => null,
  addNotificationResponseReceivedListener: (callback) => {
    responseListener = callback;
    return { remove() {} };
  },
  clearLastNotificationResponseAsync: async () => {
    cleared++;
  },
};
const platform = { OS: 'android' };
const native = load('src/features/notifications/notification-port.native.ts', {
  'expo-notifications': os,
  'react-native': { Platform: platform },
  '@/features/notifications/types': types,
}).notificationPort;
await native.initialize();
assert.equal(channel, 'ssaida-reminders');
assert.equal(await native.permission(), 'undetermined');
assert.equal(requests, 0);
assert.equal(await native.permission(true), 'granted');
assert.equal(requests, 1);
osPermission = { status: 'denied', granted: false, canAskAgain: true };
assert.equal(await native.permission(true), 'denied');
assert.equal(requests, 1, 'do not reprompt denial');
platform.OS = 'ios';
osPermission = { ...osPermission, ios: { status: 3 } };
assert.equal(await native.permission(), 'granted');
let taps = 0;
const stop = native.listen(() => {
  taps++;
});
const response = {
  actionIdentifier: 'tap',
  notification: {
    date: now,
    request: {
      identifier: 'ssaida:parent-check:child',
      content: { data: { userId: 'parent', childId: 'child', destination: 'parent' } },
    },
  },
};
responseListener(response);
responseListener(response);
assert.equal(taps, 1);
assert.equal(cleared, 1);
stop();
responseListener({ ...response, notification: { ...response.notification, date: now + 1 } });
assert.equal(taps, 1);
console.log(
  'PASS adapter: Android channel, no startup/repeated-denied prompt, iOS provisional, response dedup/listener cleanup',
);
