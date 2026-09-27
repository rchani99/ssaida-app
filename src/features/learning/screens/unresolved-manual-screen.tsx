import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/design-system/tokens';
import { ManualTasksPanel } from '@/features/learning/components/manual-tasks-panel';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export function UnresolvedManualScreen() {
  const child = useCurrentChild();
  if (child.isLoading) return <ScreenMessage loading message="가족 정보를 불러오고 있어요." />;
  if (child.isError || !child.data)
    return (
      <ScreenMessage
        message="가족 정보를 불러오지 못했어요."
        actionLabel="다시 불러오기"
        onAction={() => void child.refetch()}
      />
    );
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <ManualTasksPanel key={child.data.id} childId={child.data.id} mode="unresolved" showList />
      </ScrollView>
    </SafeAreaView>
  );
}
