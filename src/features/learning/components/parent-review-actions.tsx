import { Pressable, Text, View } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';

import { parentReviewStyles as s } from './parent-review-styles';

export function ParentReviewActions({
  actions,
  disabled = false,
  label,
}: {
  actions: { label: string; onPress: () => void; selected?: boolean }[];
  disabled?: boolean;
  label?: string;
}) {
  return (
    <View
      accessibilityRole={label ? 'radiogroup' : undefined}
      accessibilityLabel={label}
      style={s.resultControl}
    >
      {actions.map(({ label, onPress, selected }) => (
        <Pressable
          key={label}
          accessibilityRole={label ? 'radio' : 'button'}
          accessibilityState={{ disabled, ...(label ? { selected: !!selected } : {}) }}
          disabled={disabled}
          onPress={onPress}
          style={[s.resultOption, selected && s.resultSelected, disabled && { opacity: 0.5 }]}
        >
          <Text style={[s.resultText, selected && s.resultSelectedText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ParentReviewConfirm({
  onPress,
  disabled,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: t.icon.touchMin,
        padding: t.spacing[8],
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.primary,
        borderRadius: t.radius.normal,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ ...t.typography.button, color: t.colors.card }}>확인</Text>
    </Pressable>
  );
}
