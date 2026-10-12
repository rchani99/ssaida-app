import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

const confetti = [
  { x: -92, y: -38, color: '#8CBB95', rotation: '-45deg' },
  { x: -64, y: -68, color: '#B9A5DC', rotation: '30deg' },
  { x: -28, y: -82, color: '#EAAF53', rotation: '-20deg' },
  { x: 28, y: -82, color: '#8CBB95', rotation: '35deg' },
  { x: 64, y: -68, color: '#E99D89', rotation: '-40deg' },
  { x: 92, y: -38, color: '#B9A5DC', rotation: '45deg' },
];

/** A short celebration on completion; the list keeps a quiet, static illustration. */
export function StudyCelebrationArt({ animate = true }: { animate?: boolean }) {
  const [scale] = useState(() => new Animated.Value(1));
  const [burst] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!animate) return;
    let active = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const stop = () => {
      animation?.stop();
      scale.setValue(1);
      burst.setValue(0);
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      preferenceChanged = true;
      if (reduced) stop();
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active || reduced || preferenceChanged) return;
        scale.setValue(0.85);
        animation = Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.08, duration: 280, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 240, useNativeDriver: true }),
          ]),
          Animated.timing(burst, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ]);
        animation.start();
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
      animation?.stop();
      scale.stopAnimation();
      burst.stopAnimation();
    };
  }, [animate, burst, scale]);

  return (
    <View
      style={styles.art}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Svg width={180} height={140} viewBox="0 0 180 140">
          <Circle cx="90" cy="65" r="59" fill="#FFF1C9" />
          <Ellipse cx="90" cy="128" rx="42" ry="6" fill="#CFE5D4" />
          <Path d="M61 94 54 123 75 116 89 128 95 96" fill="#89B598" />
          <Path d="m99 96 13 31 10-14 22 4-22-32" fill="#B9A5DC" />
          <Path
            d="M85 22 Q90 12 95 22 L108 46 135 50 Q148 52 139 62 L120 82 123 109 Q124 121 113 116 L90 103 66 116 Q55 122 57 109 L60 82 41 62 Q32 52 45 50 L72 46Z"
            fill="#FFD879"
            stroke="#E9B853"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <Path
            d="M73 68q4-7 8 0M99 68q4-7 8 0"
            fill="none"
            stroke="#72542B"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <Path
            d="M81 80q9 12 18 0"
            fill="none"
            stroke="#72542B"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <Ellipse cx="69" cy="78" rx="7" ry="4" fill="#F3AE8B" />
          <Ellipse cx="111" cy="78" rx="7" ry="4" fill="#F3AE8B" />
          <Path d="m25 29 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#A994CF" />
          <Path d="m150 76 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#8DBB96" />
          <Circle cx="148" cy="29" r="4" fill="#E9A58F" />
          <Circle cx="26" cy="95" r="3" fill="#8DBB96" />
        </Svg>
      </Animated.View>
      {animate &&
        confetti.map((piece, index) => (
          <Animated.View
            key={index}
            style={[
              styles.confetti,
              {
                backgroundColor: piece.color,
                opacity: burst.interpolate({
                  inputRange: [0, 0.1, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: burst.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, piece.x],
                    }),
                  },
                  {
                    translateY: burst.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, piece.y, piece.y + 65],
                    }),
                  },
                  { rotate: piece.rotation },
                ],
              },
            ]}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { height: 148, width: '100%', alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', top: 75, width: 7, height: 12, borderRadius: 2 },
});
