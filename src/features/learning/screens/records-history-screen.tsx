import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dashboardTokens as t } from '@/design-system/tokens';
import { RecordsHistoryList } from '@/features/learning/components/records-history-list';
import { useCurrentChild, useReviewTasks } from '@/features/learning/hooks/use-learning';
import { useSeoulToday } from '@/features/learning/hooks/use-seoul-today';
import { groupHistory } from '@/features/learning/utils/records';
import { ScreenMessage } from '@/shared/components/screen-message';

export function RecordsHistoryScreen() {
  const today = useSeoulToday();
  const child = useCurrentChild();
  const records = useReviewTasks(child.data?.id);
  if (child.isLoading || (child.data && records.isLoading))
    return <ScreenMessage loading message="학습 기록을 불러오고 있어요." />;
  if (child.isError || !child.data || records.isError)
    return (
      <ScreenMessage
        actionLabel="다시 불러오기"
        message="학습 기록을 불러오지 못했어요."
        onAction={() => void (child.isError ? child.refetch() : records.refetch())}
      />
    );
  const tasks = records.data ?? [];
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <RecordsHistoryList groups={groupHistory(tasks, today)} tasks={tasks} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: t.colors.background },
  container: {
    flexGrow: 1,
    padding: t.layout.screenPadding,
    gap: t.spacing[16],
    backgroundColor: t.colors.background,
  },
});
