import { useRouter } from 'expo-router';
import { BookOpen, CalendarDays, ChevronRight, Clock3, Leaf } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t } from '@/design-system/tokens';
import {
  useContinuingTasks,
  useCurrentChild,
  useDailyPlan,
  useDailyTasks,
  useEnsureDailyPlan,
  useStartDailyTask,
} from '@/features/learning/hooks/use-learning';
import { prioritizeTodayTasks } from '@/features/learning/utils/exception-tasks';
import { groupTodayTasks } from '@/features/learning/utils/visible-tasks';
import { ScreenMessage } from '@/shared/components/screen-message';
import { useToday } from '@/shared/hooks/use-today';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function ChildTodayScreen() {
  const router = useRouter();
  const startTask = useStartDailyTask();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const today = useToday();
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

  const groups = groupTodayTasks(
    prioritizeTodayTasks(tasksQuery.data ?? []),
    continuingQuery.data ?? [],
  );

  const firstTask = [...groups.continuing, ...groups.today].find(canOpenTask);
  const handleOpen = (task: DailyTask) => {
    if (!canOpenTask(task) || startTask.isPending) return;
    setOpeningId(task.id);
    const onOpen = () => router.push({ pathname: '/study/[taskId]', params: { taskId: task.id } });
    if (task.status === 'PLANNED' || task.status === 'RETRY') {
      startTask.mutate(task.id, { onSuccess: onOpen });
    } else {
      onOpen();
    }
  };
  const renderTask = (task: DailyTask) => (
    <TaskCard
      key={task.id}
      task={task}
      onOpen={() => handleOpen(task)}
      disabled={startTask.isPending}
      pending={startTask.isPending && openingId === task.id}
      error={startTask.isError && openingId === task.id}
    />
  );
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCaption}>{childQuery.data.name}의 오늘</Text>
          <View style={styles.summaryRow}>
            <CalendarDays {...dashboardIconProps} color={t.colors.primary} />
            <Text accessibilityRole="header" style={styles.summaryTitle}>
              오늘 {groups.todayCount}개 · 약 {groups.todayMinutes}분
            </Text>
          </View>
          <Text style={styles.summaryCaption}>목표 {planQuery.data.target_minutes_snapshot}분</Text>
        </View>
        <View
          style={[
            styles.list,
            groups.today.length === 0 && groups.continuing.length === 0 && styles.emptyList,
          ]}
        >
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            오늘의 공부
          </Text>
          {groups.continuing.length > 0 && (
            <Text style={styles.groupLabel}>
              이어하기 {groups.continuing.length}개 · 약 {groups.continuingMinutes}분
            </Text>
          )}
          {groups.continuing.map(renderTask)}
          {groups.continuing.length > 0 && groups.today.length > 0 && (
            <Text style={styles.groupLabel}>오늘 공부 {groups.todayCount}개</Text>
          )}
          {groups.today.map(renderTask)}
          {groups.today.length === 0 && (
            <View style={groups.continuing.length === 0 ? styles.emptyCenter : undefined}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Leaf {...dashboardIconProps} size={t.icon.size.large} color={t.colors.primary} />
                </View>
                <Text accessibilityRole="header" style={styles.emptyTitle}>
                  {planQuery.data.day_type === 'REST'
                    ? '오늘은 쉬는 날이에요'
                    : '오늘 계획된 공부가 없어요.'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {planQuery.data.day_type === 'REST'
                    ? '오늘 계획된 공부가 없어요.'
                    : '부모님과 공부를 먼저 등록해 주세요.'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      {firstTask && (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${firstTask.name_snapshot} ${actionLabel(firstTask)}`}
            accessibilityState={{ disabled: startTask.isPending, busy: startTask.isPending }}
            disabled={startTask.isPending}
            onPress={() => handleOpen(firstTask)}
            style={[styles.taskButton, startTask.isPending && styles.disabled]}
          >
            {startTask.isPending ? (
              <ActivityIndicator color={t.colors.card} />
            ) : (
              <>
                <Text style={styles.taskButtonText}>{actionLabel(firstTask)}</Text>
                <ChevronRight {...dashboardIconProps} color={t.colors.card} />
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
function canOpenTask(task: DailyTask) {
  return (
    !task.excluded_for_today &&
    !task.quantity_conflict &&
    ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status)
  );
}
function actionLabel(task: DailyTask) {
  return task.status === 'RETRY'
    ? '다시 하기'
    : task.status === 'IN_PROGRESS'
      ? '공부 계속하기'
      : '공부 시작';
}
function TaskCard({
  task,
  onOpen,
  disabled,
  pending,
  error,
}: {
  task: DailyTask;
  onOpen: () => void;
  disabled: boolean;
  pending: boolean;
  error: boolean;
}) {
  const isWaiting = task.status === 'CHILD_COMPLETED';
  const isDone = ['PARENT_CONFIRMED', 'PARTIAL'].includes(task.status);
  const canOpen = canOpenTask(task);
  const Icon = task.item_type === 'WORKBOOK' ? BookOpen : Clock3;
  const status = task.quantity_conflict
    ? '진도가 바뀌었어요. 부모님과 다시 확인해 주세요.'
    : isWaiting
      ? '부모님 확인을 기다리고 있어요'
      : isDone
        ? '오늘 공부를 마쳤어요'
        : task.status === 'IN_PROGRESS'
          ? '공부하는 중이에요'
          : task.status === 'RETRY'
            ? '다시 해볼까요?'
            : '시작할 준비가 됐어요';
  return (
    <Pressable
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={`${task.name_snapshot}, ${task.item_type === 'WORKBOOK' ? `${task.planned_start_page}쪽부터 ${task.planned_end_page}쪽, ` : ''}약 ${task.planned_minutes}분, ${status}${canOpen ? `, ${actionLabel(task)}` : ''}`}
      accessibilityState={canOpen ? { disabled, busy: pending } : undefined}
      disabled={!canOpen || disabled}
      onPress={onOpen}
      style={styles.card}
    >
      <View style={styles.cardRow}>
        <View style={styles.iconBox}>
          <Icon {...dashboardIconProps} color={t.colors.primary} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.taskName}>{task.name_snapshot}</Text>
          <Text style={styles.taskDetail}>
            {task.item_type === 'WORKBOOK'
              ? `${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽 · 약 ${task.planned_minutes}분`
              : `약 ${task.planned_minutes}분`}
          </Text>
          <Text style={styles.statusText}>{status}</Text>
        </View>
        {pending ? (
          <ActivityIndicator color={t.colors.primary} />
        ) : (
          canOpen && <ChevronRight {...dashboardIconProps} color={t.colors.textSecondary} />
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          공부를 시작하지 못했어요.
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colors.background },
  container: {
    flexGrow: 1,
    gap: t.spacing[16],
    padding: t.layout.screenPadding,
    paddingTop: t.spacing[12],
    paddingBottom: t.spacing[12],
  },
  summaryCard: {
    gap: t.spacing[4],
    paddingHorizontal: t.spacing[16],
    paddingVertical: t.spacing[12],
    ...t.border.card,
    borderRadius: t.radius.large,
    backgroundColor: t.colors.card,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[8] },
  summaryTitle: { ...t.typography.section, color: t.colors.primary, flex: 1 },
  summary: { ...t.typography.body, color: t.colors.textSecondary, flexShrink: 1 },
  summaryCaption: { ...t.typography.caption, color: t.colors.textSecondary, flexShrink: 1 },
  sectionTitle: { ...t.typography.section, color: t.colors.textPrimary },
  groupLabel: {
    ...t.typography.caption,
    color: t.colors.textSecondary,
    paddingHorizontal: t.spacing[4],
  },
  list: { gap: t.spacing[8], minWidth: 0 },
  card: {
    gap: t.spacing[8],
    padding: t.spacing[12],
    ...t.border.card,
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.card,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[12] },
  iconBox: {
    padding: t.spacing[12],
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.background,
  },
  cardCopy: { flex: 1, minWidth: 0, gap: t.spacing[4] },
  taskName: { ...t.typography.cardTitle, color: t.colors.textPrimary },
  taskDetail: { ...t.typography.body, color: t.colors.textSecondary },
  statusText: { ...t.typography.caption, color: '#58745F' },
  emptyList: { flexGrow: 1 },
  emptyCenter: { flexGrow: 1, justifyContent: 'center', paddingVertical: t.spacing[24] },
  emptyCard: {
    padding: t.spacing[24],
    gap: t.spacing[8],
    alignItems: 'center',
    ...t.border.card,
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.card,
  },
  emptyIcon: {
    padding: t.spacing[16],
    marginBottom: t.spacing[4],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  emptyTitle: { ...t.typography.cardTitle, color: t.colors.textPrimary, textAlign: 'center' },
  emptyDescription: { ...t.typography.body, color: t.colors.textSecondary, textAlign: 'center' },
  footer: {
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing[12],
    paddingBottom: t.spacing[16],
    backgroundColor: t.colors.background,
  },
  taskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[12],
    minHeight: t.icon.touchMin,
    padding: t.spacing[12],
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.primary,
  },
  taskButtonText: {
    ...t.typography.button,
    color: t.colors.card,
    textAlign: 'center',
    flexShrink: 1,
  },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: 13 },
});
