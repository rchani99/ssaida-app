import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

const jsx = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
let viewport = { width: 420, fontScale: 1 };
let continuing = [],
  continuingError = false;
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const nodes = (n) =>
  !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = (n) =>
  n == null || typeof n === 'boolean'
    ? ''
    : typeof n !== 'object'
      ? String(n)
      : [n.props?.children].flat(Infinity).map(text).join('');
let tasks = [],
  plan = { data: { id: 'p', day_type: 'STUDY' } },
  taskError = false;
let onFocus,
  serverTasks,
  planRefreshes = 0;
let count = 0,
  error = false,
  loading = false,
  route;
const colors = { primaryLight: 'green', card: 'white' };
const mocks = {
  react: { useCallback: (callback) => callback },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': {
    Text: 'Text',
    View: 'View',
    Pressable: 'Pressable',
    StyleSheet: { create: (s) => s },
    useWindowDimensions: () => viewport,
  },
  'expo-router': {
    useFocusEffect: (callback) => {
      onFocus = callback;
    },
    useRouter: () => ({
      push: (value) => {
        route = value;
      },
    }),
  },
  '@/design-system/tokens': { colors, spacing: {}, radius: {}, sizing: {} },
  '@/features/learning/components/learning-controls': {
    learningStyles: {},
    LearningButton: 'Button',
  },
  '@/features/learning/hooks/use-seoul-today': { useSeoulToday: () => '2026-09-18' },
  '@/shared/hooks/use-today': { useToday: () => '2026-09-18' },
  '@/features/learning/hooks/use-learning': {
    useContinuingTasks: () => ({
      data: continuing,
      isError: continuingError,
      refetch: async () => {},
    }),
    useDailyPlan: () => ({
      ...plan,
      refetch: async () => {
        planRefreshes++;
      },
    }),
    useDailyTasks: () => ({
      data: tasks,
      isError: taskError,
      refetch: async () => {
        if (serverTasks) tasks = serverTasks;
      },
    }),
    usePendingConfirmations: () => ({
      data: Array.from({ length: count }, () => ({})),
      isError: error,
      isLoading: loading,
    }),
    useReviewTasks: () => ({
      data: Array.from({ length: count }, () => ({})),
      isError: error,
      isLoading: loading,
    }),
    useStudyItems: () => ({ data: [], isError: error, isLoading: loading }),
    useUnresolvedManualTasks: () => ({
      data: Array.from({ length: count }, () => ({})),
      isError: error,
      isLoading: loading,
    }),
  },
  '@/features/learning/utils/exception-tasks': { progressConflicts: (rows) => rows },
};
function load(path) {
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
mocks['@/design-system/tokens'] = load('src/design-system/tokens.ts');
mocks['@/features/learning/utils/visible-tasks'] = load(
  'src/features/learning/utils/visible-tasks.ts',
);
mocks['./tokens'] = mocks['@/design-system/tokens'];
mocks['@/design-system/icons'] = load('src/design-system/icons.ts');
mocks['lucide-react-native'] = {
  BookOpenCheck: 'BookOpenCheck',
  ClipboardList: 'ClipboardList',
  House: 'House',
  ChartColumn: 'ChartColumn',
  Settings: 'Settings',
  CircleCheck: 'CircleCheck',
  Clock3: 'Clock3',
  CircleAlert: 'CircleAlert',
  Clock: 'Clock',
  TriangleAlert: 'TriangleAlert',
  ChevronRight: 'ChevronRight',
};
mocks['@/features/learning/components/today-summary-card'] = load(
  'src/features/learning/components/today-summary-card.tsx',
);
mocks['@/shared/components/parent-ui'] = load('src/shared/components/parent-ui.tsx');
const { TodayPlanSummary } = load('src/features/learning/components/today-plan-summary.tsx');
const { ParentReviewLinks } = load('src/features/learning/components/parent-review-links.tsx');
for (count of [0, 1, 4, 1000]) {
  const section = ParentReviewLinks({ childId: 'child' });
  assert.ok(text(section).startsWith('확인이 필요한 항목'));
  const cards = nodes(section).filter((n) => flatten(n.props?.style).borderRadius === 18);
  assert.equal(cards.length, 1);
  assert.equal(flatten(cards[0].props.style).borderColor, '#BFD8C7');
  assert.equal(flatten(cards[0].props.style).backgroundColor, '#FFFFFF');
  const links = nodes(section).filter((n) => n.type === 'Pressable');
  assert.equal(links.length, 3);
  for (const [i, tab] of ['pending', 'unresolved', 'conflicts'].entries()) {
    assert.equal(
      links[i].props.accessibilityLabel,
      `${['확인 필요', '미완료', '진도 충돌'][i]} ${count}개`,
    );
    assert.equal(links[i].props.accessibilityRole, 'button');
    const rowStyle = flatten(links[i].props.style({ pressed: false }));
    assert.ok(rowStyle.minHeight >= 48);
    assert.equal(rowStyle.width, undefined);
    assert.equal(rowStyle.borderBottomWidth, i < 2 ? 1 : undefined);
    assert.equal(flatten(links[i].props.style({ pressed: true })).backgroundColor, '#F7FAF7');
    assert.equal(
      flatten(nodes(links[i]).find((n) => flatten(n.props?.style).borderRadius === 999).props.style)
        .backgroundColor,
      ['#FCEAEA', '#FFF3DF', '#F0ECFF'][i],
    );
    const badge = nodes(links[i]).find(
      (n) => n.type === 'Text' && n.props.children === `${count}개`,
    );
    assert.equal(flatten(badge.props.style).color, ['#B73535', '#A96B00', '#5A4AA3'][i]);
    const icon = nodes(links[i]).find(
      (n) => n.type === ['CircleAlert', 'Clock', 'TriangleAlert'][i],
    );
    assert.equal(icon.props.size, 20);
    assert.equal(icon.props.strokeWidth, 2);
    assert.equal(icon.props.accessible, false);
    assert.ok(nodes(links[i]).some((n) => n.type === 'ChevronRight'));
    const pill = nodes(links[i]).find((n) => n.props?.children === badge);
    assert.equal(flatten(pill.props.style).borderRadius, 999);
    assert.equal(flatten(pill.props.style).backgroundColor, ['#FCEAEA', '#FFF3DF', '#F0ECFF'][i]);
    links[i].props.onPress();
    assert.equal(route, `/parent-review?tab=${tab}`);
  }
}
for (const state of ['error', 'loading']) {
  error = state === 'error';
  loading = state === 'loading';
  const unavailable = ParentReviewLinks({ childId: 'child' });
  const rows = nodes(unavailable).filter((n) => n.type === 'Pressable');
  assert.equal(rows.length, 3);
  for (const [i, row] of rows.entries()) {
    assert.ok(row.props.accessibilityLabel.endsWith(error ? '조회 실패' : '불러오는 중'));
    row.props.onPress();
    assert.equal(route, `/parent-review?tab=${['pending', 'unresolved', 'conflicts'][i]}`);
  }
}
error = loading = false;
// Exercise the actual status classifier and pending exclusions with different row counts.
const savedHooks = mocks['@/features/learning/hooks/use-learning'];
const savedExceptions = mocks['@/features/learning/utils/exception-tasks'];
mocks['@/features/learning/utils/exception-tasks'] = load(
  'src/features/learning/utils/exception-tasks.ts',
);
mocks['@/features/learning/hooks/use-learning'] = {
  ...savedHooks,
  usePendingConfirmations: () => ({
    data: [{}, {}, { excluded_for_today: true }, { quantity_conflict: 'GAP' }],
  }),
  useReviewTasks: () => ({
    data: [
      { quantity_conflict: 'GAP' },
      { quantity_conflict: 'FULL_OVERLAP' },
      { quantity_conflict: 'PARTIAL_OVERLAP' },
      { source_type: 'MANUAL' },
    ],
  }),
  useUnresolvedManualTasks: () => ({ data: [{}] }),
};
const actualLinks = load(
  'src/features/learning/components/parent-review-links.tsx',
).ParentReviewLinks;
const mixedRows = nodes(actualLinks({ childId: 'child' })).filter((n) => n.type === 'Pressable');
assert.deepEqual(
  mixedRows.map((n) => n.props.accessibilityLabel),
  ['확인 필요 2개', '미완료 1개', '진도 충돌 3개'],
);
for (const [i, row] of mixedRows.entries()) {
  row.props.onPress();
  assert.equal(route, '/parent-review?tab=' + ['pending', 'unresolved', 'conflicts'][i]);
}
mocks['@/features/learning/hooks/use-learning'] = savedHooks;
mocks['@/features/learning/utils/exception-tasks'] = savedExceptions;
console.log(
  'PASS D3 one list card, two dividers, 0/1/4/1000 counts, status colors/icons, loading/error and unchanged filtered counts/routes',
);
const task = (status, extra = {}) => ({
  id: status,
  name_snapshot: status,
  status,
  item_type: 'ACTIVITY',
  planned_minutes: 10,
  ...extra,
});
for (const n of [0, 1, 4]) {
  tasks = Array.from({ length: n }, (_, i) => task('PLANNED', { id: String(i) }));
  const status = text(TodayPlanSummary({ childId: 'child', mode: 'status' }));
  assert.ok(
    status.includes(
      `오늘 ${n}개 남았어요약 ${n * 10}분 · 오늘 계획 ${n}개 · 이어하기 0개0%완료0개계획 시간${n * 10}분`,
    ),
  );
}
tasks = ['PLANNED', 'IN_PROGRESS', 'RETRY', 'CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL'].map(
  (s) => task(s),
);
tasks.push(
  task('SKIPPED'),
  task('PLANNED', { excluded_for_today: true, name_snapshot: 'excluded' }),
);
tasks[0] = task('PLANNED', {
  item_type: 'WORKBOOK',
  planned_start_page: 95,
  planned_end_page: 99,
  quantity_conflict: 'GAP',
});
const status = text(TodayPlanSummary({ childId: 'child', mode: 'status' }));
assert.ok(
  status.match(/오늘 2개 남았어요.*오늘 계획 5개 · 이어하기 \d+개\d+%완료3개계획 시간50분/),
);
const summary = TodayPlanSummary({ childId: 'child' });
assert.ok(text(summary).includes('95~99쪽진도 확인 필요'));
assert.ok(text(summary).includes('부모 확인 대기'));
assert.ok(!text(summary).includes('excluded'));
assert.ok(!text(summary).includes('SKIPPED'));
assert.equal(nodes(summary).filter((n) => n.type === 'Button').length, 0, 'Read-only summary');
plan.data.day_type = 'REST';
assert.ok(text(TodayPlanSummary({ childId: 'child' })).includes('정기 휴식일'));
taskError = true;
assert.ok(!text(TodayPlanSummary({ childId: 'child', mode: 'status' })).includes('60분'));
taskError = false;
plan = { data: null };
assert.ok(text(TodayPlanSummary({ childId: 'child' })).includes('아직 오늘 계획이 없어요'));
console.log(
  'PASS dashboard: 0/1/many, quiet zero, three tab links, error/loading, counts/time, exclusion, REST, workbook/status list, read-only/no fabricated values',
);
plan = { data: { id: 'p' } };
tasks = [task('PLANNED')];
for (const [width, fontScale, direction] of [
  [420, 1, 'row'],
  [320, 1, 'column'],
  [420, 1.5, 'column'],
  [320, 2, 'column'],
]) {
  viewport = { width, fontScale };
  const tree = TodayPlanSummary({ childId: 'child', mode: 'status' });
  const stats = nodes(tree).find((n) => flatten(n.props?.style).paddingTop === 12);
  assert.equal(flatten(stats.props.style).flexDirection, direction);
  for (const n of nodes(tree).filter((n) => n.type === 'Text')) {
    assert.equal(n.props.numberOfLines, undefined, 'Text can wrap at large font sizes');
    assert.equal(flatten(n.props.style).height, undefined);
  }
  assert.equal(nodes(tree).filter((n) => ['CircleCheck', 'Clock3'].includes(n.type)).length, 2);
}
const controls = load('src/features/learning/components/learning-controls.tsx');
const secondary = controls.LearningButton({ label: 'legacy', onPress() {} });
assert.equal(
  flatten(secondary.props.style).backgroundColor,
  mocks['@/design-system/tokens'].colors.primaryLight,
);
const primary = controls.LearningButton({ label: 'CTA', onPress() {}, variant: 'primary' });
assert.equal(
  flatten(primary.props.style).backgroundColor,
  mocks['@/design-system/tokens'].colors.primary,
);
assert.equal(flatten(primary.props.style).minHeight, 52);
console.log(
  'PASS parent v2: actual components, responsive summary rows/stacked stats, font scaling, Primary opt-in and unchanged legacy Secondary',
);

// Real mutation invalidation must refresh both source types, not only mocked UI rows.
for (const [hook, sourceType] of [
  ['useRescheduleManualTask', 'RESCHEDULED'],
  ['useAddManualDailyTask', 'MANUAL'],
]) {
  tasks = [
    task('PLANNED', { id: 'a', source_type: 'AUTO', planned_minutes: 15 }),
    task('PLANNED', { id: 'b', source_type: 'AUTO', planned_minutes: 20 }),
  ];
  serverTasks = tasks;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const key = ['learning', 'tasks', 'p'];
  client.setQueryData(key, tasks);
  const query = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => serverTasks,
  });
  const stop = query.subscribe(() => {});
  let options;
  mocks['@tanstack/react-query'] = {
    useQueryClient: () => client,
    useMutation: (value) => {
      options = value;
    },
  };
  const add = async () => {
    serverTasks = [
      ...serverTasks,
      task('PLANNED', { id: 'c', source_type: sourceType, planned_minutes: 25 }),
    ];
    return 'c';
  };
  mocks['@/features/learning/api/learning-api'] = {
    rescheduleManualTask: add,
    addManualDailyTask: add,
  };
  load('src/features/learning/hooks/use-learning.ts')[hook]();
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 2개 남았어요.*오늘 계획 2개 · 이어하기 \d+개\d+%완료0개계획 시간35분/,
    ),
  );
  await new MutationObserver(client, options).mutate({});
  tasks = client.getQueryData(key);
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 3개 남았어요.*오늘 계획 3개 · 이어하기 \d+개\d+%완료0개계획 시간60분/,
    ),
  );
  // A mounted tab with an old snapshot must also refresh on return.
  tasks = tasks.slice(0, 2);
  TodayPlanSummary({ childId: 'child', mode: 'status' });
  onFocus();
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 3개 남았어요.*오늘 계획 3개 · 이어하기 \d+개\d+%완료0개계획 시간60분/,
    ),
  );
  tasks = [
    ...tasks,
    task('PLANNED', { excluded_for_today: true, planned_minutes: 100 }),
    task('SKIPPED'),
    ...['GAP', 'PARTIAL_OVERLAP', 'FULL_OVERLAP'].map((quantity_conflict) =>
      task('PLANNED', { quantity_conflict }),
    ),
  ];
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 3개 남았어요.*오늘 계획 3개 · 이어하기 \d+개\d+%완료0개계획 시간60분/,
    ),
  );
  // Completing the added task must move one count from remaining to completed,
  // without changing plan membership or its planned time. RPC is mocked, while
  // the production hook and TanStack invalidation/refetch run unchanged.
  serverTasks = serverTasks.map((row) =>
    row.id === 'c' ? { ...row, status: 'IN_PROGRESS' } : row,
  );
  mocks['@/features/learning/api/learning-api'].completeDailyTask = async (id) => {
    assert.equal(id, 'c');
    serverTasks = serverTasks.map((row) =>
      row.id === id ? { ...row, status: 'CHILD_COMPLETED' } : row,
    );
  };
  load('src/features/learning/hooks/use-learning.ts').useCompleteDailyTask();
  await new MutationObserver(client, options).mutate('c');
  tasks = client.getQueryData(key);
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 2개 남았어요.*오늘 계획 3개 · 이어하기 \d+개\d+%완료1개계획 시간60분/,
    ),
    `${sourceType}: completing the added study updates all four metrics`,
  );
  tasks = tasks.map((row) => (row.id === 'c' ? { ...row, excluded_for_today: true } : row));
  assert.ok(
    text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
      /오늘 2개 남았어요.*오늘 계획 2개 · 이어하기 \d+개\d+%완료0개계획 시간35분/,
    ),
    'Excluded rows contribute to none of the four metrics, regardless of status',
  );
  stop();
  client.clear();
}
assert.equal(planRefreshes, 2);
tasks = [];
continuing = ['IN_PROGRESS', 'RETRY', 'IN_PROGRESS'].map((status, i) =>
  task(status, { id: `past-${i}`, planned_minutes: 20 }),
);
let separated = text(TodayPlanSummary({ childId: 'child', mode: 'status' }));
assert.ok(
  separated.match(/오늘 3개 남았어요.*오늘 계획 0개 · 이어하기 \d+개\d+%완료0개계획 시간0분/),
);
assert.ok(separated.includes('약 60분 · 오늘 계획 0개 · 이어하기 3개'));
tasks = [
  task('PLANNED', {
    id: 'moved',
    source_type: 'RESCHEDULED',
    source_daily_task_id: 'past-0',
    planned_minutes: 20,
  }),
];
separated = text(TodayPlanSummary({ childId: 'child', mode: 'status' }));
assert.ok(
  separated.match(/오늘 3개 남았어요.*오늘 계획 1개 · 이어하기 \d+개\d+%완료0개계획 시간20분/),
);
assert.ok(separated.includes('약 60분 · 오늘 계획 1개 · 이어하기 2개'));
tasks[0].status = 'CHILD_COMPLETED';
assert.ok(
  text(TodayPlanSummary({ childId: 'child', mode: 'status' })).match(
    /오늘 2개 남았어요.*오늘 계획 1개 · 이어하기 \d+개\d+%완료1개계획 시간20분/,
  ),
);
continuingError = true;
assert.ok(!text(TodayPlanSummary({ childId: 'child', mode: 'status' })).includes('남았어요'));
continuingError = false;
console.log(
  'PASS separate continuing totals, rescheduled ancestor deduplication, completion and continuing-query error',
);
mocks.react = {
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: () => [0, () => {}],
};
mocks['@/features/learning/hooks/use-learning'].useCurrentChild = () => ({
  data: { id: 'child', name: 'Test' },
});
mocks['@/features/learning/hooks/use-learning'].useEnsureDailyPlan = () => ({ mutate() {} });
mocks['@/features/learning/hooks/use-learning'].useStartDailyTask = () => ({ mutate() {} });
mocks['@/shared/components/screen-message'] = {
  ScreenMessage: ({ message }) => jsx('Text', { children: message }),
};
mocks['@/features/learning/utils/exception-tasks'] = load(
  'src/features/learning/utils/exception-tasks.ts',
);
const { ChildTodayScreen } = load('src/features/learning/screens/child-today-screen.tsx');
tasks = [];
plan = { data: { id: 'p', day_type: 'REST', target_minutes_snapshot: 60 } };
let childText = text(ChildTodayScreen());
assert.ok(childText.includes('오늘 0개 · 약 0분'));
assert.ok(childText.includes('이어하기 3개 · 약 60분'));
assert.ok(childText.includes('오늘의 공부'));
assert.ok(childText.includes('오늘은 쉬는 날이에요'));
tasks = [
  task('PLANNED', {
    id: 'moved',
    name_snapshot: 'Moved today',
    source_type: 'RESCHEDULED',
    source_daily_task_id: 'past-0',
  }),
];
childText = text(ChildTodayScreen());
assert.ok(childText.includes('이어하기 2개 · 약 40분'));
assert.ok(childText.includes('오늘 공부 1개Moved today'));
const { groupTodayTasks } = mocks['@/features/learning/utils/visible-tasks'];
const grouped = groupTodayTasks(tasks, [
  ...continuing,
  task('RETRY', { id: 'blocked', quantity_conflict: 'GAP' }),
  task('IN_PROGRESS', { id: 'excluded', excluded_for_today: true }),
]);
assert.equal(grouped.remaining, 3);
assert.deepEqual(
  grouped.continuing.map((row) => row.id),
  ['past-1', 'past-2'],
);
// Same/null StudyItem ids must not hide today's distinct snapshots.
assert.equal(
  groupTodayTasks(
    [task('PLANNED', { id: 'today', study_item_id: 'book' })],
    [task('RETRY', { id: 'past', study_item_id: 'book' })],
  ).todayCount,
  1,
);
console.log(
  'PASS actual child sections: today/continuing separation, REST, reschedule dedup, blocked/excluded and same-item snapshots',
);
console.log(
  'PASS manual/reschedule real mutation → query refresh → dashboard 3 tasks/60 minutes; focus refresh; excluded/skipped/conflicts omitted',
);

