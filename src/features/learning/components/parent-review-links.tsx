import { useRouter } from 'expo-router';
import { ChevronRight, CircleAlert, Clock, TriangleAlert } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import {
  usePendingConfirmations,
  useReviewTasks,
  useStudyItems,
  useUnresolvedManualTasks,
} from '@/features/learning/hooks/use-learning';
import { progressConflicts } from '@/features/learning/utils/exception-tasks';
import { useToday } from '@/shared/hooks/use-today';

export function ParentReviewLinks({ childId }: { childId: string }) {
  const router = useRouter();
  const pending = usePendingConfirmations(childId);
  const review = useReviewTasks(childId);
  const items = useStudyItems(childId, true);
  const today = useToday();
  const unresolved = useUnresolvedManualTasks(childId, today);
  const count = (pending.data ?? []).filter(
    (task) => !task.excluded_for_today && !task.quantity_conflict,
  ).length;
  const conflicts = progressConflicts(review.data ?? [], items.data ?? []).length;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        확인이 필요한 항목
      </Text>
      <View style={styles.card}>
        {(
          [
            {
              label: '확인 필요',
              tab: 'pending',
              tone: 'pending',
              count,
              loading: pending.isLoading,
              error: pending.isError,
            },
            {
              label: '미완료',
              tab: 'unresolved',
              tone: 'unfinished',
              count: unresolved.data?.length ?? 0,
              loading: unresolved.isLoading,
              error: unresolved.isError,
            },
            {
              label: '진도 충돌',
              tab: 'conflicts',
              tone: 'conflict',
              count: conflicts,
              loading: review.isLoading || items.isLoading,
              error: review.isError || items.isError,
            },
          ] as const
        ).map((entry, index) => (
          <StatusRow
            key={entry.tab}
            label={entry.label}
            value={entry.error ? '조회 실패' : entry.loading ? '불러오는 중' : `${entry.count}개`}
            tone={entry.tone}
            divider={index < 2}
            onPress={() => router.push(`/parent-review?tab=${entry.tab}`)}
          />
        ))}
      </View>
    </View>
  );
}

const statusAppearance = {
  pending: { icon: CircleAlert, color: t.colors.danger, background: t.colors.dangerBackground },
  unfinished: { icon: Clock, color: t.colors.warning, background: t.colors.warningBackground },
  conflict: {
    icon: TriangleAlert,
    color: t.colors.conflict,
    background: t.colors.conflictBackground,
  },
} as const;

function StatusRow({
  label,
  value,
  tone,
  divider,
  onPress,
}: {
  label: string;
  value: string;
  tone: keyof typeof statusAppearance;
  divider: boolean;
  onPress: () => void;
}) {
  const { icon: Icon, color, background } = statusAppearance[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: background }]}>
        <Icon {...dashboardIconProps} color={color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.badge, { backgroundColor: background }]}>
          <Text style={[styles.badgeText, { color }]}>{value}</Text>
        </View>
      </View>
      <ChevronRight {...dashboardIconProps} color={t.colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ParentHomeScreen already supplies the 24-point gap after TodaySummaryCard.
  section: { gap: t.spacing[8] },
  sectionTitle: { ...t.typography.section, color: t.colors.textPrimary },
  card: {
    backgroundColor: t.colors.card,
    ...t.border.card,
    borderRadius: t.radius.normal,
    paddingHorizontal: t.spacing[12],
    ...t.shadow,
  },
  row: {
    minHeight: t.icon.touchMin,
    paddingVertical: t.spacing[4],
    gap: t.spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: { ...t.border.divider, borderBottomColor: t.colors.dividerSoft },
  pressed: { backgroundColor: t.colors.background },
  iconCircle: { padding: t.icon.circlePadding, flexShrink: 0, borderRadius: t.radius.pill },
  rowContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing[8],
  },
  label: { ...t.typography.cardTitle, color: t.colors.textPrimary, flexShrink: 1 },
  badge: {
    maxWidth: '100%',
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[4],
    borderRadius: t.radius.pill,
  },
  badgeText: { ...t.typography.chip },
});
