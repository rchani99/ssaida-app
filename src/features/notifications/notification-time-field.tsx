import NativeTimePicker from '@expo/ui/community/datetime-picker';
import { ChevronRight, Clock3 } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import { parseTime } from '@/features/notifications/types';

export function NotificationTimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [selection, setSelection] = useState<Date | null>(null);
  const parsed = parseTime(value);
  const close = () => setSelection(null);
  const confirm = (date: Date) => {
    if (!disabled)
      onChange(
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      );
    close();
  };
  const picker = selection && !disabled && (
    <NativeTimePicker
      value={selection}
      mode="time"
      is24Hour
      locale="en_GB"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      presentation="dialog"
      accentColor={t.colors.primary}
      positiveButton={{ label: '확인' }}
      negativeButton={{ label: '취소' }}
      onDismiss={close}
      onValueChange={(_, date) => (Platform.OS === 'ios' ? setSelection(date) : confirm(date))}
    />
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 시간, ${parsed ? `현재 ${parsed.hour}시 ${String(parsed.minute).padStart(2, '0')}분` : '선택되지 않음'}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.field, disabled && styles.inactive]}
        onPress={() => {
          if (disabled) return;
          const initial = new Date();
          if (parsed) initial.setHours(parsed.hour, parsed.minute, 0, 0);
          else initial.setSeconds(0, 0);
          setSelection(initial);
        }}
      >
        <Clock3 {...dashboardIconProps} size={t.icon.size.small} color={t.colors.textSecondary} />
        <Text style={[styles.value, disabled && styles.muted]}>{value || '시간 선택'}</Text>
        <ChevronRight
          {...dashboardIconProps}
          size={t.icon.size.small}
          color={t.colors.textSecondary}
        />
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Modal
          visible={selection !== null && !disabled}
          transparent
          animationType="fade"
          onRequestClose={close}
        >
          <View style={styles.overlay}>
            <View style={styles.dialog} accessibilityViewIsModal>
              <Text style={styles.title}>{label} 시간</Text>
              {picker}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={close} style={styles.cancel}>
                  <Text style={styles.value}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => selection && confirm(selection)}
                  style={styles.confirm}
                >
                  <Text style={styles.confirmText}>확인</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[8],
    minHeight: t.icon.touchMin,
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[8],
    ...t.border.card,
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.card,
  },
  value: { ...t.typography.body, color: t.colors.textPrimary, flexShrink: 1, flexGrow: 1 },
  inactive: { backgroundColor: t.colors.background, borderColor: t.colors.divider },
  muted: { color: t.colors.textSecondary },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: t.spacing[20],
    backgroundColor: 'rgba(29,35,32,0.25)',
  },
  dialog: {
    backgroundColor: t.colors.card,
    borderRadius: t.radius.normal,
    padding: t.spacing[16],
    gap: t.spacing[12],
  },
  title: { ...t.typography.cardTitle, color: t.colors.textPrimary },
  actions: { flexDirection: 'row', gap: t.spacing[8] },
  cancel: {
    flex: 1,
    minHeight: t.icon.touchMin,
    padding: t.spacing[12],
    alignItems: 'center',
    justifyContent: 'center',
    ...t.border.card,
    borderRadius: t.radius.normal,
  },
  confirm: {
    flex: 1,
    minHeight: t.icon.touchMin,
    padding: t.spacing[12],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.normal,
  },
  confirmText: { ...t.typography.button, color: t.colors.card },
});