// D2: exact remaining-time/progress values from actual grouped snapshots.
viewport = { width: 320, fontScale: 2 };
const progressOf = (tree) => nodes(tree).find((n) => n.props?.accessibilityRole === 'progressbar');
for (const [fixture, expectedMinutes, percent] of [
  [[], 0, 0],
  [[task('PARENT_CONFIRMED')], 0, 100],
  [[task('CHILD_COMPLETED'), task('PARTIAL'), task('PLANNED', { planned_minutes: 25 })], 25, 67],
]) {
  tasks = fixture;
  continuing = [];
  const tree = TodayPlanSummary({ childId: 'child', mode: 'status' });
  assert.ok(text(tree).includes('약 ' + expectedMinutes + '분'));
  assert.equal(progressOf(tree).props.accessibilityValue.now, percent);
  assert.ok(!text(tree).includes('2026-09-18'));
  assert.ok(!text(tree).includes('완료에는 부모 확인 대기'));
  assert.ok(!text(tree).includes('오늘 상태'));
}
tasks = [task('PLANNED', { planned_minutes: 20 })];
continuing = [
  task('RETRY', { id: 'past-a', planned_minutes: 20 }),
  task('IN_PROGRESS', { id: 'past-b', planned_minutes: 20 }),
];
let d2 = TodayPlanSummary({ childId: 'child', mode: 'status' });
assert.ok(
  text(d2).includes(
    '오늘 3개 남았어요약 60분 · 오늘 계획 1개 · 이어하기 2개0%완료0개계획 시간20분',
  ),
);
plan.isLoading = true;
assert.equal(progressOf(TodayPlanSummary({ childId: 'child', mode: 'status' })), undefined);
plan.isLoading = false;
continuingError = true;
assert.equal(progressOf(TodayPlanSummary({ childId: 'child', mode: 'status' })), undefined);
continuingError = false;

