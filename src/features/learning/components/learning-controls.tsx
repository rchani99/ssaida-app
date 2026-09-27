import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import {
  colors,
  dashboardTokens,
  parentTokens,
  radius,
  sizing,
  spacing,
} from '@/design-system/tokens';

export function LearningButton({
  label,
  onPress,
  disabled = false,
  variant = 'secondary',
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'neutral';
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        learningStyles.button,
        variant === 'primary' && {
          backgroundColor: colors.primary,
          minHeight: parentTokens.button.minHeight,
          paddingVertical: spacing.sm,
        },
        variant === 'outline' && {
          backgroundColor: dashboardTokens.colors.card,
          ...dashboardTokens.border.card,
          borderRadius: dashboardTokens.radius.normal,
          minHeight: dashboardTokens.icon.touchMin,
          paddingVertical: dashboardTokens.spacing[4],
        },
        variant === 'neutral' && { backgroundColor: dashboardTokens.colors.background },
        compact && {
          minHeight: 40,
          maxWidth: '100%',
          flexShrink: 1,
          borderRadius: dashboardTokens.radius.normal,
          paddingVertical: dashboardTokens.spacing[4],
          paddingHorizontal: dashboardTokens.spacing[12],
          alignSelf: 'flex-start',
        },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          learningStyles.buttonText,
          variant === 'outline' && {
            ...dashboardTokens.typography.body,
            color: dashboardTokens.colors.primary,
            textAlign: 'center',
          },
          variant === 'primary' && {
            ...parentTokens.typography.button,
            color: colors.card,
            textAlign: 'center',
          },
          variant === 'neutral' && { color: dashboardTokens.colors.textSecondary },
          compact && { ...dashboardTokens.typography.body, textAlign: 'center' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function LearningField({
  label,
  value,
  onChangeText,
  numeric = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Text style={learningStyles.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        onChangeText={(text) => onChangeText(numeric ? text.replace(/\D/g, '') : text)}
        keyboardType={numeric ? 'number-pad' : 'default'}
        style={learningStyles.input}
      />
    </>
  );
}
export const learningStyles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  text: { fontSize: 15, color: colors.textPrimary },
  secondary: { fontSize: 13, color: colors.textSecondary },
  warning: { fontSize: 14, color: colors.warning },
  error: { fontSize: 14, color: colors.error },
  success: { fontSize: 14, color: colors.primaryDark },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.button,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  choice: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
  },
  selected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  input: {
    height: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    fontSize: 16,
  },
});
