import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';
import { useCurrentCollectible } from '@/features/learning/hooks/use-learning';
import { collectionArtwork } from '@/features/learning/utils/collection-artwork';
import { collectionThemes } from '@/features/learning/utils/collection-themes';
import { growthStage } from '@/features/learning/utils/completion-reward';

import type { Child } from '@/features/learning/types/learning.types';

export function TodayCollectionCard({ child }: { child: Child }) {
  const router = useRouter();
  const query = useCurrentCollectible(child.id, child.selected_collection_theme_code);
  const collectible = query.data;
  const needsTheme = !child.selected_collection_theme_code;
  const label = collectionThemes.find(
    ([code]) => code === child.selected_collection_theme_code,
  )?.[1];
  const growth = collectible
    ? growthStage(
        collectible.progress_points,
        collectible.growth_goal_snapshot,
        collectible.status === 'COMPLETED',
      )
    : null;
  const artwork =
    collectible && growth
      ? collectionArtwork(collectible.collectible_catalog.code)?.growth[growth.stage]
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(needsTheme ? '/choose-theme' : '/child/garden')}
      style={styles.card}
    >
      {artwork && (
        <Image source={artwork} contentFit="contain" style={styles.art} accessible={false} />
      )}
      <View style={styles.copy}>
        <Text style={styles.title}>
          {needsTheme
            ? '공부하고 키울 친구를 골라주세요'
            : `${label ?? '나의'} 친구가 기다리고 있어요`}
        </Text>
        <Text style={styles.description}>
          {needsTheme
            ? child.pending_growth_points > 0
              ? `모아둔 ${child.pending_growth_points}포인트로 바로 키울 수 있어요.`
              : '공부하고 부모님께 확인받으면 쑥쑥 자라요.'
            : query.isError
              ? '성장 상태를 불러오지 못했어요. 내 컬렉션에서 다시 확인해 주세요.'
              : query.isLoading
                ? '성장 상태를 불러오고 있어요.'
                : collectible && growth
                  ? `${collectible.progress_points} / ${collectible.growth_goal_snapshot}포인트 · ${growth.label}`
                  : '내 컬렉션에서 모은 친구들을 만나보세요.'}
        </Text>
        <Text style={styles.link}>{needsTheme ? '키울 테마 고르기 →' : '내 컬렉션 보기 →'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.primaryLight,
  },
  art: { width: 72, height: 72 },
  copy: { flex: 1, gap: spacing.xs },
  title: { color: colors.primaryDark, fontSize: 16, fontWeight: '700' },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  link: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
});
