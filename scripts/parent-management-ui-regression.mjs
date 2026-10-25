import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

const source = readFileSync(
  new URL('../src/features/learning/screens/study-management-screen.tsx', import.meta.url),
  'utf8',
);
const home = readFileSync(
  new URL('../src/features/learning/screens/parent-home-screen.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(home, /StudyItemForm|StudyItemActions|useStudyItems|useCreateStudyItem/);
assert.doesNotMatch(source, /TaskOrderPanel|TaskQuantityPanel|TaskExclusionPanel|ManualTasksPanel/);
assert.match(
  readFileSync(new URL('../src/app/parent/study-management.tsx', import.meta.url), 'utf8'),
  /StudyManagementScreen as default/,
);

let cursor = 0;
const slots = [];
const writes = [];
const mutation = (kind) => ({ mutate: (...args) => writes.push({ kind, args }) });
let child = { data: { id: 'child', name: 'Child' } };
let items = { data: [] };
const jsx = (type, props, key) => ({ type, props, key });
const mocks = {
  react: {
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    ActivityIndicator: 'Loading',
    KeyboardAvoidingView: 'Keyboard',
    Platform: { OS: 'android' },
    Pressable: 'Button',
    ScrollView: 'Scroll',
    StyleSheet: { create: (value) => value },
    Text: 'Text',
    TextInput: 'Input',
    View: 'View',
  },
  '@/design-system/tokens': { colors: {}, radius: {}, sizing: {}, spacing: {} },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => child,
    useStudyItems: () => items,
    useCreateStudyItem: () => mutation('create'),
    useUpdateStudyItem: () => mutation('update'),
    useChangeStudyItemStatus: () => mutation('status'),
  },
};
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    source
      .replace('function StudyItemForm(', 'export function StudyItemForm(')
      .replace('function StudyItemActions(', 'export function StudyItemActions('),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
)(
  (id) => {
    Object.assign(mocks, uiMocks(mocks));
    assert.ok(id in mocks, id);
    return mocks[id];
  },
  module,
  module.exports,
);
const { StudyManagementScreen, StudyItemForm, StudyItemActions } = module.exports;
const nodes = (value) =>
  !value || typeof value !== 'object'
    ? []
    : Array.isArray(value)
      ? value.flatMap(nodes)
      : [value, ...nodes(value.props?.children)];
const text = (value) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value.map(text).join('')
      : value?.props
        ? text(value.props.children)
        : '';
let component, props;
const render = () => {
  cursor = 0;
  return component(props);
};
const mount = (fn, input = {}) => {
  slots.length = 0;
  component = fn;
  props = input;
  return render();
};
const click = (label) => {
  const button = nodes(render()).find((node) => node.type === 'Button' && text(node) === label);
  assert.ok(button, label);
  assert.ok(!button.props.disabled, label + ' disabled');
  button.props.onPress();
};
const field = (label, value) => {
  const input = nodes(render()).find((node) => node.props?.label === label);
  assert.ok(input, label);
  input.props.onChangeText(value);
};
const item = {
  id: 'book',
  child_id: 'child',
  name: 'Book',
  status: 'ACTIVE',
  item_type: 'WORKBOOK',
  subject: null,
  estimated_minutes: 20,
  study_weekdays: [1],
  workbook_pages_per_session: 5,
  workbook_last_page: 100,
  workbook_last_completed_page: 27,
  workbook_next_start_page_override: null,
  updated_at: 'version',
};
items = { data: [item, { ...item, id: 'activity', name: 'Read', item_type: 'ACTIVITY' }] };
mount(StudyManagementScreen);
assert.equal(nodes(render()).filter((node) => node.type === StudyItemActions).length, 2);
assert.equal(nodes(render()).filter((node) => node.type === StudyItemForm).length, 1);
child = { isLoading: true };
assert.equal(render().props.loading, true);
child = { isError: true };
assert.equal(render().props.actionLabel, '다시 불러오기');
child = { data: { id: 'child' } };

mount(StudyItemActions, { item });
click('잠시 쉬기');
assert.equal(writes.at(-1).args[0].status, 'PAUSED');
mount(StudyItemActions, { item: { ...item, status: 'PAUSED' } });
click('다시 시작');
assert.equal(writes.at(-1).args[0].status, 'ACTIVE');
mount(StudyItemActions, { item });
click('수정');
assert.ok(nodes(render()).some((node) => node.type === StudyItemForm));
mount(StudyItemActions, { item });
const beforeDelete = writes.length;
click('삭제');
assert.equal(writes.length, beforeDelete);
click('취소');
assert.equal(writes.length, beforeDelete);
click('삭제');
click('삭제 확인');
assert.equal(writes.at(-1).args[0].status, 'DELETED');

