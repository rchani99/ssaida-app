import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { dashboardTokens as t, colors } from '@/design-system/tokens';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useNotifications } from '@/features/notifications/notification-context';
import { parseTime } from '@/features/notifications/types';

import { NotificationTimeField } from './notification-time-field';

export function NotificationSettingsPanel() {
  const notifications = useNotifications();
  const { settings, permission, ready, supported } = notifications;
  const [edits, setEdits] = useState<Partial<typeof settings>>({});
  const draft = { ...settings, ...edits };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch {
      setMessage('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  if (!supported)
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>알림</Text>
        <Text style={styles.secondary}>알림 설정은 Android/iOS 앱에서 사용할 수 있어요.</Text>
      </View>
    );
  return (
    <View style={styles.panel}>
      <View style={styles.introduction}>
      <Text style={styles.title}>알림</Text>
      <Text style={styles.secondary}>
        공부 확인 시간을 놓치지 않도록 알려드릴게요.
      </Text>
      <Text style={styles.secondary}>이 기기에서만 알림을 받아요.</Text>
      <View style={styles.permissionRow}>
      <Text style={styles.secondary}>권한 상태</Text>
      <Text style={styles.permissionValue}>
        {permission === 'granted'
          ? '허용됨'
          : permission === 'denied'
            ? '허용 안 됨'
            : '아직 요청하지 않음'}
      </Text>
      </View>
      {permission === 'denied' ? (
        <>
          <Text style={s.secondary}>설정에서 알림을 켜주세요. 알림 없이도 공부할 수 있어요.</Text>
          <LearningButton
            label="기기 알림 설정 열기"
            variant="outline"
            compact
            onPress={() => void perform(() => Linking.openSettings())}
            disabled={busy}
          />
        </>
      ) : (
        <LearningButton
          label={settings.notificationsEnabled ? '알림 끄기' : '설명을 확인했어요 · 알림 켜기'}
          variant="outline"
          compact
          disabled={!ready || busy}
          onPress={() =>
            void perform(() =>
              settings.notificationsEnabled
                ? notifications.save({ ...settings, notificationsEnabled: false })
                : notifications.enable(),
            )
          }
        />
      )}
      </View>
      {(['parentCheck', 'unfinished'] as const).map((kind) => {
        const enabledKey =
          kind === 'parentCheck' ? 'parentCheckReminderEnabled' : 'unfinishedReminderEnabled';
        const timeKey =
          kind === 'parentCheck' ? 'parentCheckReminderTime' : 'unfinishedReminderTime';
        const label = kind === 'parentCheck' ? '부모 확인시간 알림' : '마감 전 미완료 알림';
        return (
          <View key={kind} style={styles.block}>
            <View style={styles.blockHeading}>
            <Text style={styles.blockTitle}>{label}</Text>
            <Switch
              accessibilityLabel={label}
              value={draft[enabledKey]}
              disabled={!ready || busy}
              trackColor={{ false: t.colors.divider, true: colors.primaryLight }}
              thumbColor={draft[enabledKey] ? t.colors.primary : t.colors.card}
              onValueChange={(value) =>
                setEdits((current) => ({ ...current, [enabledKey]: value }))
              }
            />
            </View>
            <Text style={styles.caption}>{label} 시간 (24시간 HH:MM)</Text>
            <NotificationTimeField
              label={label}
              value={draft[timeKey]}
              onChange={(value) => setEdits((current) => ({ ...current, [timeKey]: value }))}
              disabled={!ready || busy || !draft[enabledKey]}
            />
          </View>
        );
      })}
      <View style={styles.saveArea}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || busy, busy }}
        style={[styles.saveButton, (!ready || busy) && styles.disabled]}
        disabled={!ready || busy}
        onPress={() => {
          if (
            (draft.parentCheckReminderEnabled && !parseTime(draft.parentCheckReminderTime)) ||
            (draft.unfinishedReminderEnabled && !parseTime(draft.unfinishedReminderTime))
          ) {
            setMessage('시간은 24시간 형식 HH:MM으로 입력해 주세요.');
            return;
          }
          void perform(async () => {
            await notifications.save(draft);
            setEdits({});
            setMessage('알림 설정을 저장했어요.');
          });
        }}
      >
        <Text style={styles.saveText}>알림 설정 저장</Text>
      </Pressable>
      <Text style={styles.caption}>
        전체 알림이 켜져 있고 권한이 허용되어야 예약돼요.
      </Text>
      <Text style={styles.caption}>절전 모드에서는 설정 시각보다 늦게 표시될 수 있어요.</Text>
      </View>
      {notifications.error && (
        <Text accessibilityRole="alert" style={s.error}>
          {notifications.error}
        </Text>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: t.spacing[16], gap: t.spacing[20], backgroundColor: t.colors.card, ...t.border.card, borderRadius: t.radius.normal, ...t.shadow },
  introduction: { gap: t.spacing[8] },
  title: { ...t.typography.section, color: t.colors.textPrimary },
  secondary: { ...t.typography.body, color: t.colors.textSecondary },
  caption: { ...t.typography.caption, color: t.colors.textSecondary },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing[8], paddingVertical: t.spacing[4] },
  permissionValue: { ...t.typography.body, fontWeight: '600', color: t.colors.textPrimary },
  block: { borderTopWidth: 1, borderTopColor: t.colors.dividerSoft, paddingTop: t.spacing[16], gap: t.spacing[8] },
  blockHeading: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[12] },
  blockTitle: { ...t.typography.cardTitle, color: t.colors.textPrimary, flex: 1 },
  saveArea: { gap: t.spacing[8] },
  saveButton: { minHeight: t.icon.touchMin, paddingVertical: t.spacing[8], paddingHorizontal: t.spacing[16], alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.primary, borderRadius: t.radius.normal },
  saveText: { ...t.typography.button, color: t.colors.card, textAlign: 'center' },
  disabled: { opacity: 0.45 },
});