// The real header button retains its store transition and root replacement.
let mode;
mocks['@/store/app-mode.store'] = {
  useAppModeStore: (select) =>
    select({
      setMode: (next) => {
        mode = next;
      },
    }),
};
mocks['expo-router'].useRouter = () => ({
  replace: (next) => {
    route = next;
  },
});
const { ChildModeButton } = load('src/features/auth/components/child-mode-button.tsx');
for (const dashboard of [false, true]) {
  const button = ChildModeButton({ dashboard });
  assert.equal(button.props.accessibilityLabel, '아이 화면');
  button.props.onPress();
  assert.equal(mode, 'child');
  assert.equal(route, '/');
}
const Tabs = (props) => ({ type: 'Tabs', props });
Tabs.Screen = 'TabScreen';
mocks['expo-router'].Tabs = Tabs;
mocks['@/features/auth/components/child-mode-button'] = { ChildModeButton };
const tabs = load('src/app/parent/_layout.tsx').default();
const home = nodes(tabs).find((n) => n.props?.name === 'home');
assert.equal(home.props.options.title, '대시보드');
assert.equal(home.props.options.headerShown, undefined, 'Use the native tab header');
assert.equal(
  (home.props.options.headerStyle ?? tabs.props.screenOptions.headerStyle).height,
  undefined,
);
assert.equal(tabs.props.screenOptions.headerStyle.height, undefined);
(home.props.options.headerRight ?? tabs.props.screenOptions.headerRight)().props.onPress();
assert.equal(mode, 'child');
assert.equal(route, '/');
console.log(
  'PASS D2 remaining time, 0/67/100% progress, loading/error, date, icons, native header and child-mode transition',
);

