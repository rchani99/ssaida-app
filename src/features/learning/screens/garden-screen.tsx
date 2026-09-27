import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';
import { CollectionAlbum } from '@/features/learning/components/collection-album';
import { CollectionPanel } from '@/features/learning/components/collection-panel';
import { NextThemePanel } from '@/features/learning/components/next-theme-panel';
import { useCollectionAlbum } from '@/features/learning/hooks/use-collection-album';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

const themeLabels: Record<string, string> = {
  DINO: '공룡',
  GEM: '보석',
  ROBOT: '로봇',
  DOLL: '인형',
  COIN: '동전',
  PLANT: '식물',
};

export function GardenScreen() {
  const childQuery = useCurrentChild();
  const albumQuery = useCollectionAlbum(
    childQuery.data?.id,
    childQuery.data?.selected_collection_theme_code,
  );
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
      <Text style={styles.theme}>
        {themeLabels[childQuery.data.selected_collection_theme_code ?? ''] ?? '나만의'} 테마
      </Text>
      <CollectionPanel
        child={childQuery.data}
        key={`panel-${childQuery.data.selected_collection_theme_code ?? 'none'}`}
        albumState={
          albumQuery.data
            ? albumQuery.data.total === 0
              ? 'empty'
              : albumQuery.data.isComplete
                ? 'complete'
                : 'incomplete'
            : undefined
        }
      />
      {childQuery.data.selected_collection_theme_code &&
        albumQuery.data?.isComplete &&
        !albumQuery.isError && (
          <NextThemePanel
            key={`next-${childQuery.data.selected_collection_theme_code}`}
            childId={childQuery.data.id}
            themeCode={childQuery.data.selected_collection_theme_code}
          />
        )}
      {childQuery.data.selected_collection_theme_code &&
        (albumQuery.isError ? (
          <ScreenMessage
            message="도감을 불러오지 못했어요."
            actionLabel="다시 불러오기"
            onAction={() => void albumQuery.refetch()}
          />
        ) : albumQuery.data ? (
          <CollectionAlbum
            key={`album-${childQuery.data.selected_collection_theme_code}`}
            album={albumQuery.data}
          />
        ) : (
          <Text style={styles.description}>도감을 불러오고 있어요.</Text>
        ))}
      {childQuery.data.pending_growth_points > 0 && (
        <View style={styles.pending}>
          <Text accessible={false} style={styles.pendingSymbol}>
            ✦
          </Text>
          <Text style={styles.pendingTitle}>
            잘 모아둔 성장 +{childQuery.data.pending_growth_points}
          </Text>
          <Text style={styles.description}>다음 아이템을 키울 때 사용돼요</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: reward.canvas,
  },
  theme: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '700',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: reward.mint,
  },
  pending: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: reward.cardRadius,
    backgroundColor: reward.butter,
  },
  pendingSymbol: { color: reward.butterInk, fontSize: 26 },
  pendingTitle: { color: reward.butterInk, fontSize: 18, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 14 },
});
