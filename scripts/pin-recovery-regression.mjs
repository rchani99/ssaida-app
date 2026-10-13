// Runs the real flow, Edge handler and React components with controlled network/time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const mod = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ...Object.keys(globals),
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      assert.ok(id in imports, `Missing import ${id}`);
      return imports[id];
    },
    mod,
    mod.exports,
    ...Object.values(globals),
  );
  return mod.exports;
}
const events = load('src/features/auth/services/sensitive-action-events.ts');
const { createSensitiveActionFlow } = load('src/features/auth/services/sensitive-action-flow.ts');
const { createSensitiveActionUiFlow } = load(
  'src/features/auth/services/sensitive-action-ui-flow.ts',
);
const { createHandler } = load('supabase/functions/account-actions/core.ts');
const { sensitiveActionsEnabled } = load(
  'src/features/auth/services/sensitive-actions-enabled.ts',
  {
    '@/config/environment': { getAppEnvironment: () => ({ environment: 'production' }) },
  },
  { __DEV__: false },
);
assert.equal(sensitiveActionsEnabled('reset_parent_pin'), true);
assert.equal(sensitiveActionsEnabled('delete_account'), true);

let clock = Date.now();
const hour = 3_600_000;
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
let user = owner;
let record = null;
let begins = 0;
let resets = 0;
let pinEnabled = true;
let holdResume;
const newRecord = () => ({
  id,
  user_id: owner,
  purpose: 'reset_parent_pin',
  status: 'pending',
  created_at: new Date(clock).toISOString(),
  available_at: new Date(clock + 72 * hour).toISOString(),
  expires_at: new Date(clock + 240 * hour).toISOString(),
});
const valid = (actor, purpose) =>
  record?.user_id === actor.id &&
  record.purpose === purpose &&
  record.status === 'pending' &&
  Date.parse(record.expires_at) > clock;
const handler = createHandler({
  enabled: (purpose) => purpose === 'reset_parent_pin' && pinEnabled,
  authenticate: async () => ({ id: user, googleSub: 'test' }),
  request: async (actor, purpose) => {
    begins++;
    if (!valid(actor, purpose)) record = newRecord();
    return record;
  },
  resume: async (actor, purpose) => {
    if (holdResume) await holdResume;
    return valid(actor, purpose) ? record : null;
  },
  cancel: async (actor, target) => {
    if (!valid(actor, 'reset_parent_pin') || target !== id) return false;
    record.status = 'cancelled';
    return true;
  },
  resetPin: async (actor, target, pin) => {
    if (
      !valid(actor, 'reset_parent_pin') ||
      target !== id ||
      Date.parse(record.available_at) > clock
    )
      return false;
    assert.equal(pin, '5678');
    resets++;
    record.status = 'consumed';
    return true;
  },
  now: () => clock,
  prepareDelete: async () => {
    throw new Error('Deletion must remain disabled');
  },
  consumeDelete: async () => {
    throw new Error('Deletion must remain disabled');
  },
  deleteUser: async () => {
    throw new Error('Deletion must remain disabled');
  },
  deletionStatus: async () => 'expired',
});
const call = (body) =>
  handler(
    new Request('https://test.invalid/account-actions', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
const actions = () =>
  createSensitiveActionFlow({
    currentUserId: async () => user,
    now: () => clock,
    invoke: async (body) => {
      const response = await call(body);
      if (body.action !== 'resume') events.notifySensitiveActionsChanged();
      if (!response.ok) throw new Error('Server rejected action');
      return response.json();
    },
    cleanupDeletedAccount: async () => {
      throw new Error('PIN reset must preserve app data');
    },
  });
const pending = () =>
  record?.status === 'pending' && Date.parse(record.expires_at) > clock
    ? { purpose: record.purpose, availableAt: record.available_at, expiresAt: record.expires_at }
    : null;
let state;
const flow = () =>
  createSensitiveActionUiFlow({
    purpose: 'reset_parent_pin',
    enabled: () => true,
    actions,
    now: () => clock,
    changed: (next) => {
      state = next;
    },
  });

for (const body of [
  { action: 'begin', purpose: 'delete_account' },
  { action: 'resume', purpose: 'delete_account' },
  { action: 'prepare_delete', id },
  { action: 'delete', id, operationId: id },
])
  assert.equal((await call(body)).status, 503);
assert.equal(begins, 0);
pinEnabled = false;
assert.equal((await call({ action: 'begin', purpose: 'reset_parent_pin' })).status, 503);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 503);
pinEnabled = true;
assert.equal((await call({ action: 'resume', purpose: 'reset_parent_pin' })).status, 409);
assert.equal(begins, 0, 'resume never creates a request');

let ui = flow();
await Promise.all([ui.start(), ui.start()]);
assert.equal(begins, 1);
assert.equal(state.phase, 'waiting');
await ui.execute('5678', '5678');
assert.equal(resets, 0);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 403);
const original = pending();
ui.dismiss();
ui = flow(); // Screen/app restart only reads the original server window.
ui.resume(original);
assert.equal(begins, 1);
assert.equal(state.availableAt, original.availableAt);
clock += 72 * hour;
ui.resume(pending());
assert.equal(state.phase, 'ready');
for (const values of [
  ['12ab', '12ab'],
  ['5678', '9999'],
]) {
  await ui.execute(...values);
  assert.equal(state.phase, 'ready');
  assert.equal(resets, 0);
}
await Promise.all([ui.execute('5678', '5678'), ui.execute('5678', '5678')]);
assert.equal(state.phase, 'done');
assert.equal(resets, 1);
assert.equal(begins, 1, 'execute reads rather than issues');
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 403);