mount(StudyItemForm, { childId: 'child' });
click('+ 공부 등록');
field('공부 이름', 'New book');
click('월');
field('다음 시작 페이지', '28');
click('등록');
assert.equal(writes.at(-1).kind, 'create');
assert.equal(writes.at(-1).args[0].workbookNextStartPage, 28);
assert.equal(writes.at(-1).args[0].applyFromToday, false);
const savedRegistration = writes.at(-1);
click('등록');
assert.equal(writes.at(-1), savedRegistration, 'Double submit must not register another item');
savedRegistration.args[1].onSettled();
click('오늘부터 적용');
assert.equal(
  nodes(render()).find((node) => node.props?.accessibilityLabel === '오늘부터 적용').props
    .accessibilityState.checked,
  true,
);
click('등록');
assert.equal(writes.at(-1).args[0].applyFromToday, true);
writes.at(-1).args[1].onSuccess();
writes.at(-1).args[1].onSettled();
click('+ 공부 등록');
assert.equal(
  nodes(render()).find((node) => node.props?.accessibilityLabel === '오늘부터 적용').props
    .accessibilityState.checked,
  false,
  'Successful registration resets the checkbox',
);
mount(StudyItemForm, { childId: 'child', item });
assert.ok(!nodes(render()).some((node) => node.props?.accessibilityLabel === '오늘부터 적용'));
field('다음 시작 페이지', '40');
click('저장');
assert.equal(writes.at(-1).kind, 'update');
assert.equal(writes.at(-1).args[0].values.workbookNextStartPage, 40);
assert.equal(item.workbook_last_completed_page, 27);
writes.at(-1).args[1].onSettled();
const beforeInvalid = writes.length;
field('다음 시작 페이지', '101');
click('저장');
assert.equal(writes.length, beforeInvalid);
mount(StudyItemForm, { childId: 'child' });
click('+ 공부 등록');
click('활동');
field('공부 이름', 'Read');
click('월');
click('오늘부터 적용');
click('등록');
assert.equal(writes.at(-1).args[0].itemType, 'ACTIVITY');
assert.equal(writes.at(-1).args[0].applyFromToday, true);
assert.equal(writes.at(-1).args[0].workbookNextStartPage, undefined);
console.log(
  'PASS management relocation: route, isolated responsibilities, loading/error, workbook/activity registration, override validation, edit/pause/resume/confirmed soft delete',
);

// The edit session owns its original version even if refetch returns a newer row.
mount(StudyItemActions, { item });
click('수정');
const opened = nodes(render()).find((node) => node.type === StudyItemForm);
props = { item: { ...item, name: 'Server changed', updated_at: 'new-version' } };
const refetched = nodes(render()).find((node) => node.type === StudyItemForm);
assert.equal(refetched.key, opened.key, 'Refetch cannot remount the editing form');
assert.equal(refetched.props.item, item, 'Preserve the original optimistic concurrency version');
assert.ok(nodes(render()).find((node) => text(node) === '수정').props.disabled);
refetched.props.onClose();
assert.ok(!nodes(render()).some((node) => node.type === StudyItemForm));
click('수정');
assert.equal(
  nodes(render()).find((node) => node.type === StudyItemForm).props.item.updated_at,
  'new-version',
  'A new edit session uses the latest row',
);

for (const type of ['WORKBOOK', 'ACTIVITY']) {
  for (const mode of ['create', 'update']) {
    let closes = 0;
    const editItem = { ...item, item_type: type };
    mount(StudyItemForm, {
      childId: 'child',
      ...(mode === 'update' ? { item: editItem, onClose: () => closes++ } : {}),
    });
    if (mode === 'create') {
      click('+ 공부 등록');
      if (type === 'ACTIVITY') click('활동');
      click('월');
    }
    field('공부 이름', 'Unsaved draft');
    const submitLabel = mode === 'create' ? '등록' : '저장';
    const formNodes = nodes(render());
    assert.ok(!formNodes.some((node) => text(node) === '등록 닫기'));
    assert.ok(!formNodes.some((node) => node.type === 'Button' && text(node) === '+ 공부 등록'));
    const submitButton = formNodes.find(
      (node) => node.type === 'Button' && text(node) === submitLabel,
    );
    const cancelButton = formNodes.find((node) => node.type === 'Button' && text(node) === '취소');
    const count = writes.length;
    // Repeated presses before React's next render still issue only one write.
    submitButton.props.onPress();
    submitButton.props.onPress();
    cancelButton.props.onPress();
    assert.equal(writes.length, count + 1);
    assert.equal(closes, 0, 'Cancel cannot dismiss an in-flight write');
    const write = writes.at(-1);
    if (mode === 'update') assert.equal(write.args[0].item.updated_at, 'version');
    write.args[1].onError(new Error('write failed'));
    write.args[1].onSettled();
    assert.equal(closes, 0);
    assert.equal(
      nodes(render()).find((node) => node.props?.label === '공부 이름').props.value,
      'Unsaved draft',
    );
    assert.match(text(render()), /못했어요/, 'Failure is visible and draft remains editable');
    click(submitLabel);
    assert.equal(writes.length, count + 2, 'Retry is allowed after failure');
    writes.at(-1).args[1].onSuccess();
    writes.at(-1).args[1].onSettled();
    if (mode === 'update') assert.equal(closes, 1);
    else {
      assert.ok(!nodes(render()).some((node) => node.props?.label === '공부 이름'));
      click('+ 공부 등록');
      assert.equal(
        nodes(render()).find((node) => node.props?.label === '공부 이름').props.value,
        '',
      );
    }
  }
}
mount(StudyItemForm, { childId: 'child' });
click('+ 공부 등록');
click('활동');
field('공부 이름', 'Discard me');
field('예상 소요시간 (분)', '35');
click('월');
click('오늘부터 적용');
const beforeCancel = writes.length;
click('취소');
assert.equal(writes.length, beforeCancel, 'Cancel never writes');
assert.ok(!nodes(render()).some((node) => node.props?.label === '공부 이름'));
click('+ 공부 등록');
assert.equal(nodes(render()).find((node) => node.props?.label === '공부 이름').props.value, '');
assert.equal(
  nodes(render()).find((node) => node.props?.label === '예상 소요시간 (분)').props.value,
  '20',
);
assert.ok(nodes(render()).some((node) => node.props?.label === '다음 시작 페이지'));
let cancelCloses = 0;
mount(StudyItemForm, { childId: 'child', item, onClose: () => cancelCloses++ });
field('공부 이름', 'Discard edit');
click('취소');
assert.equal(cancelCloses, 1);
assert.equal(writes.length, beforeCancel);
console.log(
  'PASS form actions: snapshot/refetch identity, success/cancel close, failure draft, retry, synchronous duplicate/cancel guard, workbook/activity',
);
