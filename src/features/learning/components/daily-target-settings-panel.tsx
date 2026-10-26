import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t, radius } from '@/design-system/tokens';
import { useCurrentChild, useSaveDailyTargetMinutes } from '@/features/learning/hooks/use-learning';

const OPTIONS = [30, 45, 60, 90] as const;

export function DailyTargetSettingsPanel() {
  const child = useCurrentChild();
  const save = useSaveDailyTargetMinutes();
  const [draft, setDraft] = useState<string | null>(null);
  const [custom, setCustom] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const savedValue = child.data?.daily_target_minutes ?? 60;
  const textValue = draft ?? String(savedValue);
  const value = Number(textValue);
  const isCustom = custom ?? !OPTIONS.some((minutes) => minutes === savedValue);
  const disabled = !child.data || save.isPending;
  const saveDisabled = disabled || draft === null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>학습 시간 기본값</Text>
      <Text style={styles.description}>
        오늘 이미 만들어진 계획은 유지되고, 이후 새 계획부터 적용돼요.
      </Text>
      <View style={styles.options}>
        {[OPTIONS.slice(0, 2), OPTIONS.slice(2)].map((row) => (
          <View key={row[0]} style={styles.row}>
            {row.map((minutes) => (
              <TimeChoice
                key={minutes}
                label={`${minutes}분`}
                selected={!isCustom && value === minutes}
                disabled={disabled}
                onPress={() => {
                  setCustom(false);
                  setDraft(String(minutes));
                  setMessage('');
                }}
              />
            ))}
          </View>
        ))}
        <TimeChoice
          label="직접 입력"
          fullWidth
          selected={isCustom}
          disabled={disabled}
          onPress={() => {
            setCustom(true);
            setMessage('');
          }}
        />
      </View>
      {isCustom && (
        <View style={styles.field}>
          <Text style={styles.label}>하루 목표 공부시간 (분)</Text>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="하루 목표 공부시간 (분)"
              value={textValue}
              editable={!disabled}
              keyboardType="number-pad"
              maxLength={3}
              autoComplete="off"
              onChangeText={(text) => {
                setDraft(text.replace(/\D/g, ''));
                setMessage('');
              }}
              style={styles.input}
            />
            <Text accessible={false} importantForAccessibility="no" style={styles.unit}>
              분
            </Text>
          </View>
          <Text style={styles.help}>10~240분 사이로 입력해 주세요.</Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled }}
        disabled={saveDisabled}
        style={[styles.save, saveDisabled && styles.saveDisabled]}
        onPress={() => {
          if (!child.data) return;
          if (!Number.isInteger(value) || value < 10 || value > 240) {
            setMessage('하루 목표는 10~240분 사이로 입력해 주세요.');
            return;
          }
          save.mutate(
            { childId: child.data.id, minutes: value },
            {
              onSuccess: () => {
                setDraft(null);
                setCustom(null);
                setMessage('학습 시간 기본값을 저장했어요.');
              },
              onError: () => setMessage('저장하지 못했어요. 다시 시도해 주세요.'),
            },
          );
        }}
      >
        <Text style={[styles.saveText, saveDisabled && styles.saveDisabledText]}>
          {save.isPending ? '저장 중…' : '기본 시간 저장'}
        </Text>
      </Pressable>
      {message && (
        <Text
          accessibilityRole="alert"
          style={[styles.message, message !== '학습 시간 기본값을 저장했어요.' && styles.error]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}

function TimeChoice({
  label,
  selected,
  disabled,
  fullWidth = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  fullWidth?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, !fullWidth && styles.column, selected && styles.selected]}
    >
      {selected && <Check {...dashboardIconProps} size={16} color={colors.primaryDark} />}
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: t.spacing[16],
    paddingVertical: t.spacing[20],
    backgroundColor: t.colors.card,
    borderRadius: t.radius.normal,
    ...t.border.card,
  },
  title: { ...t.typography.section, color: t.colors.textPrimary },
  description: {
    ...t.typography.body,
    lineHeight: 22,
    color: colors.primaryDark,
    marginTop: t.spacing[8],
  },
  options: { marginTop: t.spacing[24], gap: t.spacing[8] },
  row: { flexDirection: 'row', gap: t.spacing[8] },
  column: { flex: 1, minWidth: 0 },
  choice: {
    minHeight: t.icon.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[8],
    paddingVertical: t.spacing[12],
    paddingHorizontal: t.spacing[8],
    ...t.border.card,
    borderRadius: radius.button,
    backgroundColor: t.colors.card,
  },
  selected: { backgroundColor: colors.primaryLight, borderColor: t.colors.primary },
  choiceText: {
    fontSize: 15,
    lineHeight: 22,
    color: t.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'center',
  },
  selectedText: { color: colors.primaryDark, fontWeight: '700' },
  field: { marginTop: t.spacing[20], gap: t.spacing[8] },
  label: { ...t.typography.body, color: t.colors.textPrimary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[8],
    ...t.border.card,
    borderRadius: radius.button,
    backgroundColor: t.colors.background,
    paddingHorizontal: t.spacing[16],
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: t.spacing[12],
    paddingHorizontal: 0,
    fontSize: 20,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  unit: { ...t.typography.body, color: colors.primaryDark },
  help: { ...t.typography.caption, color: colors.primaryDark },
  save: {
    marginTop: t.spacing[24],
    minHeight: 52,
    padding: t.spacing[12],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    borderRadius: radius.button,
  },
  saveDisabled: { backgroundColor: t.colors.divider },
  saveText: { ...t.typography.button, color: t.colors.card, textAlign: 'center' },
  saveDisabledText: { color: colors.primaryDark },
  message: { ...t.typography.body, color: colors.primaryDark, marginTop: t.spacing[12] },
  error: { color: t.colors.danger },
});
