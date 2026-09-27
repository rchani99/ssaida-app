import { CircleCheck, Clock3 } from 'lucide-react-native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import { groupTodayTasks } from '@/features/learning/utils/visible-tasks';

import type { LucideIcon } from 'lucide-react-native';

type TodayGroups = ReturnType<typeof groupTodayTasks>;

export function TodaySummaryCard({ groups }: { groups: TodayGroups }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  // Presentation-only projections of the existing grouping/counting rules.
  const remainingToday = groupTodayTasks(
    groups.today.filter((task) => ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status)),
    [],
  );
  const remainingMinutes = remainingToday.todayMinutes + groups.continuingMinutes;
  const total = groups.completed + groups.remaining;
  const progress =
    total > 0 ? Math.min(100, Math.max(0, Math.round((groups.completed / total) * 100))) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            오늘 <Text style={styles.highlight}>{groups.remaining}개</Text> 남았어요
          </Text>
          <Text style={styles.description}>
            <Text style={styles.time}>약 {remainingMinutes}분</Text>
            {' · '}오늘 계획 {groups.todayCount}개 · 이어하기 {groups.continuing.length}개
          </Text>
        </View>
        {/* A future mascot can be added here without reserving empty space. */}
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="오늘 공부 진행률"
        accessibilityValue={{ min: 0, max: 100, now: progress }}
        style={styles.progressRow}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.percent}>{progress}%</Text>
      </View>

      <View style={[styles.stats, stacked && styles.stackedStats]}>
        <SummaryStat icon={CircleCheck} label="완료" value={`${groups.completed}개`} />
        <SummaryStat icon={Clock3} label="계획 시간" value={`${groups.todayMinutes}분`} />
      </View>
    </View>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.iconCircle}>
        <Icon {...dashboardIconProps} color={t.colors.primary} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.description}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.colors.card,
    ...t.border.card,
    borderRadius: t.radius.large,
    padding: t.spacing[20],
    gap: t.spacing[16],
    ...t.shadow,
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[12] },
  heroCopy: { flex: 1, minWidth: 0, gap: t.spacing[4] },
  title: { ...t.typography.metric, color: t.colors.textPrimary, flexShrink: 1 },
  highlight: { color: t.colors.primary },
  time: { ...t.typography.body, fontWeight: '600', color: t.colors.textPrimary },
  description: { ...t.typography.body, color: t.colors.textSecondary, flexShrink: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[12] },
  track: {
    flex: 1,
    height: t.spacing[8],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.divider,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.pill, backgroundColor: t.colors.primary },
  percent: { ...t.typography.chip, color: t.colors.primary, flexShrink: 0 },
  stats: {
    borderTopWidth: t.border.divider.borderBottomWidth,
    borderTopColor: t.colors.divider,
    paddingTop: t.spacing[12],
    flexDirection: 'row',
    gap: t.spacing[16],
  },
  stackedStats: { flexDirection: 'column' },
  stat: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[12],
  },
  iconCircle: {
    padding: t.icon.circlePadding,
    flexShrink: 0,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  statCopy: { flexShrink: 1, minWidth: 0, gap: t.spacing[4] },
  statValue: { ...t.typography.cardTitle, color: t.colors.textPrimary },
});
