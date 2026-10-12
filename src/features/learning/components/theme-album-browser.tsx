import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  childCollectionTokens as reward,
  colors,
  radius,
  sizing,
  spacing,
} from '@/design-system/tokens';
import { fetchCollectionAlbum } from '@/features/learning/api/collection-album-api';
import { CollectionAlbum } from '@/features/learning/components/collection-album';
import { useSelectCollectionTheme } from '@/features/learning/hooks/use-learning';
import { collectionThemes } from '@/features/learning/utils/collection-themes';

export function ThemeAlbumBrowser({
  childId,
  currentTheme,
  isComplete,
}: {
  childId: string;
  currentTheme: string;
  isComplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewedTheme, setViewedTheme] = useState(currentTheme);
  const selection = useSelectCollectionTheme();
  const albums = useQueries({
    queries: collectionThemes.map(([code]) => ({
      queryKey: ['learning', 'collection-album', childId, code],
      queryFn: () => fetchCollectionAlbum(childId, code),
      enabled: open,
    })),
  });
  const currentLabel = collectionThemes.find(([code]) => code === currentTheme)?.[1];
  const viewedIndex = collectionThemes.findIndex(([code]) => code === viewedTheme);
  const viewedLabel = collectionThemes[viewedIndex]?.[1];
  const viewed = albums[viewedIndex];
  const canSelect =
    viewedTheme !== currentTheme &&
    !viewed?.isError &&
    Boolean(viewed?.data && viewed.data.total > 0 && !viewed.data.isComplete);
  const close = () => {
    if (selection.isPending) return;
    setOpen(false);
    selection.reset();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${currentLabel} 테마 · 테마와 도감 열기`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setViewedTheme(currentTheme);
          selection.reset();
          setOpen(true);
        }}
        style={styles.entry}
      >
        <Text style={styles.title}>{currentLabel} 테마 ▾</Text>
        <Text style={styles.caption}>
          {isComplete ? '도감 완성! · 테마와 도감 열기' : '테마 · 도감'}
        </Text>
      </Pressable>
      {open && (
        <Modal animationType="slide" onRequestClose={close}>
          <SafeAreaView style={styles.modal}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.heading}>
                테마 · 도감
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="테마와 도감 닫기"
                disabled={selection.isPending}
                onPress={close}
                style={styles.close}
              >
                <Text style={styles.title}>닫기</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.tabs}>
                {collectionThemes.map(([code, label], index) => {
                  const query = albums[index];
                  const album = query.data;
                  const status = query.isError
                    ? '불러오기 실패'
                    : !album
                      ? '불러오는 중'
                      : album.total === 0
                        ? '준비 중'
                        : `${album.collected}/${album.total}${album.isComplete ? ' · 완료' : ''}`;
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} 도감 · ${status}${code === currentTheme ? ' · 키우는 중' : ''}`}
                      accessibilityState={{
                        selected: viewedTheme === code,
                        disabled: selection.isPending,
                      }}
                      disabled={selection.isPending}
                      onPress={() => {
                        selection.reset();
                        setViewedTheme(code);
                      }}
                      style={[styles.tab, viewedTheme === code && styles.selected]}
                    >
                      <Text style={styles.title}>{label}</Text>
                      <Text style={styles.tabCaption}>{status}</Text>
                      {code === currentTheme && <Text style={styles.current}>키우는 중</Text>}
                    </Pressable>
                  );
                })}
              </View>
              {viewed?.isError ? (
                <View style={styles.message}>
                  <Text accessibilityRole="alert" style={styles.caption}>
                    도감을 불러오지 못했어요.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void viewed.refetch()}
                    style={styles.close}
                  >
                    <Text style={styles.title}>다시 불러오기</Text>
                  </Pressable>
                </View>
              ) : viewed?.data ? (
                <CollectionAlbum
                  key={viewedTheme}
                  album={viewed.data}
                  title={`${viewedLabel} 도감`}
                />
              ) : (
                <Text style={styles.caption}>도감을 불러오고 있어요.</Text>
              )}
            </ScrollView>
            {canSelect && (
              <View style={styles.footer}>
                <Text style={styles.caption}>키우던 친구의 성장은 저장돼요.</Text>
                {selection.isError && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    테마를 바꾸지 못했어요. 다시 시도해 주세요.
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${viewedLabel} 테마 키우기`}
                  accessibilityState={{ disabled: selection.isPending }}
                  disabled={selection.isPending}
                  onPress={() => selection.mutate(viewedTheme, { onSuccess: () => setOpen(false) })}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>
                    {selection.isPending ? '테마를 바꾸고 있어요…' : '이 테마 키우기'}
                  </Text>
                </Pressable>
              </View>
            )}
          </SafeAreaView>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  entry: {
    minHeight: 48,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: reward.cardRadius,
    backgroundColor: reward.mint,
  },
  modal: { flex: 1, backgroundColor: reward.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heading: { color: colors.primaryDark, fontSize: 22, fontWeight: '800' },
  title: { color: colors.primaryDark, fontSize: 16, fontWeight: '700' },
  caption: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tab: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 72,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  selected: { borderColor: colors.primary, backgroundColor: reward.mint },
  tabCaption: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  current: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  message: { gap: spacing.sm, alignItems: 'center', padding: spacing.lg },
  close: {
    minHeight: sizing.buttonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  primary: {
    minHeight: sizing.buttonHeight,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
  },
  primaryText: { color: colors.card, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  error: { color: colors.error, fontSize: 14 },
});
