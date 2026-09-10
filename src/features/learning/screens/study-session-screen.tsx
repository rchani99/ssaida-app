import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import {
  useCompleteDailyTask,
  useDailyTask,
  useStartDailyTask,
} from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export function StudySessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId: string | string[] }>();
  const taskId = Array.isArray(params.taskId) ? params.taskId[0] : params.taskId;
  const taskQuery = useDailyTask(taskId);
  const startTask = useStartDailyTask();
  const completeTask = useCompleteDailyTask();

  if (taskQuery.isLoading) return <ScreenMessage loading message="공부를 준비하고 있어요." />;
  if (taskQuery.isError || !taskQuery.data) {
    return (
      <ScreenMessage
        actionLabel="돌아가기"
        message="공부 정보를 찾지 못했어요."
        onAction={() => router.back()}
      />
    );
  }

  const task = taskQuery.data;
  if (task.isSuperseded)
    return (
      <ScreenMessage
        message="다른 날짜로 옮긴 공부예요. 오늘 공부에서 확인해 주세요."
        actionLabel="오늘 공부로"
        onAction={() => router.replace('/child/today')}
      />
    );
  const isCompleted = ['CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL', 'SKIPPED'].includes(
    task.status,
  );
  const canStart = task.status === 'PLANNED' || task.status === 'RETRY';
  const canComplete = task.status === 'IN_PROGRESS';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '공부하기' }} />
      <View style={styles.container}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{task.item_type === 'WORKBOOK' ? '문제집' : '활동'}</Text>
          <Text style={styles.title}>{task.name_snapshot}</Text>
          <Text style={styles.detail}>
            {task.item_type === 'WORKBOOK'
              ? `${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽`
              : `약 ${task.planned_minutes}분`}
          </Text>
          {task.item_type === 'WORKBOOK' && (
            <Text style={styles.minutes}>예상시간 약 {task.planned_minutes}분</Text>
          )}
        </View>

        {isCompleted ? (
          <View style={styles.waiting}>
            <Text style={styles.waitingTitle}>
              {task.status === 'SKIPPED' ? '이번 공부는 넘겼어요' : '참 잘했어요!'}
            </Text>
            <Text style={styles.waitingText}>
              {task.status === 'CHILD_COMPLETED'
                ? '부모님 확인을 기다리고 있어요.'
                : task.status === 'SKIPPED'
                  ? '오늘 공부에서 다음 할 일을 확인해 주세요.'
                  : '부모님이 공부를 확인했어요.'}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={startTask.isPending || completeTask.isPending || (!canStart && !canComplete)}
            onPress={() => {
              if (canStart) startTask.mutate(task.id);
              if (canComplete) completeTask.mutate(task.id);
            }}
            style={styles.primaryButton}
          >
            {startTask.isPending || completeTask.isPending ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {task.status === 'RETRY' ? '다시 하기' : canStart ? '공부 시작' : '완료'}
              </Text>
            )}
          </Pressable>
        )}
        {(startTask.isError || completeTask.isError) && (
          <Text style={styles.error}>처리하지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'space-between', gap: spacing.xl, padding: spacing.lg },
  copy: { alignItems: 'center', gap: spacing.md, paddingTop: 72 },
  eyebrow: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  detail: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  minutes: { color: colors.textSecondary, fontSize: 15 },
  waiting: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.primaryLight,
  },
  waitingTitle: { color: colors.primaryDark, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  waitingText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  primaryButton: {
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.card, fontSize: 17, fontWeight: '800' },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
});
