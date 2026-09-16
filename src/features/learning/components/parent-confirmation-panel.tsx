import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  useConfirmDailyTasks,
  usePendingConfirmations,
  useReviewTasks,
  useStudyItems,
} from '@/features/learning/hooks/use-learning';
import {
  buildConfirmations,
  needsParentReminder,
  progressConflicts,
} from '@/features/learning/utils/exception-tasks';

import type { ConfirmationDraft } from '@/features/learning/utils/exception-tasks';

export function ParentConfirmationPanel({ childId }: { childId: string }) {
  const pendingQuery = usePendingConfirmations(childId);
  // Deleted originals still validate historical, unverified workbook tasks.
  const itemsQuery = useStudyItems(childId, true);
  const reviewQuery = useReviewTasks(childId);
  const confirm = useConfirmDailyTasks();
  const [drafts, setDrafts] = useState<Record<string, ConfirmationDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = pendingQuery.data ?? [];
  const change = (id: string, value: ConfirmationDraft) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  const submit = () => {
    if (confirm.isPending) return;
    setError(null);
    setMessage(null);
    try {
      const input = buildConfirmations(pending, drafts, itemsQuery.data ?? []);
      confirm.mutate(input, {
        onSuccess: () => {
          setMessage(
            input
              .map((entry) =>
                entry.status === 'PARTIAL'
                  ? `${entry.actualEndPage}쪽까지 한 것으로 기록했어요.`
                  : entry.status === 'RETRY'
                    ? '다시 해야 해요로 기록했어요.'
                    : '완료한 것으로 기록했어요.',
              )
              .join(' '),
          );
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([id]) => !input.some((entry) => entry.dailyTaskId === id),
              ),
            ),
          );
        },
        onError: () => setError('확인 내용을 저장하지 못했어요. 목록을 다시 확인해 주세요.'),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : '완료한 내용을 확인해 주세요.');
    }
  };
  const review = reviewQuery.data ?? [];
  const conflicts = progressConflicts(review, itemsQuery.data ?? []);
  const superseded = new Set(review.map((task) => task.source_daily_task_id));
  const retries = review.filter((task) => task.status === 'RETRY' && !superseded.has(task.id));
  return (
    <View style={s.panel}>
      <Text style={s.title}>부모님 확인</Text>
      {pending.some((task) => needsParentReminder(task)) && (
        <Text style={s.warning}>확인할 공부가 조금 쌓였어요.</Text>
      )}
      {pendingQuery.isLoading ? (
        <ActivityIndicator />
      ) : pendingQuery.isError ? (
        <>
          <Text style={s.error}>확인할 공부를 불러오지 못했어요.</Text>
          <LearningButton
            label="확인 목록 다시 불러오기"
            onPress={() => void pendingQuery.refetch()}
          />
        </>
      ) : !pending.length ? (
        <Text style={s.secondary}>지금 확인할 공부가 없어요.</Text>
      ) : (
        <>
          {pending.map((task) => {
            const draft = drafts[task.id];
            const selected = draft?.selected !== false;
            const status = draft?.status ?? 'PARENT_CONFIRMED';
            const choices =
              task.item_type === 'WORKBOOK'
                ? ([
                    ['PARENT_CONFIRMED', '계획대로 했어요'],
                    ['PARTIAL', '조금만 했어요'],
                    ['RETRY', '다시 해야 해요'],
                  ] as const)
                : ([
                    ['PARENT_CONFIRMED', '했어요'],
                    ['RETRY', '다시 해야 해요'],
                  ] as const);
            return (
              <View key={task.id} style={s.card}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${task.name_snapshot} 확인 선택`}
                  accessibilityState={{ checked: selected }}
                  disabled={confirm.isPending}
                  onPress={() => change(task.id, { selected: !selected })}
                  style={[s.choice, selected && s.selected]}
                >
                  <Text style={s.text}>
                    {selected ? '☑' : '☐'} {task.name_snapshot}
                  </Text>
                </Pressable>
                <Text style={s.secondary}>
                  {task.daily_plans.plan_date} ·{' '}
                  {task.item_type === 'WORKBOOK'
                    ? `계획 ${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽`
                    : `약 ${task.planned_minutes}분 활동`}
                </Text>
                <View style={s.row}>
                  {choices.map(([value, label]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityLabel={`${task.name_snapshot} ${label}`}
                      accessibilityState={{ selected: status === value }}
                      disabled={confirm.isPending || !selected}
                      onPress={() => change(task.id, { status: value, page: undefined })}
                      style={[s.choice, status === value && s.selected]}
                    >
                      <Text style={s.text}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {task.item_type === 'WORKBOOK' && status !== 'RETRY' && (
                  <LearningField
                    label={`${task.name_snapshot} 몇 쪽까지 했나요?`}
                    value={
                      draft?.page ?? (status === 'PARTIAL' ? '' : String(task.planned_end_page))
                    }
                    onChangeText={(page) => change(task.id, { page })}
                    numeric
                    disabled={confirm.isPending || !selected}
                  />
                )}
              </View>
            );
          })}
          <LearningButton
            label="선택한 공부 확인하기"
            disabled={
              confirm.isPending || !pending.some((task) => drafts[task.id]?.selected !== false)
            }
            onPress={submit}
          />
        </>
      )}
      {itemsQuery.isError && (
        <>
          <Text style={s.error}>문제집 정보를 불러오지 못했어요.</Text>
          <LearningButton
            label="문제집 정보 다시 불러오기"
            onPress={() => void itemsQuery.refetch()}
          />
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {message && <Text style={s.success}>{message}</Text>}
      {reviewQuery.isError && (
        <>
          <Text style={s.error}>진도 확인 정보를 불러오지 못했어요.</Text>
          <LearningButton
            label="진도 정보 다시 불러오기"
            onPress={() => void reviewQuery.refetch()}
          />
        </>
      )}
      {retries.map((task) => (
        <Text key={task.id} style={s.secondary}>
          {task.name_snapshot} · 다시 해야 해요
        </Text>
      ))}
      {conflicts.map((task) => (
        <View key={task.id} style={s.card}>
          <Text style={s.warning}>진도 확인이 필요해요</Text>
          <Text style={s.text}>
            {task.name_snapshot} · {task.daily_plans.plan_date} · {task.planned_start_page}~
            {task.planned_end_page}쪽
          </Text>
          <Text style={s.secondary}>
            앞선 공부 확인 결과와 현재 진도가 달라요. 진행 중인 공부는 변경하지 않았어요.
          </Text>
        </View>
      ))}
    </View>
  );
}
