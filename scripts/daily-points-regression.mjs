import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, mocks) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
let rows = [
  { awarded_growth_points: 0.1 },
  { awarded_growth_points: 0.2 },
  { awarded_growth_points: 0 },
  { awarded_growth_points: null },
];
let failure = null;
const calls = [];
const query = {};
for (const name of ['select', 'eq', 'in', 'gte', 'lt', 'order']) {
  query[name] = (...args) => {
    calls.push([name, ...args]);
    return query;
  };
}
query.range = async (start, end) => {
  calls.push(['range', start, end]);
  return { data: rows.slice(start, end + 1), error: failure };
};
const { fetchDailyPoints } = load('src/features/learning/api/daily-points-api.ts', {
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      from: (name) => {
        assert.equal(name, 'daily_tasks');
        return query;
      },
    }),
  },
});
assert.deepEqual(await fetchDailyPoints('child', '2026-10-14'), {
  points: 0.3,
  unrecordedCount: 1,
});
assert.ok(
  calls.some(
    (c) =>
      JSON.stringify(c) ===
      JSON.stringify(['gte', 'parent_verified_at', '2026-10-13T15:00:00.000Z']),
  ),
);
assert.ok(
  calls.some(
    (c) =>
      JSON.stringify(c) ===
      JSON.stringify(['lt', 'parent_verified_at', '2026-10-14T15:00:00.000Z']),
  ),
);
assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'daily_plans.child_id' && c[2] === 'child'));
assert.deepEqual(
  calls.find((c) => c[0] === 'in'),
  ['in', 'status', ['PARENT_CONFIRMED', 'PARTIAL']],
);
rows = Array.from({ length: 501 }, () => ({ awarded_growth_points: 0.000001 }));
assert.deepEqual(await fetchDailyPoints('child', '2026-10-14'), {
  points: 0.000501,
  unrecordedCount: 0,
});
assert.ok(calls.some((c) => c[0] === 'range' && c[1] === 500));
rows = [];
assert.deepEqual(await fetchDailyPoints('child', '2026-10-14'), { points: 0, unrecordedCount: 0 });
failure = new Error('offline');
await assert.rejects(fetchDailyPoints('child', '2026-10-14'), /offline/);

let options;
const { useDailyPoints: inspectQueryOptions } = load(
  'src/features/learning/hooks/use-daily-points.ts',
  {
    '@tanstack/react-query': {
      useQuery: (value) => {
        options = value;
      },
    },
    '@/features/learning/api/daily-points-api': { fetchDailyPoints },
    '@/features/learning/hooks/use-learning': { learningKeys: { all: ['learning'] } },
  },
);
inspectQueryOptions('child', '2026-10-14');
assert.deepEqual(options.queryKey, ['learning', 'daily-points', 'child', '2026-10-14']);
assert.equal(options.refetchInterval, 30_000);
inspectQueryOptions('child', '2026-10-15');
assert.equal(options.queryKey.at(-1), '2026-10-15');

const jsx = (type, props) => ({ type, props });
let state = { data: { points: 2.6, unrecordedCount: 0 } };
let retries = 0;
const { TodayPointsNote } = load('src/features/learning/components/today-points-note.tsx', {
  'lucide-react-native': { Star: 'Star' },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    View: 'View',
    Text: 'Text',
    Pressable: 'Button',
    StyleSheet: { create: (s) => s },
  },
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/design-system/tokens': load('src/design-system/tokens.ts', {}),
  '@/features/learning/hooks/use-seoul-today': { useSeoulToday: () => '2026-10-14' },
  '@/features/learning/hooks/use-daily-points': {
    useDailyPoints: () => ({ ...state, refetch: () => retries++ }),
  },
});
const nodes = (t) =>
  !t || typeof t !== 'object'
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const render = () => TodayPointsNote({ childId: 'child' });
const textContent = (node) =>
  node == null || typeof node === 'boolean'
    ? ''
    : Array.isArray(node)
      ? node.map(textContent).join('')
      : typeof node === 'object'
        ? textContent(node.props?.children)
        : String(node);
const text = () => textContent(render());
assert.match(text(), /오늘 부모님 확인으로 \+2.6포인트/);
state = { data: { points: 0, unrecordedCount: 0 } };
assert.match(text(), /0포인트.*부모님께 확인/);
state = { data: { points: 0, unrecordedCount: 1 } };
assert.match(text(), /기록이 없어/);
assert.doesNotMatch(text(), /0포인트/);
state = { data: { points: 1, unrecordedCount: 1 } };
assert.match(text(), /이전 확인분은 포함되지 않았어요/);
state = { isLoading: true };
assert.match(text(), /확인하고 있어요/);
assert.doesNotMatch(text(), /0 포인트/);
state = { isError: true };
assert.match(text(), /불러오지 못했어요/);
nodes(render())
  .find((n) => n.props.accessibilityRole === 'button')
  .props.onPress();
assert.equal(retries, 1);
console.log(
  'PASS daily points: Seoul boundaries, confirmed awards, decimal precision, pagination, date keys, refresh, UI states',
);
