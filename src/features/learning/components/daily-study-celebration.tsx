import { StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';
import { LearningButton } from '@/features/learning/components/learning-controls';
import { StudyCelebrationArt } from '@/features/learning/components/study-celebration-art';

export function DailyStudyCelebration({ onCollection }: { onCollection: () => void }) {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <StudyCelebrationArt animate={false} />
      <Text accessibilityRole="header" style={styles.title}>
        오늘 공부, 모두 완료!
      </Text>
      <Text style={styles.copy}>
        하나씩 해낸 오늘, 정말 멋져요.{'\n'}이제 편하게 쉬어도 좋아요.
      </Text>
      <LearningButton label="내 컬렉션 보기" variant="primary" onPress={onCollection} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: reward.heroRadius,
    backgroundColor: reward.mint,
    borderWidth: 1,
    borderColor: reward.mintBorder,
  },
  title: { color: colors.primaryDark, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  copy: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center' },
});
