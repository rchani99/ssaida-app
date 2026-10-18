import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';
import { CompletionReward } from '@/features/learning/components/completion-reward';
import { LearningButton } from '@/features/learning/components/learning-controls';
import {
  useContinuingTasks,
  useCurrentChild,
  useDailyPlan,
  useDailyTasks,
  useStartDailyTask,
} from '@/features/learning/hooks/use-learning';
import { nextStudyTask } from '@/features/learning/utils/next-study';
import { useToday } from '@/shared/hooks/use-today';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function StudyCompletionActions({
  taskId,
  celebrate,
  status,
}: {
  taskId: string;
  celebrate: boolean;
  status: DailyTask['status'];
}) {
  const router = useRouter();
  const today = useToday();
  const child = useCurrentChild();
  const plan = useDailyPlan(child.data?.id, today);
  const tasks = useDailyTasks(plan.data?.id);
  const continuing = useContinuingTasks(child.data?.id, today);
  const start = useStartDailyTask();
  const opening = useRef(false);
  const queries = [child, plan, tasks, continuing];
  const failed = queries.some((query) => query.isError) || (!child.isLoading && !child.data);
  const loading = queries.some((query) => query.isLoading || query.isFetching);
  const next =
    !failed && !loading
      ? nextStudyTask(tasks.data ?? [], continuing.data ?? [], taskId)
      : undefined;
  const needsReview = tasks.data?.some(
    (task) => !task.excluded_for_today && task.status !== 'SKIPPED' && task.quantity_conflict,
  );
  const celebrateToday =
    celebrate &&
    tasks.data?.some((task) => task.id === taskId && task.status === 'CHILD_COMPLETED');

  const openNext = () => {
    if (!next || opening.current || start.isPending) return;
    if (!child.data?.selected_collection_theme_code) {
      router.replace('/choose-theme');
      return;
    }
    opening.current = true;
    const navigate = () =>
      router.replace({ pathname: '/study/[taskId]', params: { taskId: next.id } });
    if (next.status === 'IN_PROGRESS') {
      navigate();
    } else {
      start.mutate(next.id, {
        onSuccess: navigate,
        onSettled: () => {
          opening.current = false;
        },
      });
    }
  };

  return (
    <View style={styles.container}>
      {(next || !celebrateToday || failed || loading || needsReview) && (
        <View style={styles.waiting}>
          <Text style={styles.waitingTitle}>
            {status === 'SKIPPED' ? '이번 공부는 넘겼어요' : '참 잘했어요!'}
          </Text>
          <Text style={styles.copy}>
            {status === 'CHILD_COMPLETED'
              ? '부모님 확인을 기다리고 있어요.'
              : status === 'SKIPPED'
                ? '오늘 공부에서 다음 할 일을 확인해 주세요.'
                : '부모님이 공부를 확인했어요.'}
          </Text>
        </View>
      )}
      {failed ? (
        <>
          <Text style={styles.copy}>다음 공부를 불러오지 못했어요.</Text>
          <LearningButton
            label="다시 불러오기"
            onPress={() => {
              for (const query of queries) void query.refetch();
            }}
          />
        </>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.copy}>다음 공부를 확인하고 있어요.</Text>
        </View>
      ) : next ? (
        <>
          <Text style={styles.copy}>다음 공부</Text>
          <Text style={styles.name}>{next.name_snapshot}</Text>
          <Text style={styles.copy}>
            {next.item_type === 'WORKBOOK'
              ? `${next.planned_start_page}쪽 ~ ${next.planned_end_page}쪽 · 약 ${next.planned_minutes}분`
              : `약 ${next.planned_minutes}분`}
          </Text>
          <LearningButton
            label={
              start.isPending
                ? '시작하고 있어요…'
                : next.status === 'IN_PROGRESS'
                  ? '다음 공부 이어하기'
                  : '다음 공부 시작'
            }
            variant="primary"
            disabled={start.isPending}
            onPress={openNext}
          />
        </>
      ) : (
        <>
          {needsReview ? (
            <Text style={styles.copy}>
              부모님과 확인할 공부가 있어요. 공부 목록에서 확인해 주세요.
            </Text>
          ) : celebrateToday ? (
            <CompletionReward taskId={taskId} />
          ) : (
            <Text style={styles.copy}>지금 이어서 할 공부가 없어요. 컬렉션을 확인해 볼까요?</Text>
          )}
          <LearningButton
            label="내 컬렉션 보기"
            variant="primary"
            onPress={() => router.replace('/child/garden')}
          />
        </>
      )}
      {start.isError && (
        <Text accessibilityRole="alert" style={styles.error}>
          다음 공부를 시작하지 못했어요. 다시 시도해 주세요.
        </Text>
      )}
      <LearningButton
        label="공부 목록 보기"
        variant="outline"
        disabled={start.isPending}
        onPress={() => router.replace('/child/today')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  waiting: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.primaryLight,
  },
  waitingTitle: { color: colors.primaryDark, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  loading: { gap: spacing.sm, alignItems: 'center' },
  name: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  copy: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
});