record = newRecord();
ui = flow();
ui.resume(pending());
let release;
holdResume = new Promise((resolve) => {
  release = resolve;
});
const cancelling = ui.cancel();
assert.equal(state.phase, 'cancelling');
await ui.execute('5678', '5678');
await ui.start();
await ui.cancel();
assert.equal(resets, 1);
release();
await cancelling;
holdResume = undefined;
assert.equal(state.phase, 'intro');
assert.equal(record.status, 'cancelled');
assert.equal(begins, 1, 'cancel after restart never creates a request');

record = newRecord();
clock += 72 * hour;
ui = flow();
ui.resume(pending());
record.status = 'cancelled'; // Current PIN used on another screen/device.
await ui.execute('5678', '5678');
assert.equal(state.phase, 'error');
assert.equal(resets, 1);
assert.equal(begins, 1, 'a cancelled request cannot silently restart');
ui.resume(null);
assert.equal(state.phase, 'intro');
record = newRecord();
ui.resume(pending());
const expired = pending();
clock += 241 * hour;
ui.resume(expired);
assert.equal(state.phase, 'intro');
assert.match(state.message, /만료/);

record = newRecord();
clock += 72 * hour;
const accountBound = actions();
await accountBound.resume('reset_parent_pin');
user = '33333333-3333-4333-8333-333333333333';
await assert.rejects(accountBound.resume('reset_parent_pin'), /ACCOUNT_CHANGED/);
assert.equal((await call({ action: 'resume', purpose: 'reset_parent_pin' })).status, 409);
user = owner;
ui = flow();
ui.resume(pending());
holdResume = new Promise((resolve) => {
  release = resolve;
});
const abandoned = ui.execute('5678', '5678');
ui.dismiss();
release();
await abandoned;
holdResume = undefined;
assert.equal(resets, 1, 'leaving during resolution prevents an unsubmitted reset');

// Real component lifecycle: mount, timer, foreground, network error, busy and close behavior.
const jsx = (type, props) => ({ type, props });
const nodes = (v) =>
  !v || typeof v !== 'object'
    ? []
    : Array.isArray(v)
      ? v.flatMap(nodes)
      : [v, ...nodes(v.props?.children)];
