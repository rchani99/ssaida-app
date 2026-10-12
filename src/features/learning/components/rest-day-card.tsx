import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { childCollectionTokens as reward, colors, spacing } from '@/design-system/tokens';

export function RestDayCard({ hasStudies }: { hasStudies: boolean }) {
  const [float] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      preferenceChanged = true;
      if (reduced) {
        animation?.stop();
        float.setValue(0);
      }
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active || reduced || preferenceChanged) return;
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(float, {
              toValue: -6,
              duration: 1800,
              useNativeDriver: true,
              isInteraction: false,
            }),
            Animated.timing(float, {
              toValue: 0,
              duration: 1800,
              useNativeDriver: true,
              isInteraction: false,
            }),
          ]),
          { iterations: 2 },
        );
        animation.start();
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
      animation?.stop();
      float.stopAnimation();
    };
  }, [float]);

  return (
    <View style={styles.card}>
      <View
        style={styles.art}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={{ transform: [{ translateY: float }] }}>
          <Svg width={200} height={148} viewBox="0 0 200 148">
            <Circle cx="100" cy="70" r="62" fill="#E2DCF2" />
            <Ellipse cx="100" cy="137" rx="51" ry="5" fill="#DBD4EB" />
            <Path
              d="M46 115C18 115 18 77 45 75C44 40 91 31 106 58C126 37 157 49 157 75C187 73 191 115 161 115Z"
              fill="#FFFFFF"
              stroke="#C2B3DB"
              strokeWidth="2.5"
            />
            <Path
              d="M70 87q7 8 14 0M115 87q7 8 14 0"
              fill="none"
              stroke="#78628F"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Path
              d="M94 99q6 5 12 0"
              fill="none"
              stroke="#78628F"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <Ellipse cx="65" cy="96" rx="7" ry="3.5" fill="#F3C5BD" />
            <Ellipse cx="134" cy="96" rx="7" ry="3.5" fill="#F3C5BD" />
            <Path
              d="m149 16 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"
              fill="#FFDB87"
              stroke="#EAC36E"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <Path d="m32 34 3 6 7 3-7 3-3 7-3-7-6-3 6-3Z" fill="#AF9ACF" />
            <Circle cx="179" cy="57" r="3" fill="#AACAB7" />
            <Circle cx="26" cy="110" r="3" fill="#E6B19B" />
          </Svg>
        </Animated.View>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        오늘은 쉬는 날이에요
      </Text>
      <Text style={styles.copy}>
        {hasStudies
          ? '오늘 계획된 공부는 쉬어요.\n따로 남아 있는 공부는 아래에서 확인해요.'
          : '마음껏 놀고, 푹 쉬며 힘을 채워요.\n쉬는 시간도 소중해요.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: reward.heroRadius,
    backgroundColor: reward.lavender,
  },
  art: { height: 156, alignItems: 'center', justifyContent: 'center' },
  title: { color: reward.lavenderInk, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  copy: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center' },
});
