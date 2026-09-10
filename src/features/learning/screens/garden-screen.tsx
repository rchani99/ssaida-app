import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/design-system/tokens';
import { CollectionPanel } from '@/features/learning/components/collection-panel';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export function GardenScreen() {
  const childQuery = useCurrentChild();
  if (childQuery.isLoading) return <ScreenMessage loading message="정원을 불러오고 있어요." />;
  if (childQuery.isError || !childQuery.data) {
    return (
      <ScreenMessage
        actionLabel="다시 불러오기"
        message="정원을 불러오지 못했어요."
        onAction={() => void childQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{childQuery.data.name}의 정원</Text>
      <CollectionPanel child={childQuery.data} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
});
