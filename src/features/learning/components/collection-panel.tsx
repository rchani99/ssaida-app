import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
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

export function CollectionPanel({ child }: { child: Child }) {
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
        <Text style={styles.title}>어떤 친구를 키워볼까요?</Text>
        <Text style={styles.description}>공부를 마칠 때마다 조금씩 자라요.</Text>
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
        <Text style={styles.title}>{selectedTheme?.label} 친구들을 모두 만났어요</Text>
        <Text style={styles.description}>새로운 친구가 준비되면 다시 알려드릴게요.</Text>
      </View>
    );
  }

  const isReady = collectible.status === 'COMPLETED' && collectible.revealed_at === null;
  const progress = Math.min(
    100,
    Math.max(8, (collectible.progress_points / collectible.growth_goal_snapshot) * 100),
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>{selectedTheme?.label} 정원</Text>
      <Text style={styles.title}>
        {isReady ? '새로운 친구를 만날 준비가 됐어요!' : '무언가 자라고 있어요'}
      </Text>
      {!isReady && (
        <>
          <View style={styles.gauge}>
            <View style={[styles.gaugeFill, { width: `${progress}%` }]} />
          </View>
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
              onSuccess: () =>
                setRevealed({ id: collectible.id, name: collectible.collectible_catalog.name }),
            });
          }}
          style={styles.primaryButton}
        >
          {reveal.isPending ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.primaryButtonText}>열어보기</Text>
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
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', lineHeight: 28 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeButton: {
    minWidth: '30%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.background,
  },
  themeText: { color: colors.textPrimary, fontWeight: '700' },
  gauge: {
    height: 14,
    overflow: 'hidden',
    borderRadius: 7,
    backgroundColor: colors.primaryLight,
  },
  gaugeFill: { height: '100%', borderRadius: 7, backgroundColor: colors.primary },
  primaryButton: {
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  revealed: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' },
  error: { color: colors.error, fontSize: 13 },
});
