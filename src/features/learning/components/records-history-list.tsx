import { StyleSheet, Text, View } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';
import { historyStatus, parentCheckLabel, taskRange } from '@/features/learning/utils/records';
import { ParentCard, StatusChip } from '@/shared/components/parent-ui';

import type { DailyTaskWithPlan } from '@/features/learning/types/learning.types';

export function RecordsHistoryList({
  groups,
  tasks,
  emptyMessage = '아직 지난 학습 기록이 없어요.',
}: {
  groups: { date: string; tasks: DailyTaskWithPlan[] }[];
  tasks: DailyTaskWithPlan[];
  emptyMessage?: string;
}) {
  const superseded = new Set(
    tasks.map((task) => task.source_daily_task_id).filter((id): id is string => Boolean(id)),
  );
  tasks.filter((task) => task.is_superseded).forEach((task) => superseded.add(task.id));
  if (!groups.length)
    return (
      <ParentCard>
        <Text style={styles.empty}>{emptyMessage}</Text>
      </ParentCard>
    );
  return groups.map((group) => (
    <View key={group.date} style={styles.group}>
      <Text style={styles.dateTitle}>{formatDate(group.date)}</Text>
      <ParentCard compact style={styles.card}>
        {group.tasks.map((task, index) => {
          const status = historyStatus(task, superseded);
          return (
            <View key={task.id} style={[styles.task, index > 0 && styles.divider]}>
              <View style={styles.top}>
                <Text style={styles.name}>{task.name_snapshot}</Text>
                <StatusChip label={status.label} tone={status.tone} />
              </View>
              <Text style={styles.body}>{taskRange(task)}</Text>
              <Text style={styles.caption}>{parentCheckLabel(task)}</Text>
            </View>
          );
        })}
      </ParentCard>
    </View>
  ));
}

export function formatRecordPeriod(start: string, end: string) {
  return `${Number(start.slice(5, 7))}.${Number(start.slice(8))} – ${Number(end.slice(5, 7))}.${Number(end.slice(8))}`;
}

function formatDate(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 ${weekdays[value.getUTCDay()]}요일`;
}

const styles = StyleSheet.create({
  empty: { ...t.typography.body, color: t.colors.textSecondary, textAlign: 'center' },
  group: { gap: t.spacing[8] },
  dateTitle: { ...t.typography.cardTitle, color: t.colors.textPrimary },
  card: { gap: 0 },
  task: { paddingVertical: t.spacing[12], gap: t.spacing[4] },
  divider: { borderTopWidth: 1, borderTopColor: t.colors.divider },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing[8],
  },
  name: { ...t.typography.body, color: t.colors.textPrimary, fontWeight: '600', flex: 1 },
  body: { ...t.typography.body, color: t.colors.textSecondary },
  caption: { ...t.typography.caption, color: t.colors.textSecondary },
});
