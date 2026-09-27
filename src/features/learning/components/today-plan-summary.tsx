import { useFocusEffect } from 'expo-router';
import { BookOpenCheck, ClipboardList, Clock3 } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens, parentTokens as t } from '@/design-system/tokens';
import { LearningButton } from '@/features/learning/components/learning-controls';
import { TodaySummaryCard } from '@/features/learning/components/today-summary-card';
import {
  useContinuingTasks,
  useDailyPlan,
  useDailyTasks,
} from '@/features/learning/hooks/use-learning';
import { useSeoulToday } from '@/features/learning/hooks/use-seoul-today';
import { groupTodayTasks } from '@/features/learning/utils/visible-tasks';
import { StatusChip } from '@/shared/components/parent-ui';

export function TodayPlanSummary({
  childId,
  mode = 'list',
}: {
  childId: string;
  mode?: 'list' | 'status';
}) {
  const today = useSeoulToday();
  const s = {
    secondary:
      mode === 'list'
        ? styles.description
        : { ...t.typography.caption, color: t.colors.textSecondary },
  };
  const plan = useDailyPlan(childId, today);
  const tasks = useDailyTasks(plan.data?.id);
  const continuingQuery = useContinuingTasks(childId, today);
  const { refetch: refetchContinuing } = continuingQuery;
  const { refetch: refetchPlan } = plan;
  const { refetch: refetchTasks } = tasks;
  const planId = plan.data?.id;
  useFocusEffect(
    useCallback(() => {
      // The tab stays mounted behind the processing screen. On return, reconcile
      // its cached snapshots with additions/reschedules, even within staleTime.
      // Both summary instances share queries; only the status instance refreshes.
      if (mode !== 'status') return;
      void refetchPlan();
      if (planId) void refetchTasks();
      void refetchContinuing();
    }, [mode, planId, refetchPlan, refetchTasks, refetchContinuing]),
  );
  const groups = groupTodayTasks(tasks.data ?? [], continuingQuery.data ?? []);
  const rows = groups.today;
  const statuses: Record<string, string> = {
    PLANNED: '시작 전',
    IN_PROGRESS: '공부 중',
    CHILD_COMPLETED: '부모 확인 대기',
    PARENT_CONFIRMED: '확인 완료',
    PARTIAL: '부분 완료',
    RETRY: '다시 하기',
  };
  return (
    <View style={styles.section}>
      {mode === 'list' && (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          오늘 학습 계획
        </Text>
      )}
      {plan.isLoading || tasks.isLoading || continuingQuery.isLoading ? (
        <Text>계획을 불러오고 있어요.</Text>
      ) : plan.isError || tasks.isError || continuingQuery.isError ? (
        <LearningButton
          label="오늘 계획 다시 불러오기"
          onPress={() => {
            void plan.refetch();
            void tasks.refetch();
            void continuingQuery.refetch();
          }}
        />
      ) : (
        <>
          {!plan.data && <Text style={s.secondary}>아직 오늘 계획이 없어요.</Text>}
          {mode === 'status' && <TodaySummaryCard groups={groups} />}
          {plan.data?.day_type === 'REST' && <Text style={s.secondary}>정기 휴식일이에요.</Text>}
          {!rows.length && <Text style={s.secondary}>오늘 계획된 공부가 없어요.</Text>}
          {mode === 'list' && rows.length > 0 && (
            <View style={styles.listCard}>
              {rows.map((task, index) => (
                <View key={task.id} style={[styles.row, index < rows.length - 1 && styles.divider]}>
                  <StudyTypeIcon itemType={task.item_type} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.inlineCopy}>
                      <Text style={styles.studyTitle}>{task.name_snapshot}</Text>
                      <Text style={styles.description}>
                        {' · '}
                        {task.item_type === 'WORKBOOK'
                          ? `${task.planned_start_page}~${task.planned_end_page}쪽`
                          : `약 ${task.planned_minutes}분`}
                      </Text>
                    </Text>
                    <View style={styles.statusSlot}>
                      <StatusChip
                        label={task.quantity_conflict ? '진도 확인 필요' : statuses[task.status]}
                        tone={
                          task.quantity_conflict
                            ? 'conflict'
                            : task.status === 'CHILD_COMPLETED'
                              ? 'pending'
                              : task.status === 'RETRY' || task.status === 'PARTIAL'
                                ? 'unfinished'
                                : task.status === 'PARENT_CONFIRMED' ||
                                    task.status === 'IN_PROGRESS'
                                  ? 'success'
                                  : 'neutral'
                        }
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// Only item type selects the decorative icon; names never drive behavior.
function StudyTypeIcon({ itemType }: { itemType: string }) {
  const Icon =
    itemType === 'WORKBOOK' ? BookOpenCheck : itemType === 'ACTIVITY' ? Clock3 : ClipboardList;
  return (
    <View style={styles.iconCircle}>
      <Icon {...dashboardIconProps} color={dashboardTokens.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: dashboardTokens.spacing[8] },
  sectionTitle: {
    ...dashboardTokens.typography.section,
    color: dashboardTokens.colors.textPrimary,
  },
  listCard: {
    backgroundColor: dashboardTokens.colors.card,
    ...dashboardTokens.border.card,
    borderRadius: dashboardTokens.radius.normal,
    paddingHorizontal: dashboardTokens.spacing[12],
    ...dashboardTokens.shadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: dashboardTokens.spacing[12],
    gap: dashboardTokens.spacing[12],
  },
  divider: { ...dashboardTokens.border.divider },
  iconCircle: {
    padding: dashboardTokens.icon.circlePadding,
    flexShrink: 0,
    borderRadius: dashboardTokens.radius.pill,
    backgroundColor: dashboardTokens.colors.background,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardTokens.spacing[8],
  },
  inlineCopy: { flex: 1, minWidth: 0, ...dashboardTokens.typography.body },
  statusSlot: {
    flexShrink: 0,
    maxWidth: '48%',
    marginRight: dashboardTokens.spacing[8],
  },
  studyTitle: {
    ...dashboardTokens.typography.cardTitle,
    color: dashboardTokens.colors.textPrimary,
    flexShrink: 1,
  },
  description: { ...dashboardTokens.typography.body, color: dashboardTokens.colors.textSecondary },
});
