import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parentTokens as t } from '@/design-system/tokens';

import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Tone = keyof typeof t.status;

export function ParentSection({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <View style={styles.section}>
      {title && (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

export function ParentCard({
  children,
  compact = false,
  style,
}: PropsWithChildren<{ compact?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, compact && styles.compact, style]}>{children}</View>;
}

export function StatusChip({
  label,
  tone = 'neutral',
  muted = false,
}: {
  label: string;
  tone?: Tone;
  muted?: boolean;
}) {
  const palette = t.status[tone];
  return (
    <View
      style={[styles.chip, { backgroundColor: muted ? t.colors.background : palette.background }]}
    >
      <Text
        style={[
          t.typography.chip,
          {
            color: muted ? t.colors.textSecondary : palette.foreground,
            fontWeight: muted ? '400' : '600',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ParentActionRow({
  label,
  value,
  tone,
  muted = false,
  onPress,
}: {
  label: string;
  value: string;
  tone: 'pending' | 'unfinished' | 'conflict';
  muted?: boolean;
  onPress: () => void;
}) {
  const palette = t.status[tone];
  const foreground = muted ? t.colors.textSecondary : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      style={[styles.action, { backgroundColor: palette.background }]}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.iconContainer}
      >
        <View style={[styles.icon, { borderColor: foreground }]}>
          {tone === 'pending' ? (
            <View style={[styles.tick, { borderColor: foreground }]} />
          ) : (
            <>
              <View style={[styles.mark, { backgroundColor: foreground }]} />
              {tone === 'conflict' && (
                <View style={[styles.dot, { backgroundColor: foreground }]} />
              )}
              {tone === 'unfinished' && (
                <View style={[styles.clockHand, { backgroundColor: foreground }]} />
              )}
            </>
          )}
        </View>
      </View>
      <View style={styles.actionContent}>
        <Text
          style={[
            t.typography.body,
            {
              flexShrink: 1,
              color: muted ? t.colors.textSecondary : t.colors.textPrimary,
              fontWeight: muted ? '400' : '600',
            },
          ]}
        >
          {label}
        </Text>
        <StatusChip label={value} tone={tone} muted={muted} />
      </View>
      <View accessible={false} style={[styles.chevron, { borderColor: foreground }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: t.layout.contentGap },
  title: { ...t.typography.section, color: t.colors.textPrimary },
  card: {
    padding: t.card.padding,
    gap: t.spacing.sm,
    borderWidth: t.card.borderWidth,
    borderColor: t.colors.border,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.card,
  },
  compact: { paddingVertical: t.card.compactVertical },
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    borderRadius: t.radius.chip,
  },
  action: {
    minHeight: t.layout.touchMin,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  actionContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
  },
  iconContainer: {
    width: t.icon.container,
    height: t.icon.container,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.card,
    borderRadius: t.radius.chip,
  },
  icon: {
    width: t.icon.size,
    height: t.icon.size,
    borderWidth: t.icon.stroke,
    borderRadius: t.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 8,
    height: 5,
    borderLeftWidth: t.icon.stroke,
    borderBottomWidth: t.icon.stroke,
    transform: [{ rotate: '-45deg' }],
  },
  mark: { width: t.icon.stroke, height: 6 },
  dot: { width: t.icon.stroke, height: t.icon.stroke, marginTop: 2 },
  clockHand: { width: 5, height: t.icon.stroke, marginLeft: 3 },
  chevron: {
    width: 6,
    height: 6,
    borderRightWidth: t.icon.stroke,
    borderTopWidth: t.icon.stroke,
    transform: [{ rotate: '45deg' }],
  },
});
