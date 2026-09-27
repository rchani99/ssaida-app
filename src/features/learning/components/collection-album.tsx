import { StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';

import type { CollectionAlbum as Album } from '@/features/learning/utils/collection-album';

const labels = {
  collected: '수집 완료',
  growing: '키우는 중',
  ready: '완성! 공개해보세요',
  locked: '아직 만나지 못했어요',
};

export function CollectionAlbum({ album }: { album: Album }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>완성한 컬렉션</Text>
      <Text style={styles.count}>
        {album.collected} / {album.total}개 모았어요
      </Text>
      {album.total === 0 ? (
        <View style={styles.empty}>
          <Text accessible={false} style={styles.symbol}>
            ✦
          </Text>
          <Text style={styles.itemName}>새 친구들을 준비하고 있어요</Text>
          <Text style={styles.description}>아직 준비된 아이템이 없어요.</Text>
        </View>
      ) : (
        <>
          {album.collected === 0 && (
            <Text style={styles.description}>
              첫 친구를 만나볼까요? 확인받은 공부만큼 조금씩 자라요.
            </Text>
          )}
          {album.isComplete && (
            <Text style={styles.description}>이 테마의 친구들을 모두 모았어요!</Text>
          )}
          <View style={styles.grid}>
            {album.entries.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.item,
                  item.state === 'collected' && styles.collectedCard,
                  item.state === 'ready' && styles.readyCard,
                ]}
              >
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.placeholder,
                    item.state === 'collected' && styles.collectedArt,
                    item.state === 'growing' && styles.growingArt,
                    item.state === 'ready' && styles.readyArt,
                  ]}
                >
                  {/* Generic artwork only; real item artwork may be used after reveal. */}
                  <Text style={styles.symbol}>{item.state === 'collected' ? '✦' : '?'}</Text>
                  {item.state === 'collected' && <Text style={styles.face}>• ᴗ •</Text>}
                </View>
                <View style={styles.detail}>
                  <Text style={styles.itemName}>
                    {item.state === 'collected' ? item.name : '???'}
                  </Text>
                  <Text style={[styles.state, item.state === 'ready' && styles.readyLabel]}>
                    {labels[item.state]}
                  </Text>
                  {item.state === 'growing' && (
                    <>
                      <View
                        accessibilityRole="progressbar"
                        accessibilityLabel="성장 진행률"
                        accessibilityValue={{ min: 0, max: 100, now: item.progress }}
                        style={styles.gauge}
                      >
                        <View style={[styles.fill, { width: `${item.progress}%` }]} />
                      </View>
                      <Text style={styles.description}>성장 {item.progress}%</Text>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  count: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
    alignSelf: 'flex-start',
    backgroundColor: reward.mint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  itemName: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  item: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 120,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: reward.lavender,
    borderRadius: reward.cardRadius,
    backgroundColor: colors.card,
  },
  placeholder: {
    width: '100%',
    minHeight: 112,
    borderRadius: reward.cardRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: reward.lavender,
  },
  symbol: { fontSize: 44, color: reward.lavenderInk, fontWeight: '800' },
  face: { fontSize: 22, color: colors.primaryDark },
  state: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  collectedCard: { borderColor: reward.mintBorder },
  readyCard: { borderColor: reward.butterInk, backgroundColor: '#FFFCF3' },
  collectedArt: { backgroundColor: reward.peach },
  growingArt: { backgroundColor: reward.mint },
  readyArt: { backgroundColor: reward.butter },
  readyLabel: { color: reward.butterInk, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: reward.lavender,
    borderRadius: reward.cardRadius,
  },
  detail: { alignSelf: 'stretch', gap: spacing.xs, minWidth: 0 },
  gauge: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.primaryLight },
  fill: { height: '100%', backgroundColor: colors.primary },
});