// D4: list preserves query order and all existing status semantics.
continuing = [];
tasks = [
  task('RETRY', {
    id: 'manual',
    name_snapshot: 'Manual first',
    source_type: 'MANUAL',
    item_type: 'ACTIVITY',
    planned_minutes: 20,
  }),
  task('PLANNED', {
    id: 'auto',
    name_snapshot: 'Workbook second',
    source_type: 'AUTO',
    item_type: 'WORKBOOK',
    planned_start_page: 15,
    planned_end_page: 17,
  }),
  task('IN_PROGRESS', {
    id: 'conflict',
    name_snapshot: 'Conflict third',
    quantity_conflict: 'GAP',
  }),
  task('PLANNED', { id: 'excluded', name_snapshot: 'Hidden', excluded_for_today: true }),
];
const listTree = TodayPlanSummary({ childId: 'child' });
const listText = text(listTree);
assert.ok(listText.indexOf('Manual first') < listText.indexOf('Workbook second'));
assert.ok(listText.indexOf('Workbook second') < listText.indexOf('Conflict third'));
assert.ok(listText.includes('약 20분다시 하기'));
assert.ok(listText.includes('15~17쪽시작 전'));
assert.ok(listText.includes('진도 확인 필요'));
assert.ok(!listText.includes('Hidden'));
assert.equal(nodes(listTree).filter((n) => ['BookOpenCheck', 'Clock3'].includes(n.type)).length, 3);
assert.equal(
  nodes(listTree).filter((n) => flatten(n.props?.style).borderBottomWidth === 1).length,
  2,
);
assert.equal(nodes(listTree).filter((n) => flatten(n.props?.style).borderRadius === 18).length, 1);
assert.equal(
  nodes(listTree).filter((n) => n.type === 'Pressable' || n.type === 'ChevronRight').length,
  0,
);
for (const n of nodes(listTree).filter((n) => n.type === 'Text')) {
  assert.equal(n.props.numberOfLines, undefined);
}
tasks = [];
assert.ok(text(TodayPlanSummary({ childId: 'child' })).includes('오늘 계획된 공부가 없어요.'));
console.log(
  'PASS D4 one read-only list, original item order/count, page/time/status labels, decorative icons, dividers, empty state',
);

