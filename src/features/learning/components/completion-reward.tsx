import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';
import { StudyCelebrationArt } from '@/features/learning/components/study-celebration-art';
import {
  useCurrentChild,
  useDailyPlan,
  useDailyTasks,
} from '@/features/learning/hooks/use-learning';
import { completionReward } from '@/features/learning/utils/completion-reward';
import { useToday } from '@/shared/hooks/use-today';

function Celebration({ potentialPoints }: { potentialPoints: number }) {
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <StudyCelebrationArt />
      <Text style={styles.title}>오늘 할 공부를 마쳤어요!</Text>
      <Text style={styles.copy}>부모님 확인을 기다려요.</Text>
      <Text style={styles.points}>부모님이 확인하면 최대 +{potentialPoints} 성장해요</Text>
      <Text style={styles.copy}>아직 확정 전이에요. 확인 결과에 따라 달라질 수 있어요.</Text>
    </View>
  );
}

export function CompletionReward({ taskId }: { taskId: string }) {
  const today = useToday();
  const child = useCurrentChild();
  const plan = useDailyPlan(child.data?.id, today);
  const tasks = useDailyTasks(plan.data?.id);
  // Never celebrate from an old cache or a failed read. Reloading the screen
  // doesn't mount this component: the successful completion event is ephemeral.
  if (
    child.isFetching ||
    plan.isFetching ||
    tasks.isFetching ||
    child.isError ||
    plan.isError ||
    tasks.isError ||
    !tasks.data
  )
    return null;
  const reward = completionReward(tasks.data, taskId);
  return reward ? <Celebration potentialPoints={reward.potentialPoints} /> : null;
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.primaryLight,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.primaryDark, textAlign: 'center' },
  copy: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  points: { fontSize: 18, fontWeight: '700', color: colors.primaryDark, textAlign: 'center' },
});
