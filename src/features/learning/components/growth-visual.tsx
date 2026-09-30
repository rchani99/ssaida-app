import { StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';
import { growthStage } from '@/features/learning/utils/completion-reward';

// Identity-free placeholder. Future stage artwork belongs here; unrevealed
// catalog names/images must never be passed into this component.
export function GrowthVisual({
  points,
  goal,
  ready,
}: {
  points: number;
  goal: number;
  ready: boolean;
}) {
  const growth = growthStage(points, goal, ready);
  const size = 112 + growth.stage * 8;
  return (
    <View style={styles.container} accessibilityLabel={`${growth.label}, 성장 ${growth.percent}%`}>
      <View
        style={styles.art}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.halo}>
          <Text style={styles.sparkle}>✦</Text>
          <View style={[styles.orb, { width: size, height: size * 1.12 }]}>
            <View style={styles.spot} />
            <View style={styles.smallSpot} />
            <Text style={styles.symbol}>{ready ? '✦' : '?'}</Text>
          </View>
          <View style={styles.nest} />
        </View>
        <View style={styles.steps}>
          {[0, 1, 2, 3, 4].map((step) => (
            <View key={step} style={[styles.dot, step <= growth.stage && styles.filled]} />
          ))}
        </View>
      </View>
      <View style={styles.detail}>
        <Text style={styles.label}>{growth.label}</Text>
        <Text style={styles.amount}>
          {points} / {goal}
        </Text>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="현재 아이템 성장"
          accessibilityValue={{ min: 0, max: goal, now: Math.min(goal, Math.max(0, points)) }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${growth.percent}%` }]} />
        </View>
        <Text style={styles.caption}>확정된 성장 {growth.percent}%</Text>
        <Text style={styles.expectation}>
          {ready
            ? '새 친구가 기다리고 있어요!'
            : `새 친구까지 ${Number(Math.max(0, goal - points).toFixed(6))}포인트 남았어요`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: reward.cardRadius,
    backgroundColor: reward.mint,
  },
  art: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 232,
    gap: spacing.md,
  },
  detail: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  halo: {
    width: '100%',
    maxWidth: 210,
    aspectRatio: 210 / 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: { position: 'absolute', right: 4, top: 8, fontSize: 28, color: reward.butterInk },
  nest: { width: 156, height: 16, borderRadius: 80, backgroundColor: reward.mintBorder },
  spot: {
    position: 'absolute',
    top: 20,
    left: 22,
    width: 24,
    height: 32,
    borderRadius: 16,
    backgroundColor: reward.mintBorder,
    transform: [{ rotate: '25deg' }],
  },
  smallSpot: {
    position: 'absolute',
    bottom: 22,
    right: 18,
    width: 17,
    height: 22,
    borderRadius: 12,
    backgroundColor: reward.mintBorder,
  },
  orb: {
    borderTopLeftRadius: 85,
    borderTopRightRadius: 85,
    borderBottomLeftRadius: 64,
    borderBottomRightRadius: 64,
    borderWidth: 3,
    borderColor: reward.mintBorder,
    backgroundColor: '#FFFCED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { color: colors.primaryDark, fontSize: 44, fontWeight: '800' },
  steps: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  filled: { backgroundColor: colors.primary },
  label: { color: colors.primaryDark, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  caption: { color: colors.textSecondary, fontSize: 13 },
  expectation: { color: colors.primaryDark, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  amount: { color: colors.primaryDark, fontSize: 28, fontWeight: '800' },
  track: {
    width: '100%',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.primary },
});