// D5: compact/normal widths, enlarged fonts, large totals and long titles.
for (const width of [320, 360, 412]) {
  for (const fontScale of [1, 1.5, 2]) {
    viewport = { width, fontScale };
    tasks = Array.from({ length: 100 }, (_, i) =>
      task(i < 99 ? 'PARENT_CONFIRMED' : 'RETRY', {
        id: String(i),
        name_snapshot: '아주 긴 공부 제목과 페이지 설명을 여러 줄로 표시하는 항목 '.repeat(5),
        planned_minutes: 999,
      }),
    );
    continuing = [];
    const status = TodayPlanSummary({ childId: 'child', mode: 'status' });
    assert.equal(progressOf(status).props.accessibilityValue.now, 99);
    assert.ok(text(status).includes('오늘 1개 남았어요'));
    assert.ok(text(status).includes('계획 시간99900분'));
    const list = TodayPlanSummary({ childId: 'child' });
    assert.ok(text(list).includes(tasks[0].name_snapshot));
    for (const n of nodes(list).filter((n) => n.type === 'Text')) {
      assert.equal(n.props.numberOfLines, undefined);
      assert.equal(n.props.allowFontScaling, undefined);
      assert.equal(flatten(n.props.style).height, undefined);
    }
    const iconParents = nodes(status).filter(
      (n) => n.props?.children?.type === 'CircleCheck' || n.props?.children?.type === 'Clock3',
    );
    for (const n of iconParents) assert.equal(flatten(n.props.style).padding, 12);
  }
}
console.log(
  'PASS D5 320/360/412 layouts, font scale 1/1.5/2, long titles, three-digit counts and long times (component assertions, not pixel rendering)',
);

