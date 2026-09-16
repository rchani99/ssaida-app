// Focused contract checks; no DB writes and no full regression suite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', output)(
    (id) => {
      if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
    false,
  );
  return module.exports;
}

let exchanges = 0;
let resolveExchange;
const oauth = load('src/features/auth/services/google-oauth.ts', {
  'expo-web-browser': { maybeCompleteAuthSession() {} },
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      auth: {
        exchangeCodeForSession: () => {
          exchanges++;
          return new Promise((resolve) => {
            resolveExchange = resolve;
          });
        },
      },
    }),
  },
});
const first = oauth.exchangeGoogleCallback('test-code');
const duplicate = oauth.exchangeGoogleCallback('test-code');
assert.equal(first, duplicate);
assert.equal(exchanges, 1);
resolveExchange({ error: null });
await Promise.all([first, duplicate]);
assert.equal(exchanges, 1);

const writes = [];
const filters = [];
const rpcCalls = [];
const query = {
  insert(value) {
    writes.push(value);
    return this;
  },
  update(value) {
    writes.push(value);
    return this;
  },
  select() {
    return this;
  },
  eq(...args) {
    filters.push(args);
    return this;
  },
  neq(...args) {
    filters.push(args);
    return this;
  },
  single: async () => ({ data: { id: 'item' }, error: null }),
  order: async () => ({ data: [], error: null }),
};
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': {},
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      from: () => query,
      rpc: async (name, args) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    }),
  },
});
await api.createStudyItem({
  childId: 'child',
  itemType: 'WORKBOOK',
  name: 'Math',
  subject: null,
  estimatedMinutes: 20,
  studyWeekdays: [1],
  workbookPagesPerSession: 5,
  workbookLastPage: 100,
  workbookNextStartPage: 28,
});
assert.equal(writes.at(-1).workbook_last_completed_page, 27);
await api.createStudyItem({
  childId: 'child',
  itemType: 'ACTIVITY',
  name: 'Read',
  subject: null,
  estimatedMinutes: 20,
  studyWeekdays: [1],
});
assert.equal(writes.at(-1).workbook_last_completed_page, null);
const item = {
  id: 'item',
  status: 'ACTIVE',
  item_type: 'WORKBOOK',
  workbook_last_page: 100,
  updated_at: 'revision',
};
await api.updateStudyItem({
  item,
  values: {
    name: 'Updated',
    subject: null,
    estimatedMinutes: 30,
    studyWeekdays: [2],
    workbookPagesPerSession: 3,
    workbookLastPage: 100,
  },
});
assert.equal(rpcCalls.at(-1).name, 'update_study_item');
assert.ok(!('workbook_last_completed_page' in rpcCalls.at(-1).args.changes));
assert.ok(!('next_start_page' in rpcCalls.at(-1).args.changes));
await api.updateStudyItem({
  item,
  values: {
    name: 'Updated',
    subject: null,
    estimatedMinutes: 20,
    studyWeekdays: [1],
    workbookPagesPerSession: 5,
    workbookLastPage: 100,
    workbookNextStartPage: 28,
  },
});
assert.equal(rpcCalls.at(-1).args.changes.next_start_page, 28);
assert.equal(rpcCalls.at(-1).args.expected_updated_at, 'revision');
await assert.rejects(api.updateStudyItem({ item, values: { workbookLastPage: 90 } }));
await api.changeStudyItemStatus({ item, status: 'PAUSED' });
assert.equal(writes.at(-1).status, 'PAUSED');
await api.changeStudyItemStatus({ item: { ...item, status: 'PAUSED' }, status: 'ACTIVE' });
assert.equal(writes.at(-1).status, 'ACTIVE');
await api.changeStudyItemStatus({ item, status: 'DELETED' });
assert.equal(writes.at(-1).status, 'DELETED');
assert.ok(writes.at(-1).deleted_at);
await api.saveRestWeekdays({ childId: 'child', weekdays: [7, 1, 7] });
assert.deepEqual(writes.at(-1), { rest_weekdays: [1, 7] });
await api.saveRestWeekdays({ childId: 'child', weekdays: [] });
assert.deepEqual(writes.at(-1), { rest_weekdays: [] });
await assert.rejects(api.saveRestWeekdays({ childId: 'child', weekdays: [8] }));
filters.length = 0;
await api.fetchStudyItems('child', true);
assert.ok(!filters.some(([key]) => key === 'status'));
console.log(
  'Sprint 1 focused contracts: PASS (OAuth dedup, next page, edit/status, rest days, deleted history)',
);
