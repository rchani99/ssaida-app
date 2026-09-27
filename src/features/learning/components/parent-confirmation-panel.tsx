import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';
import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { parentReviewStyles } from '@/features/learning/components/parent-review-styles';
import { QuantityConflictResolution } from '@/features/learning/components/quantity-conflict-resolution';
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

export function ParentConfirmationPanel({
  childId,
  beforeDate,
  section = 'all',
  reviewStyle = false,
}: {
  childId: string;
  beforeDate?: string;
  section?: 'all' | 'pending' | 'conflicts';
  reviewStyle?: boolean;
}) {
  const styles = reviewStyle ? parentReviewStyles : s;
  const pendingQuery = usePendingConfirmations(childId);
  // Deleted originals still validate historical, unverified workbook tasks.
  const itemsQuery = useStudyItems(childId, true);
  const reviewQuery = useReviewTasks(childId);
  const confirm = useConfirmDailyTasks();
  const [drafts, setDrafts] = useState<Record<string, Omit<ConfirmationDraft, 'selected'>>>({});
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = (pendingQuery.data ?? []).filter(
    (task) =>
      !task.excluded_for_today &&
      !task.quantity_conflict &&
      (!beforeDate || task.daily_plans.plan_date < beforeDate),
  );
  const change = (id: string, value: Omit<ConfirmationDraft, 'selected'>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  const submit = (taskId: string) => {
    if (confirm.isPending || submitting.current) return;
    const task = pending.find((entry) => entry.id === taskId);
    if (!task) return;
    setError(null);
    setMessage(null);
    try {
      const input = buildConfirmations([task], drafts, itemsQuery.data ?? []);
      submitting.current = true;
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
        onSettled: () => {
          submitting.current = false;
        },
      });
    } catch (error) {
      submitting.current = false;
      setError(error instanceof Error ? error.message : '완료한 내용을 확인해 주세요.');
    }
  };
  const review = reviewQuery.data ?? [];
  const conflicts = progressConflicts(review, itemsQuery.data ?? []);
  const superseded = new Set(review.map((task) => task.source_daily_task_id));
  const retries = review.filter((task) => task.status === 'RETRY' && !superseded.has(task.id));
  return (
    <View style={[s.panel, styles.panel]}>
      {section !== 'conflicts' && (
        <>
          {(beforeDate || section !== 'pending') && (
            <Text accessibilityRole="header" style={styles.title}>
              {beforeDate ? '지난 공부 확인' : '확인 필요'}
            </Text>
          )}
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
            <Text style={styles.secondary}>지금 확인할 공부가 없어요.</Text>
          ) : (
            <>
              {pending.map((task) => {
                const draft = drafts[task.id];
                const status = draft?.status ?? 'PARENT_CONFIRMED';
                const choices =
                  task.item_type === 'WORKBOOK'
                    ? ([
                        ['PARENT_CONFIRMED', '계획대로'],
                        ['PARTIAL', '조금만'],
                        ['RETRY', '다시'],
                      ] as const)
                    : ([
                        ['PARENT_CONFIRMED', '했어요'],
                        ['RETRY', '다시'],
                      ] as const);
                return (
                  <View key={task.id} style={[s.card, styles.card]}>
                    <Text style={{ ...t.typography.cardTitle, color: t.colors.textPrimary }}>
                      {task.name_snapshot}
                    </Text>
                    <Text style={styles.secondary}>
                      {task.daily_plans.plan_date} ·{' '}
                      {task.item_type === 'WORKBOOK'
                        ? `계획 ${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽`
                        : `약 ${task.planned_minutes}분 활동`}
                    </Text>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel={`${task.name_snapshot} 공부 결과`}
                      style={parentReviewStyles.resultControl}
                    >
                      {choices.map(([value, label]) => (
                        <Pressable
                          key={value}
                          accessibilityRole="radio"
                          accessibilityLabel={`${task.name_snapshot} ${label}`}
                          accessibilityState={{ selected: status === value }}
                          disabled={confirm.isPending}
                          onPress={() => change(task.id, { status: value, page: undefined })}
                          style={[
                            parentReviewStyles.resultOption,
                            status === value && parentReviewStyles.resultSelected,
                          ]}
                        >
                          <Text
                            style={[
                              parentReviewStyles.resultText,
                              status === value && parentReviewStyles.resultSelectedText,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {task.item_type === 'WORKBOOK' && status !== 'RETRY' && (
                      <LearningField
                        label="몇 쪽까지 했나요?"
                        value={
                          draft?.page ?? (status === 'PARTIAL' ? '' : String(task.planned_end_page))
                        }
                        onChangeText={(page) => change(task.id, { page })}
                        numeric
                        disabled={confirm.isPending}
                      />
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${task.name_snapshot} 확인`}
                      disabled={confirm.isPending}
                      onPress={() => submit(task.id)}
                      style={{
                        minHeight: t.icon.touchMin,
                        padding: t.spacing[8],
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: t.colors.primary,
                        borderRadius: t.radius.normal,
                        opacity: confirm.isPending ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ ...t.typography.button, color: t.colors.card }}>확인</Text>
                    </Pressable>
                  </View>
                );
              })}
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
        </>
      )}
      {section !== 'pending' && (
        <>
          {section === 'conflicts' &&
            !reviewQuery.isLoading &&
            !reviewQuery.isError &&
            !itemsQuery.isLoading &&
            !itemsQuery.isError &&
            !conflicts.length && <Text style={styles.secondary}>진도 충돌이 없어요.</Text>}
          {section === 'conflicts' && itemsQuery.isError && (
            <>
              <Text style={s.error}>문제집 정보를 불러오지 못했어요.</Text>
              <LearningButton
                label="문제집 정보 다시 불러오기"
                onPress={() => void itemsQuery.refetch()}
              />
            </>
          )}
          {section === 'conflicts' && reviewQuery.isLoading && <ActivityIndicator />}
          {section === 'conflicts' && message && <Text style={s.success}>{message}</Text>}
          {reviewQuery.isError && (
            <>
              <Text style={s.error}>진도 확인 정보를 불러오지 못했어요.</Text>
              <LearningButton
                label="진도 정보 다시 불러오기"
                onPress={() => void reviewQuery.refetch()}
              />
            </>
          )}
          {section === 'all' &&
            retries.map((task) => (
              <Text key={task.id} style={styles.secondary}>
                {task.name_snapshot} · 다시 해야 해요
              </Text>
            ))}
          {conflicts.map((task) => (
            <View key={task.id} style={[s.card, styles.card]}>
              <Text accessibilityRole="alert" style={s.warning}>
                {task.quantity_conflict
                  ? '진도 변경으로 다시 확인이 필요해요'
                  : '진도 확인이 필요해요'}
              </Text>
              <Text style={s.text}>
                {task.name_snapshot} · {task.daily_plans.plan_date} · {task.planned_start_page}~
                {task.planned_end_page}쪽
              </Text>
              <Text style={styles.secondary}>
                {task.quantity_conflict
                  ? '수정한 분량은 그대로 보관했어요. 진도를 다시 확인하기 전에는 시작할 수 없어요.'
                  : '앞선 공부 확인 결과와 현재 진도가 달라요. 진행 중인 공부는 변경하지 않았어요.'}
              </Text>
              {task.quantity_conflict && (
                <QuantityConflictResolution
                  key={task.id}
                  reviewStyle={reviewStyle}
                  task={task}
                  item={itemsQuery.data?.find((item) => item.id === task.study_item_id)}
                  onResolved={(result) =>
                    setMessage(
                      result.action === 'EXCLUDE'
                        ? '이미 확인된 범위라 오늘 실행 목록에서 제외했어요. 계획 기록은 유지돼요.'
                        : `${result.new_start}~${result.new_end}쪽으로 진도에 맞췄어요.`,
                    )
                  }
                />
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
