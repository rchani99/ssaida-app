import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { fetchCollectionAlbum } from '@/features/learning/api/collection-album-api';
import { useSelectCollectionTheme } from '@/features/learning/hooks/use-learning';

export const collectionThemes = [
  ['DINO', '공룡'],
  ['GEM', '보석'],
  ['ROBOT', '로봇'],
  ['DOLL', '인형'],
  ['COIN', '동전'],
  ['PLANT', '식물'],
] as const;
const themes = collectionThemes;

// Mounted only after the current nonempty active catalog is fully revealed.
export function NextThemePanel({ childId, themeCode }: { childId: string; themeCode: string }) {
  const [open, setOpen] = useState(false);
  const selection = useSelectCollectionTheme();
  const albums = useQueries({
    queries: themes.map(([code]) => ({
      queryKey: ['learning', 'collection-album', childId, code],
      queryFn: () => fetchCollectionAlbum(childId, code),
      enabled: open,
    })),
  });
  const label = themes.find(([code]) => code === themeCode)?.[1];
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{label} 도감 완성!</Text>
      <Text style={styles.description}>친구들을 모두 만났어요. 정말 멋져요!</Text>
      {!open ? (
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => setOpen(true)}>
          <Text style={styles.primaryText}>다음 테마 고르기</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.description}>모아 둔 성장 포인트는 다음 친구에게 이어져요.</Text>
          <View style={styles.grid}>
            {themes.map(([code, name], index) => {
              const query = albums[index];
              const album = query.data;
              const disabled =
                selection.isPending ||
                query.isError ||
                !album ||
                album.total === 0 ||
                album.isComplete ||
                code === themeCode;
              const status = query.isError
                ? '불러오기 실패'
                : !album
                  ? '불러오는 중'
                  : album.total === 0
                    ? '준비 중'
                    : album.isComplete
                      ? '완료'
                      : album.entries.some((item) => item.state !== 'locked')
                        ? '이어서 키우기'
                        : '새로 키우기';
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} · ${status}`}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  style={[styles.card, disabled && styles.muted]}
                  onPress={() => selection.mutate(code)}
                >
                  {/* Future theme artwork belongs here; never render unrevealed catalog art. */}
                  <View accessible={false} style={styles.placeholder}>
                    <Text style={styles.title}>✦</Text>
                  </View>
                  <Text style={styles.title}>{name}</Text>
                  <Text style={styles.description}>{status}</Text>
                </Pressable>
              );
            })}
          </View>
          {albums.some((query) => query.isError) && (
            <Pressable
              accessibilityRole="button"
              style={styles.cancel}
              onPress={() => {
                albums.forEach((query) => {
                  void query.refetch();
                });
              }}
            >
              <Text style={styles.description}>테마 다시 불러오기</Text>
            </Pressable>
          )}
          {selection.isPending && <Text style={styles.description}>새 친구를 만나러 가요…</Text>}
          {selection.isError && (
            <Text accessibilityRole="alert" style={styles.error}>
              테마를 선택하지 못했어요. 현재 테마의 공개를 모두 마쳤는지 확인하고 다시 시도해
              주세요.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={selection.isPending}
            style={styles.cancel}
            onPress={() => {
              setOpen(false);
              selection.reset();
            }}
          >
            <Text style={styles.description}>취소</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.primaryLight,
  },
  title: { color: colors.primaryDark, fontSize: 18, fontWeight: '700' },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  placeholder: {
    width: 40,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.background,
  },
  muted: { opacity: 0.55 },
  primary: {
    minHeight: sizing.buttonHeight,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
  },
  primaryText: { color: colors.card, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  cancel: { minHeight: sizing.buttonHeight, justifyContent: 'center', alignItems: 'center' },
  error: { color: colors.error, fontSize: 14 },
});
