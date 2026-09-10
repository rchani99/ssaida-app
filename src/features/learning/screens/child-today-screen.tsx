import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import {
  useContinuingTasks,
  useCurrentChild,
  useDailyPlan,
  useDailyTasks,
  useEnsureDailyPlan,
  useStartDailyTask,
} from '@/features/learning/hooks/use-learning';
import { prioritizeTodayTasks } from '@/features/learning/utils/exception-tasks';
import { mergeVisibleTasks } from '@/features/learning/utils/visible-tasks';
import { ScreenMessage } from '@/shared/components/screen-message';
import { toLocalDateString } from '@/shared/utils/date';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function ChildTodayScreen() {
  const router = useRouter();
  const today = toLocalDateString();
  const childQuery = useCurrentChild();
  const childId = childQuery.data?.id;
  const ensurePlan = useEnsureDailyPlan();
  const { mutate: ensure } = ensurePlan;
  const [retryAttempt, setRetryAttempt] = useState(0);
  const planQuery = useDailyPlan(childId, today);
  const tasksQuery = useDailyTasks(planQuery.data?.id);
  const continuingQuery = useContinuingTasks(childId, today);
  const ensureKey = useRef<string | null>(null);

  useEffect(() => {
    const key = `${childId}:${today}:${retryAttempt}`;
    if (!childId || ensureKey.current === key) return;
    ensureKey.current = key;
    ensure({ childId, date: today });
  }, [childId, ensure, retryAttempt, today]);

  const retry = () => {
    if (childQuery.isError) void childQuery.refetch();
    setRetryAttempt((current) => current + 1);
  };

  if (childQuery.isLoading || ensurePlan.isPending || planQuery.isLoading) {
    return <ScreenMessage loading message="오늘 공부를 준비하고 있어요." />;
  }
  if (childQuery.isError || ensurePlan.isError || planQuery.isError) {
    return (
      <ScreenMessage
        actionLabel="다시 시도"
        message="오늘 공부를 불러오지 못했어요."
        onAction={retry}
      />
    );
  }
  if (!childQuery.data) {
    return <ScreenMessage message="아이 정보를 찾지 못했어요." />;
  }
  if (!planQuery.data) {
    return <ScreenMessage loading message="오늘 계획을 만들고 있어요." />;
  }
  if (tasksQuery.isLoading || continuingQuery.isLoading) {
    return <ScreenMessage loading message="공부 목록을 불러오고 있어요." />;
  }
  if (tasksQuery.isError || continuingQuery.isError) {
    return (
      <ScreenMessage
        actionLabel="다시 불러오기"
        message="공부 목록을 불러오지 못했어요."
        onAction={() => {
          void tasksQuery.refetch();
          void continuingQuery.refetch();
        }}
      />
    );
  }

  const tasks = mergeVisibleTasks<DailyTask>(
    continuingQuery.data ?? [],
    prioritizeTodayTasks(tasksQuery.data ?? []),
  );
  const totalMinutes = tasks.reduce((sum, task) => sum + task.planned_minutes, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{childQuery.data.name}의 오늘</Text>
        <Text style={styles.summary}>
          {tasks.length}개 · 약 {totalMinutes}분 / 목표 {planQuery.data.target_minutes_snapshot}분
        </Text>
      </View>

      {tasks.length === 0 ? (
        <ScreenMessage
          message={
            planQuery.data.day_type === 'REST'
              ? '오늘은 쉬는 날 🌿'
              : '오늘 예정된 공부가 없어요. 부모님과 공부를 먼저 등록해 주세요.'
          }
        />
      ) : (
        <View style={styles.list}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              onOpen={() =>
                router.push({ pathname: '/study/[taskId]', params: { taskId: task.id } })
              }
              task={task}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function TaskCard({ task, onOpen }: { task: DailyTask; onOpen: () => void }) {
  const startTask = useStartDailyTask();
  const isWaiting = task.status === 'CHILD_COMPLETED';
  const isDone = ['PARENT_CONFIRMED', 'PARTIAL'].includes(task.status);
  const canOpen = ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status);

  const handleOpen = () => {
    if (task.status === 'PLANNED' || task.status === 'RETRY') {
      startTask.mutate(task.id, { onSuccess: onOpen });
    } else {
      onOpen();
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardCopy}>
        <Text style={styles.taskName}>{task.name_snapshot}</Text>
        <Text style={styles.taskDetail}>
          {task.item_type === 'WORKBOOK'
            ? `${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽 · 약 ${task.planned_minutes}분`
            : `약 ${task.planned_minutes}분`}
        </Text>
        <Text style={styles.statusText}>
          {isWaiting
            ? '부모님 확인을 기다리고 있어요'
            : isDone
              ? '오늘 공부를 마쳤어요'
              : task.status === 'IN_PROGRESS'
                ? '공부하는 중이에요'
                : task.status === 'RETRY'
                  ? '다시 해볼까요?'
                  : '시작할 준비가 됐어요'}
        </Text>
      </View>
      {canOpen && (
        <Pressable
          accessibilityRole="button"
          disabled={startTask.isPending}
          onPress={handleOpen}
          style={styles.taskButton}
        >
          {startTask.isPending ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.taskButtonText}>
              {task.status === 'RETRY'
                ? '다시 하기'
                : task.status === 'IN_PROGRESS'
                  ? '공부 계속하기'
                  : '공부 시작'}
            </Text>
          )}
        </Pressable>
      )}
      {startTask.isError && <Text style={styles.error}>공부를 시작하지 못했어요.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  header: { gap: spacing.xs, paddingTop: spacing.sm },
  greeting: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  summary: { color: colors.textSecondary, fontSize: 15 },
  list: { gap: spacing.md },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  cardCopy: { gap: spacing.xs },
  taskName: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  taskDetail: { color: colors.textSecondary, fontSize: 14 },
  statusText: { color: colors.primaryDark, fontSize: 13, fontWeight: '600' },
  taskButton: {
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  taskButtonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  error: { color: colors.error, fontSize: 13 },
});
