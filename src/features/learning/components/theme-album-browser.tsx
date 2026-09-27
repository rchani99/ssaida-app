import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';
import { fetchCollectionAlbum } from '@/features/learning/api/collection-album-api';
import { CollectionAlbum } from '@/features/learning/components/collection-album';
import { collectionThemes, NextThemePanel } from '@/features/learning/components/next-theme-panel';

// Browsing is local UI state only. Never writes selected_collection_theme_code.
export function ThemeAlbumBrowser({
  childId,
  currentTheme,
  canSwitch,
}: {
  childId: string;
  currentTheme: string;
  canSwitch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewedTheme, setViewedTheme] = useState(currentTheme);
  const albums = useQueries({
    queries: collectionThemes.map(([code]) => ({
      queryKey: ['learning', 'collection-album', childId, code],
      queryFn: () => fetchCollectionAlbum(childId, code),
      enabled: open,
    })),
  });
  const currentLabel = collectionThemes.find(([code]) => code === currentTheme)?.[1];
  const viewedIndex = collectionThemes.findIndex(([code]) => code === viewedTheme);
  const viewed = albums[viewedIndex];
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.entry}
      >
        <Text style={styles.title}>{currentLabel} 테마 ▾</Text>
        <Text style={styles.caption}>테마 · 도감 둘러보기</Text>
      </Pressable>
      {open && (
        <View style={styles.section}>
          <Text style={styles.title}>현재 키우는 테마 · {currentLabel}</Text>
          <Text style={styles.caption}>도감을 둘러봐도 키우는 테마는 바뀌지 않아요.</Text>
          <View style={styles.grid}>
            {collectionThemes.map(([code, label], index) => {
              const query = albums[index];
              const album = query.data;
              const status = query.isError
                ? '불러오기 실패'
                : !album
                  ? '불러오는 중'
                  : album.total === 0
                    ? '준비 중'
                    : album.isComplete
                      ? '완료'
                      : code === currentTheme
                        ? '현재 진행 중'
                        : album.entries.some((item) => item.state !== 'locked')
                          ? '수집 기록 있음'
                          : '아직 시작 안 함';
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} · ${status} · 도감 보기`}
                  accessibilityState={{ selected: viewedTheme === code }}
                  onPress={() => setViewedTheme(code)}
                  style={[styles.card, viewedTheme === code && styles.selected]}
                >
                  <Text style={styles.title}>{label}</Text>
                  <Text style={styles.caption}>{status}</Text>
                  <Text style={styles.caption}>도감 보기</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.title}>{collectionThemes[viewedIndex]?.[1]} 도감 · 열람 중</Text>
          {viewed?.isError ? (
            <Pressable
              accessibilityRole="button"
              style={styles.entry}
              onPress={() => void viewed.refetch()}
            >
              <Text style={styles.caption}>도감을 불러오지 못했어요. 다시 불러오기</Text>
            </Pressable>
          ) : viewed?.data ? (
            <CollectionAlbum key={viewedTheme} album={viewed.data} />
          ) : (
            <Text style={styles.caption}>도감을 불러오고 있어요.</Text>
          )}
          {!canSwitch && (
            <Text style={styles.caption}>
              현재 테마를 모두 공개하면 다음 테마를 고를 수 있어요.
            </Text>
          )}
          <Pressable accessibilityRole="button" style={styles.entry} onPress={() => setOpen(false)}>
            <Text style={styles.title}>현재 정원으로 돌아가기</Text>
          </Pressable>
        </View>
      )}
      {canSwitch && <NextThemePanel childId={childId} themeCode={currentTheme} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  entry: {
    minHeight: 48,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: reward.cardRadius,
    backgroundColor: reward.mint,
  },
  title: { color: colors.primaryDark, fontSize: 16, fontWeight: '700' },
  caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    flexBasis: '45%',
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: reward.cardRadius,
    backgroundColor: colors.card,
  },
  selected: { borderColor: colors.primary, backgroundColor: reward.mint },
});