// D6: every tab supplies a real SVG icon and preserves navigator tint.
for (const [name, iconName] of [
  ['home', 'House'],
  ['study-management', 'ClipboardList'],
  ['records', 'ChartColumn'],
  ['settings', 'Settings'],
]) {
  const tab = nodes(tabs).find((n) => n.props?.name === name);
  for (const color of ['#5E8D63', '#747A74']) {
    const icon = tab.props.options.tabBarIcon({ color, focused: true, size: 24 });
    assert.equal(icon.type, iconName);
    assert.equal(icon.props.color, color);
    assert.equal(icon.props.size, 24);
    assert.equal(icon.props.strokeWidth, 2);
    assert.equal(icon.props.accessible, false);
  }
}
const outline = controls.LearningButton({
  label: '오늘 공부 편집',
  variant: 'outline',
  onPress() {},
});
assert.equal(flatten(outline.props.style).backgroundColor, '#FFFFFF');
assert.equal(flatten(outline.props.style).minHeight, 48);
assert.equal(flatten(outline.props.style).borderWidth, 1);
console.log('PASS D6 four Lucide tab icons with active/inactive tint and outline edit button');

const inlineCopy = nodes(listTree).find(
  (n) => n.type === 'Text' && text(n) === 'Manual first · 약 20분',
);
assert.ok(inlineCopy);
assert.equal(flatten(inlineCopy.props.style).flex, 1);
assert.equal(inlineCopy.props.numberOfLines, undefined);
const inlineRow = nodes(listTree).find(
  (n) => n.type === 'View' && [n.props?.children].flat().includes(inlineCopy),
);
assert.equal(flatten(inlineRow.props.style).flexDirection, 'row');
assert.equal(text(inlineRow), 'Manual first · 약 20분다시 하기');
assert.equal(flatten(inlineRow.props.children[1].props.style).flexShrink, 0);
const dashboardChildButton = ChildModeButton({ dashboard: true });
assert.ok(
  nodes(dashboardChildButton).some(
    (n) => n.type === 'ChevronRight' && n.props.accessible === false,
  ),
);
assert.equal(dashboardChildButton.props.accessibilityLabel, '아이 화면');
console.log(
  'PASS D7 inline title/description with independent right status; child button semantics preserved; dashboard date and note removed',
);
