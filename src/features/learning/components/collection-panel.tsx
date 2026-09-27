import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  childCollectionTokens as reward,
  colors,
  radius,
  sizing,
  spacing,
} from '@/design-system/tokens';
import { GrowthVisual } from '@/features/learning/components/growth-visual';
import {
  learningKeys,
  useCurrentCollectible,
  useRevealCollectible,
  useSelectCollectionTheme,
} from '@/features/learning/hooks/use-learning';

import type { Child } from '@/features/learning/types/learning.types';

const THEMES = [
  { code: 'DINO', label: '공룡' },
  { code: 'GEM', label: '보석' },
  { code: 'ROBOT', label: '로봇' },
  { code: 'DOLL', label: '인형' },
  { code: 'COIN', label: '동전' },
  { code: 'PLANT', label: '식물' },
] as const;

export function CollectionPanel({
  child,
  albumState,
}: {
  child: Child;
  albumState?: 'empty' | 'complete' | 'incomplete';
}) {
  const queryClient = useQueryClient();
  const collectibleQuery = useCurrentCollectible(child.id, child.selected_collection_theme_code);
  const selectTheme = useSelectCollectionTheme();
  const reveal = useRevealCollectible();
  const [revealed, setRevealed] = useState<{ id: string; name: string } | null>(null);
  const collectibleId = collectibleQuery.data?.id;
  const [previousId, setPreviousId] = useState(collectibleId);
  if (previousId !== collectibleId) {
    setPreviousId(collectibleId);
    setRevealed(null);
  }
  const selectedTheme = THEMES.find((theme) => theme.code === child.selected_collection_theme_code);

  if (!child.selected_collection_theme_code) {
    return (
      <View style={styles.panel}>
        <Text accessible={false} style={styles.mascot}>
          ✦
        </Text>
        <Text style={styles.title}>어떤 친구를 키워볼까요?</Text>
        <Text style={styles.description}>공부를 마치고 부모님께 확인받으면 조금씩 자라요.</Text>
        <View style={styles.themeGrid}>
          {THEMES.map((theme) => (
            <Pressable
              accessibilityRole="button"
              disabled={selectTheme.isPending}
              key={theme.code}
              onPress={() => selectTheme.mutate(theme.code)}
              style={styles.themeButton}
            >
              <Text style={styles.themeText}>{theme.label}</Text>
            </Pressable>
          ))}
        </View>
        {selectTheme.isError && (
          <Text style={styles.error}>테마를 선택하지 못했어요. 다시 시도해 주세요.</Text>
        )}
      </View>
    );
  }

  if (collectibleQuery.isLoading) {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (collectibleQuery.isError) {
    return (
      <View style={styles.panel}>
        <Text style={styles.error}>정원 상태를 불러오지 못했어요.</Text>
      </View>
    );
  }

  const collectible = collectibleQuery.data;
  if (revealed && revealed.id === collectibleId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.badge}>새 친구 발견!</Text>
        <Text accessible={false} style={styles.mascot}>
          ✦
        </Text>
        <Text style={styles.title}>새 친구를 만났어요!</Text>
        <Text style={styles.revealed}>{revealed.name}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => {
            // Keep the result until the refreshed query replaces the collectible.
            void queryClient.invalidateQueries({ queryKey: learningKeys.all });
          }}
        >
          <Text style={styles.primaryButtonText}>정원으로</Text>
        </Pressable>
      </View>
    );
  }
  if (!collectible) {
    return (
      <View style={styles.panel}>
        <Text accessible={false} style={styles.mascot}>
          {albumState === 'complete' ? '✦' : '?'}
        </Text>
        <Text style={styles.title}>
          {albumState === 'complete'
            ? `${selectedTheme?.label} 친구들을 모두 만났어요`
            : albumState === 'empty'
              ? '아직 준비된 아이템이 없어요'
              : '현재 키우는 친구가 없어요'}
        </Text>
        <Text style={styles.description}>
          {albumState === 'complete'
            ? '도감에서 모은 친구들을 만나보세요.'
            : '아래 수집 현황을 확인해 주세요.'}
        </Text>
      </View>
    );
  }

  const isReady = collectible.status === 'COMPLETED' && collectible.revealed_at === null;

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>{selectedTheme?.label} 친구를 모으고 있어요</Text>
      {isReady && <Text style={styles.badge}>완성! 새 친구를 공개해요</Text>}
      <Text style={styles.title}>
        {isReady ? '새로운 친구를 만날 준비가 됐어요!' : '무언가 자라고 있어요'}
      </Text>
      <GrowthVisual
        points={collectible.progress_points}
        goal={collectible.growth_goal_snapshot}
        ready={isReady}
      />
      {!isReady && (
        <>
          <Text style={styles.description}>공부를 마치고 부모님께 확인받아 보세요.</Text>
        </>
      )}
      {isReady && (
        <Pressable
          accessibilityRole="button"
          disabled={reveal.isPending}
          onPress={() => {
            setRevealed(null);
            reveal.mutate(collectible.id, {
              onSuccess: (name) => {
                setRevealed({ id: collectible.id, name });
                // Refresh album and stored growth, but not the current collectible:
                // replacing its id here would hide the just-revealed result.
                void queryClient.invalidateQueries({
                  queryKey: ['learning', 'collection-album', child.id],
                });
                void queryClient.invalidateQueries({ queryKey: learningKeys.child });
              },
            });
          }}
          style={styles.primaryButton}
        >
          {reveal.isPending ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.primaryButtonText}>새 친구 공개하기</Text>
          )}
        </Pressable>
      )}
      {reveal.isError && <Text style={styles.error}>지금은 열어볼 수 없어요.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: reward.mintBorder,
    borderRadius: reward.heroRadius,
    backgroundColor: colors.card,
  },
  eyebrow: { color: colors.primaryDark, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
    textAlign: 'center',
  },
  mascot: {
    alignSelf: 'center',
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: reward.butter,
    fontSize: 56,
    color: reward.butterInk,
    paddingTop: 20,
  },
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: reward.butter,
    color: reward.butterInk,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeButton: {
    minWidth: '30%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: reward.mint,
  },
  themeText: { color: colors.textPrimary, fontWeight: '700' },
  primaryButton: {
    minHeight: sizing.buttonHeight,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: reward.cardRadius,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  revealed: { color: colors.primaryDark, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  error: { color: colors.error, fontSize: 13 },
});
