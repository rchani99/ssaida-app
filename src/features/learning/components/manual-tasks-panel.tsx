import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  ParentReviewActions,
  ParentReviewConfirm,
} from '@/features/learning/components/parent-review-actions';
import { parentReviewStyles } from '@/features/learning/components/parent-review-styles';
import {
  useAddManualDailyTask,
  useDailyPlan,
  useDailyTasks,
  useRescheduleManualTask,
  useSkipManualTask,
  useStudyItems,
  useUnresolvedManualTasks,
} from '@/features/learning/hooks/use-learning';
import { useToday } from '@/shared/hooks/use-today';

import type {
  DailyTaskWithPlan,
  ManualTaskInput,
  StudyItem,
} from '@/features/learning/types/learning.types';

export function ManualTasksPanel({
  childId,
  mode = 'all',
  showList = false,
  reviewStyle = false,
}: {
  childId: string;
  mode?: 'all' | 'add' | 'unresolved';
  showList?: boolean;
  reviewStyle?: boolean;
}) {
  const today = useToday();
  const plan = useDailyPlan(childId, today);
  const tasks = useDailyTasks(plan.data?.id);
  const unresolved = useUnresolvedManualTasks(childId, today);
  const add = useAddManualDailyTask();
  const reschedule = useRescheduleManualTask();
  const skip = useSkipManualTask();
  const submitting = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(false);
  const [source, setSource] = useState<'registered' | 'new'>('registered');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const studyItems = useStudyItems(form && mode !== 'unresolved' ? childId : undefined);
  const [itemType, setItemType] = useState<'WORKBOOK' | 'ACTIVITY'>('WORKBOOK');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<ManualTaskInput['subject']>(null);
  const [minutes, setMinutes] = useState('20');
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('5');
  const [action, setAction] = useState<{ task: DailyTaskWithPlan; kind: 'move' | 'skip' } | null>(
    null,
  );
  const [choices, setChoices] = useState<Record<string, 'move' | 'skip'>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showExcess, setShowExcess] = useState(false);
  const busy = add.isPending || reschedule.isPending || skip.isPending;
  const registeredItems = (studyItems.data ?? []).filter(
    (item) => item.child_id === childId && item.status !== 'DELETED' && item.item_type === itemType,
  );
  const selectedItem = registeredItems.find((item) => item.id === selectedItemId);
  const resetFields = () => {
    setSelectedItemId(null);
    setName('');
    setSubject(null);
    setMinutes('20');
    setStart('1');
    setEnd('5');
    setError(null);
  };
  const selectItem = (item: StudyItem) => {
    setSelectedItemId(item.id);
    setName(item.name);
    setSubject(item.subject as ManualTaskInput['subject']);
    setMinutes(String(item.estimated_minutes));
    const nextPage =
      item.workbook_next_start_page_override ?? (item.workbook_last_completed_page ?? 0) + 1;
    // Completed workbooks can be selected again for review, starting at page one.
    const first = nextPage > (item.workbook_last_page ?? 1) ? 1 : nextPage;
    setStart(String(first));
    setEnd(
      String(
        Math.min(first + (item.workbook_pages_per_session ?? 5) - 1, item.workbook_last_page ?? 5),
      ),
    );
    setError(null);
  };
  const excess =
    (tasks.data ?? [])
      .filter((task) => !task.excluded_for_today && task.status !== 'SKIPPED')
      .reduce((sum, task) => sum + task.planned_minutes, 0) -
    (plan.data?.target_minutes_snapshot ?? Infinity);
  const submit = () => {
    if (busy || submitting.current) return;
    setError(null);
    if (source === 'registered' && (!selectedItem || studyItems.isError)) {
      setError('등록한 공부를 선택해 주세요.');
      return;
    }
    if (!name.trim()) {
      setError('공부 이름을 입력해 주세요.');
      return;
    }
    if (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 32767) {
      setError('예상시간은 1~32767분 사이의 정수로 입력해 주세요.');
      return;
    }
    if (
      itemType === 'WORKBOOK' &&
      (!/^\d+$/.test(start) ||
        !/^\d+$/.test(end) ||
        Number(start) < 1 ||
        Number(end) < Number(start) ||
        Number(end) > 2147483647)
    ) {
      setError('시작 쪽과 마지막 쪽을 확인해 주세요.');
      return;
    }
    submitting.current = true;
    add.mutate(
      {
        childId,
        planDate: today,
        itemType,
        name,
        subject,
        minutes: Number(minutes),
        startPage: itemType === 'WORKBOOK' ? Number(start) : null,
        endPage: itemType === 'WORKBOOK' ? Number(end) : null,
      },
      {
        onSuccess: () => {
          setForm(false);
          setSource('registered');
          setSelectedItemId(null);
          setName('');
          setItemType('WORKBOOK');
          setSubject(null);
          setMinutes('20');
          setStart('1');
          setEnd('5');
          setMessage('오늘 할 일을 추가했어요.');
          setShowExcess(true);
        },
        onError: () => setError('공부를 추가하지 못했어요. 잠시 후 다시 시도해 주세요.'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  const perform = (selection = action) => {
    if (!selection || busy || submitting.current) return;
    submitting.current = true;
    setError(null);
    if (selection.kind === 'move')
      reschedule.mutate(
        { taskId: selection.task.id, date: today },
        {
          onSettled: () => {
            submitting.current = false;
          },
          onSuccess: () => {
            setAction(null);
            setMessage('오늘 공부에 추가했어요.');
            setShowExcess(true);
          },
          onError: (error) => {
            setAction(null);
            setError(error instanceof Error ? error.message : '공부를 옮기지 못했어요.');
            void unresolved.refetch();
          },
        },
      );
    else
      skip.mutate(selection.task.id, {
        onSettled: () => {
          submitting.current = false;
        },
        onSuccess: () => {
          setAction(null);
          setMessage('이번 공부는 넘겼어요.');
        },
        onError: () => {
          setAction(null);
          setError('공부를 넘기지 못했어요. 목록을 다시 확인해 주세요.');
          void unresolved.refetch();
        },
      });
  };
  return (
    <View
      style={[
        s.panel,
        mode === 'unresolved' && { borderWidth: 0 },
        reviewStyle && parentReviewStyles.panel,
      ]}
    >
      {mode !== 'unresolved' && (
        <>
          <Text style={reviewStyle ? parentReviewStyles.title : s.title}>오늘 계획</Text>
          {plan.data?.day_type === 'REST' && (
            <Text style={reviewStyle ? parentReviewStyles.secondary : s.secondary}>
              쉬는 날에도 필요한 숙제는 추가할 수 있어요.
            </Text>
          )}
          {plan.isError || tasks.isError ? (
            <>
              <Text style={s.error}>오늘 공부량을 불러오지 못했어요.</Text>
              <LearningButton
                label="오늘 계획 다시 불러오기"
                onPress={() => {
                  void plan.refetch();
                  void tasks.refetch();
                }}
              />
            </>
          ) : (
            plan.data && (
              <Text style={reviewStyle ? parentReviewStyles.secondary : s.secondary}>
                목표 {plan.data.target_minutes_snapshot}분 · 계획{' '}
                {(tasks.data ?? [])
                  .filter((task) => !task.excluded_for_today && task.status !== 'SKIPPED')
                  .reduce((sum, task) => sum + task.planned_minutes, 0)}
                분
              </Text>
            )
          )}
          <LearningButton
            label="+ 오늘 할 일 추가"
            variant={reviewStyle ? 'primary' : 'secondary'}
            disabled={busy}
            onPress={() => {
              setForm(!form);
              setError(null);
            }}
          />
          {form && (
            <View style={[s.card, reviewStyle && parentReviewStyles.card]}>
              <View style={s.row}>
                {(['registered', 'new'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: source === value, disabled: busy }}
                    disabled={busy}
                    onPress={() => {
                      if (source === value) return;
                      setSource(value);
                      resetFields();
                    }}
                    style={[s.choice, source === value && s.selected]}
                  >
                    <Text style={s.text}>
                      {value === 'registered' ? '등록한 공부에서 선택' : '직접 입력'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.row}>
                {(['WORKBOOK', 'ACTIVITY'] as const).map((type) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={`오늘 할 일 ${type === 'WORKBOOK' ? '문제집' : '활동'}`}
                    accessibilityState={{ selected: itemType === type }}
                    key={type}
                    disabled={busy}
                    onPress={() => {
                      if (type === itemType) return;
                      setItemType(type);
                      if (source === 'registered') resetFields();
                      setStart('1');
                      setEnd('5');
                      setError(null);
                    }}
                    style={[s.choice, itemType === type && s.selected]}
                  >
                    <Text style={s.text}>{type === 'WORKBOOK' ? '문제집' : '활동'}</Text>
                  </Pressable>
                ))}
              </View>
              {source === 'registered' && (
                <View style={{ gap: 8 }}>
                  <Text style={s.text}>
                    등록한 {itemType === 'WORKBOOK' ? '문제집' : '활동'}을 선택해 주세요.
                  </Text>
                  {studyItems.isLoading ? (
                    <ActivityIndicator accessibilityLabel="등록한 공부 불러오는 중" />
                  ) : studyItems.isError ? (
                    <>
                      <Text style={s.error}>등록한 공부를 불러오지 못했어요.</Text>
                      <LearningButton
                        label="등록한 공부 다시 불러오기"
                        onPress={() => void studyItems.refetch()}
                      />
                    </>
                  ) : registeredItems.length ? (
                    registeredItems.map((item) => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="radio"
                        accessibilityLabel={`등록한 공부 ${item.name}`}
                        accessibilityState={{
                          selected: selectedItemId === item.id,
                          disabled: busy,
                        }}
                        disabled={busy}
                        onPress={() => selectItem(item)}
                        style={[s.choice, selectedItemId === item.id && s.selected]}
                      >
                        <Text style={s.text}>{item.name}</Text>
                        <Text style={s.secondary}>
                          약 {item.estimated_minutes}분
                          {item.item_type === 'WORKBOOK'
                            ? ` · 한 번에 ${item.workbook_pages_per_session}쪽`
                            : ''}
                          {item.status === 'PAUSED' ? ' · 쉬는 중' : ''}
                          {item.status === 'COMPLETED' ? ' · 완료 (복습)' : ''}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={s.secondary}>
                      등록한 {itemType === 'WORKBOOK' ? '문제집이' : '활동이'} 없어요. 직접 입력으로
                      오늘 할 일을 추가할 수 있어요.
                    </Text>
                  )}
                  {selectedItem && !studyItems.isError && (
                    <Text style={s.secondary}>
                      등록한 정보를 불러왔어요. 오늘 할 분량을 확인해 주세요. 오늘만 할 일로
                      추가돼요.
                      {itemType === 'WORKBOOK' && ' 등록한 문제집의 진도에는 반영되지 않아요.'}
                    </Text>
                  )}
                </View>
              )}
              {(source === 'new' || (selectedItem && !studyItems.isError)) && (
                <>
                  <LearningField
                    label="오늘 할 일 이름"
                    value={name}
                    onChangeText={setName}
                    disabled={busy}
                  />
                  <Text style={reviewStyle ? parentReviewStyles.secondary : s.secondary}>
                    과목 (선택)
                  </Text>
                  <View style={s.row}>
                    {(
                      [
                        [null, '선택 안 함'],
                        ['KOREAN', '국어'],
                        ['MATH', '수학'],
                        ['ENGLISH', '영어'],
                        ['SCIENCE', '과학'],
                        ['SOCIAL', '사회'],
                        ['OTHER', '기타'],
                      ] as const
                    ).map(([code, label]) => (
                      <Pressable
                        key={label}
                        accessibilityRole="radio"
                        accessibilityLabel={`오늘 할 일 과목 ${label}`}
                        accessibilityState={{ selected: subject === code }}
                        disabled={busy}
                        onPress={() => setSubject(code)}
                        style={[s.choice, subject === code && s.selected]}
                      >
                        <Text style={s.text}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <LearningField
                    label="오늘 할 일 예상시간 (분)"
                    value={minutes}
                    onChangeText={setMinutes}
                    numeric
                    disabled={busy}
                  />
                  {itemType === 'WORKBOOK' && (
                    <>
                      <LearningField
                        label="오늘 할 일 시작 쪽"
                        value={start}
                        onChangeText={setStart}
                        numeric
                        disabled={busy}
                      />
                      <LearningField
                        label="오늘 할 일 마지막 쪽"
                        value={end}
                        onChangeText={setEnd}
                        numeric
                        disabled={busy}
                      />
                    </>
                  )}
                  <LearningButton label="오늘 할 일 저장" disabled={busy} onPress={submit} />
                </>
              )}
            </View>
          )}
          {showExcess && excess > 0 && (
            <View style={[s.card, reviewStyle && parentReviewStyles.card]}>
              <Text style={s.warning}>오늘 공부량이 목표보다 약 {excess}분 많아요.</Text>
              <LearningButton label="그대로 하기" onPress={() => setShowExcess(false)} />
            </View>
          )}
        </>
      )}
      {mode !== 'add' && (
        <>
          {unresolved.isLoading ? (
            <ActivityIndicator />
          ) : unresolved.isError ? (
            <>
              <Text style={s.error}>밀린 공부를 불러오지 못했어요.</Text>
              <LearningButton
                label="밀린 공부 다시 불러오기"
                onPress={() => void unresolved.refetch()}
              />
            </>
          ) : showList ? (
            <Text
              accessibilityRole={reviewStyle && unresolved.data?.length ? 'header' : undefined}
              style={
                reviewStyle
                  ? unresolved.data?.length
                    ? parentReviewStyles.title
                    : parentReviewStyles.secondary
                  : s.secondary
              }
            >
              {unresolved.data?.length
                ? `처리할 밀린 공부 ${unresolved.data.length}개`
                : '지금 처리할 밀린 공부가 없어요.'}
            </Text>
          ) : (
            <LearningButton
              label={`밀린 공부 ${unresolved.data?.length ?? 0}개 정리하기`}
              onPress={() => setExpanded(!expanded)}
            />
          )}
          {showList &&
            !unresolved.isLoading &&
            !unresolved.isError &&
            unresolved.data?.length === 0 && (
              <Text style={s.secondary}>{"오늘 해야 할 공부는 '오늘 공부'에서 확인하세요."}</Text>
            )}
          {(showList || expanded) &&
            (unresolved.data ?? []).map((task) => (
              <View key={task.id} style={[s.card, reviewStyle && parentReviewStyles.card]}>
                <Text style={s.text}>{task.name_snapshot}</Text>
                <Text style={reviewStyle ? parentReviewStyles.secondary : s.secondary}>
                  {task.daily_plans.plan_date} ·{' '}
                  {task.item_type === 'WORKBOOK'
                    ? `${task.planned_start_page}~${task.planned_end_page}쪽 · `
                    : ''}
                  {task.planned_minutes}분 ·{' '}
                  {task.status === 'IN_PROGRESS'
                    ? '공부하는 중이에요'
                    : task.status === 'RETRY'
                      ? '다시 해야 해요'
                      : '아직 시작하지 않았어요'}
                </Text>
                {reviewStyle ? (
                  <ParentReviewActions
                    label={`${task.name_snapshot} 처리 방법`}
                    disabled={busy}
                    actions={[
                      {
                        label: '오늘에 추가',
                        selected: (choices[task.id] ?? 'move') === 'move',
                        onPress: () =>
                          setChoices((previous) => ({ ...previous, [task.id]: 'move' })),
                      },
                      {
                        label: '이번에는 넘기기',
                        selected: choices[task.id] === 'skip',
                        onPress: () =>
                          setChoices((previous) => ({ ...previous, [task.id]: 'skip' })),
                      },
                    ]}
                  />
                ) : (
                  <View style={s.row}>
                    <LearningButton
                      label="오늘에 추가"
                      disabled={busy}
                      onPress={() => setAction({ task, kind: 'move' })}
                    />
                    <LearningButton
                      label="이번에는 넘기기"
                      disabled={busy}
                      onPress={() => setAction({ task, kind: 'skip' })}
                    />
                  </View>
                )}
                {reviewStyle && (
                  <ParentReviewConfirm
                    label={`${task.name_snapshot} 확인`}
                    disabled={busy}
                    onPress={() => perform({ task, kind: choices[task.id] ?? 'move' })}
                  />
                )}
                {!reviewStyle && action?.task.id === task.id && (
                  <View
                    style={[s.card, reviewStyle && parentReviewStyles.card]}
                    accessibilityViewIsModal
                  >
                    <Text style={s.text}>{action.task.name_snapshot}</Text>
                    <Text style={s.warning}>
                      {action.task.status === 'IN_PROGRESS' ? '진행 중인 공부예요. ' : ''}
                      {action.kind === 'move' ? '오늘로 옮길까요?' : '이번에는 넘길까요?'}
                    </Text>
                    <View style={s.row}>
                      <LearningButton
                        label="취소"
                        disabled={busy}
                        onPress={() => setAction(null)}
                      />
                      <LearningButton
                        label={action.kind === 'move' ? '오늘로 옮기기 확인' : '넘기기 확인'}
                        disabled={busy}
                        onPress={() => perform()}
                      />
                    </View>
                  </View>
                )}
              </View>
            ))}
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {message && <Text style={s.success}>{message}</Text>}
    </View>
  );
}
