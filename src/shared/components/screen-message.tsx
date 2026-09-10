import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';

type ScreenMessageProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
};

export function ScreenMessage({ message, actionLabel, onAction, loading }: ScreenMessageProps) {
  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator color={colors.primary} />}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  message: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    minWidth: 140,
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  buttonText: { color: colors.card, fontSize: 15, fontWeight: '700' },
});
