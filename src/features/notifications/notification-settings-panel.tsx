import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useNotifications } from '@/features/notifications/notification-context';
import { parseTime } from '@/features/notifications/types';

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
      <View style={s.panel}>
        <Text style={s.title}>알림</Text>
        <Text style={s.secondary}>알림 설정은 Android/iOS 앱에서 사용할 수 있어요.</Text>
      </View>
    );
  return (
    <View style={s.panel}>
      <Text style={s.title}>알림</Text>
      <Text style={s.secondary}>
        공부 확인 시간을 놓치지 않도록 알려드릴게요. 이 기기에서만 알림을 받아요.
      </Text>
      <Text style={s.secondary}>
        권한:{' '}
        {permission === 'granted'
          ? '허용됨'
          : permission === 'denied'
            ? '허용 안 됨'
            : '아직 요청하지 않음'}
      </Text>
      {permission === 'denied' ? (
        <>
          <Text style={s.secondary}>설정에서 알림을 켜주세요. 알림 없이도 공부할 수 있어요.</Text>
          <LearningButton
            label="기기 알림 설정 열기"
            onPress={() => void perform(() => Linking.openSettings())}
            disabled={busy}
          />
        </>
      ) : (
        <LearningButton
          label={settings.notificationsEnabled ? '알림 끄기' : '설명을 확인했어요 · 알림 켜기'}
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
      {(['parentCheck', 'unfinished'] as const).map((kind) => {
        const enabledKey =
          kind === 'parentCheck' ? 'parentCheckReminderEnabled' : 'unfinishedReminderEnabled';
        const timeKey =
          kind === 'parentCheck' ? 'parentCheckReminderTime' : 'unfinishedReminderTime';
        const label = kind === 'parentCheck' ? '부모 확인시간 알림' : '마감 전 미완료 알림';
        return (
          <View key={kind} style={s.card}>
            <Text style={s.text}>{label}</Text>
            <Switch
              accessibilityLabel={label}
              value={draft[enabledKey]}
              disabled={!ready || busy}
              onValueChange={(value) =>
                setEdits((current) => ({ ...current, [enabledKey]: value }))
              }
            />
            <LearningField
              label={`${label} 시간 (24시간 HH:MM)`}
              value={draft[timeKey]}
              onChangeText={(value) => setEdits((current) => ({ ...current, [timeKey]: value }))}
              disabled={!ready || busy}
            />
          </View>
        );
      })}
      <LearningButton
        label="알림 설정 저장"
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
      />
      <Text style={s.secondary}>
        전체 알림이 켜져 있고 권한이 허용되어야 예약돼요. 절전 모드에서는 설정 시각보다 늦게 표시될
        수 있어요.
      </Text>
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