function harness(path, name, imports) {
  const slots = [];
  let cursor = 0,
    dirty = true,
    tree;
  const effects = [];
  const timers = new Set();
  const foreground = new Set();
  const memo = (factory, deps) => {
    const i = cursor++;
    if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i].deps[j])))
      slots[i] = { deps, value: factory() };
    return slots[i].value;
  };
  const component = load(
    path,
    {
      ...imports,
      react: {
        useState: (initial) => {
          const i = cursor++;
          if (!(i in slots)) slots[i] = initial;
          return [
            slots[i],
            (v) => {
              const next = typeof v === 'function' ? v(slots[i]) : v;
              if (!Object.is(slots[i], next)) {
                slots[i] = next;
                dirty = true;
              }
            },
          ];
        },
        useRef: (value) => {
          const i = cursor++;
          return slots[i] ?? (slots[i] = { current: value });
        },
        useMemo: memo,
        useCallback: (fn, deps) => memo(() => fn, deps),
        useEffect: (fn, deps) => {
          const i = cursor++;
          if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i].deps[j]))) {
            const previous = slots[i];
            slots[i] = { deps };
            effects.push(() => {
              previous?.cleanup?.();
              slots[i].cleanup = fn();
            });
          }
        },
      },
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'react-native': {
        View: 'View',
        Text: 'Text',
        ScrollView: 'ScrollView',
        StyleSheet: { create: (v) => v },
        AppState: {
          currentState: 'active',
          addEventListener: (_event, fn) => {
            foreground.add(fn);
            return { remove: () => foreground.delete(fn) };
          },
        },
      },
    },
    {
      setInterval: (fn) => {
        timers.add(fn);
        return fn;
      },
      clearInterval: (fn) => timers.delete(fn),
    },
  )[name];
  let props;
  const render = () => {
    dirty = false;
    cursor = 0;
    tree = component(props);
    for (const effect of effects.splice(0)) effect();
  };
  return {
    async flush(nextProps = props) {
      props = nextProps;
      for (let i = 0; i < 25; i++) {
        if (dirty) render();
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(dirty, false);
      return tree;
    },
    get tree() {
      return tree;
    },
    tick: () => {
      for (const fn of timers) fn();
    },
    foreground: (state = 'active') => {
      for (const fn of foreground) fn(state);
    },
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
      assert.equal(timers.size, 0);
    },
  };
}
let readFails = false;
const pendingImports = {
  fetchPendingSensitiveActions: async () => {
    if (readFails) throw new Error('offline');
    return pending() ? [pending()] : [];
  },
  describeRemaining: (at) => (Date.parse(at) > clock ? '3일' : null),
};
const panel = harness(
  'src/features/auth/components/sensitive-account-panel.tsx',
  'SensitiveAccountPanel',
  {
    '@/features/auth/services/account-actions': { createAccountActions: actions },
    '@/features/auth/services/pending-sensitive-actions': pendingImports,
    '@/features/auth/services/sensitive-action-events': events,
    '@/features/auth/services/sensitive-actions-enabled': { sensitiveActionsEnabled },
    '@/features/auth/services/sensitive-action-ui-flow': {
      createSensitiveActionUiFlow: (deps) =>
        createSensitiveActionUiFlow({ ...deps, now: () => clock }),
    },
    '@/features/learning/components/learning-controls': {
      LearningButton: 'Button',
      LearningField: 'Field',
      learningStyles: {},
    },
    '@/features/notifications/notification-context': {
      useNotifications: () => ({ clearDeletedAccount: cleanup }),
    },
  },
);
const cleanup = () => {
  throw new Error('Must preserve learning data');
};
const banner = harness(
  'src/features/auth/components/pending-account-action-banner.tsx',
  'PendingAccountActionBanner',
  {
    '@/features/auth/services/deletion-watch': { ensureDeletionWatch: async () => {} },
    '@/features/auth/services/pending-sensitive-actions': pendingImports,
    '@/features/auth/services/sensitive-action-events': events,
    '@/design-system/tokens': { colors: {}, radius: {}, spacing: {} },
  },
);
const button = (label) =>
  nodes(panel.tree).find((n) => n.type === 'Button' && n.props.label === label)?.props;
record = null;
let busy = false,
  closed = false;
readFails = true;
await panel.flush({
  kind: 'recovery',
  completionLabel: 'PIN 입력으로 돌아가기',
  onBusyChange: (v) => {
    busy = v;
  },
  onClose: () => {
    closed = true;
  },
});
assert.equal(button('PIN 재설정 요청').disabled, true);
assert.ok(button('대기 상태 다시 확인'));
readFails = false;
button('대기 상태 다시 확인').onPress();
await panel.flush();
await banner.flush({});
assert.equal(banner.tree, null);
button('PIN 재설정 요청').onPress();
await panel.flush();
await banner.flush();
assert.ok(banner.tree, 'request becomes visible without foregrounding the app');
assert.ok(button('재설정 요청 취소'));
clock += 72 * hour;
panel.tick();
await panel.flush();
const fields = nodes(panel.tree).filter((n) => n.type === 'Field');
assert.equal(fields.length, 2, 'wait ending on an open screen reveals PIN entry');
fields[0].props.onChangeText('5678');
fields[1].props.onChangeText('5678');
await panel.flush();
panel.foreground('background');
await panel.flush();
assert.ok(
  nodes(panel.tree)
    .filter((n) => n.type === 'Field')
    .every((n) => n.props.value === ''),
);
panel.foreground();
await panel.flush();
for (const field of nodes(panel.tree).filter((n) => n.type === 'Field'))
  field.props.onChangeText('5678');
await panel.flush();
holdResume = new Promise((resolve) => {
  release = resolve;
});
button('PIN 재설정').onPress();
await panel.flush();
assert.equal(busy, true);
assert.equal(button('닫기'), undefined);
assert.equal(nodes(panel.tree).filter((n) => n.type === 'Field').length, 0);
release();
await panel.flush();
await banner.flush();
holdResume = undefined;
assert.equal(busy, false);
assert.equal(banner.tree, null, 'completed request clears the banner immediately');
button('PIN 입력으로 돌아가기').onPress();
assert.equal(closed, true);
record = newRecord();
banner.foreground();
await banner.flush();
assert.ok(banner.tree);
let verdict = false;
const { verifyParentPin } = load('src/features/auth/services/verify-parent-pin.ts', {
  './sensitive-action-events': events,
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      rpc: async () => {
        if (verdict) record.status = 'cancelled';
        return { data: verdict, error: null };
      },
    }),
  },
});
await verifyParentPin('0000');
await banner.flush();
assert.ok(banner.tree, 'wrong PIN keeps the reset notice');
verdict = true;
await verifyParentPin('1234');
await banner.flush();
assert.equal(banner.tree, null, 'successful PIN verification refreshes the reset notice');
panel.unmount();
banner.unmount();

let deletePending = null,
  deleteBegins = 0,
  deletes = 0;
const deletionPanel = harness(
  'src/features/auth/components/sensitive-account-panel.tsx',
  'SensitiveAccountPanel',
  {
    '@/features/auth/services/account-actions': {
      createAccountActions: () => ({
        begin: async () => {
          deleteBegins++;
          deletePending = {
            purpose: 'delete_account',
            availableAt: new Date(clock + 14 * 24 * hour).toISOString(),
            expiresAt: new Date(clock + 21 * 24 * hour).toISOString(),
          };
          return deletePending;
        },
        resume: async () => deletePending,
        execute: async () => {
          deletes++;
        },
        cancel: async () => {
          deletePending = null;
        },
      }),
    },
    '@/features/auth/services/pending-sensitive-actions': {
      fetchPendingSensitiveActions: async () => (deletePending ? [deletePending] : []),
      describeRemaining: () => '14일',
    },
    '@/features/auth/services/sensitive-action-events': events,
    '@/features/auth/services/sensitive-actions-enabled': { sensitiveActionsEnabled },
    '@/features/auth/services/sensitive-action-ui-flow': {
      createSensitiveActionUiFlow: (deps) =>
        createSensitiveActionUiFlow({ ...deps, now: () => clock }),
    },
    '@/features/learning/components/learning-controls': {
      LearningButton: 'Button',
      LearningField: 'Field',
      learningStyles: {},
    },
    '@/features/notifications/notification-context': {
      useNotifications: () => ({ clearDeletedAccount: cleanup }),
    },
  },
);
const deleteButton = (label) =>
  nodes(deletionPanel.tree).find((n) => n.type === 'Button' && n.props.label === label)?.props;
await deletionPanel.flush({ kind: 'deletion' });
assert.equal(deleteButton('계정 삭제 요청').disabled, true);
deleteButton('계정 삭제 요청').onPress();
assert.equal(deleteBegins, 0);
deleteButton('자동 삭제와 복구 불가를 확인했어요').onPress();
await deletionPanel.flush();
assert.equal(deleteButton('계정 삭제 요청').disabled, false);
deleteButton('계정 삭제 요청').onPress();
await deletionPanel.flush();
assert.equal(deleteBegins, 1);
assert.ok(deleteButton('삭제 요청 취소'));
assert.equal(deleteButton('계정 영구 삭제'), undefined);
deletePending = { ...deletePending, processing: true };
deletionPanel.tick();
await deletionPanel.flush();
assert.equal(
  deleteButton('삭제 요청 취소'),
  undefined,
  'claimed deletion cannot be cancelled in UI',
);
assert.equal(deletes, 0);
deletionPanel.unmount();
console.log(
  'PASS deletion UI: disclosure acknowledgement, explicit request, waiting cancellation and processing fence',
);
console.log(
  'PASS PIN recovery: production gate, PIN-only server rollout, wait/restart/expiry/cancellation/replay/account isolation, real panel timer/error/busy/return and immediate banner refresh',
);
