import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultSettings, parseTime } from '@/features/notifications/types';

import type { DeliveryLedger, NotificationSettings } from '@/features/notifications/types';

const key = (userId: string) => `ssaida.notifications.v1:${userId}`;
export async function readPreferences(
  userId: string,
): Promise<{ settings: NotificationSettings; ledger: DeliveryLedger }> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return { settings: { ...defaultSettings }, ledger: {} };
  const fallback = () => ({ settings: { ...defaultSettings }, ledger: {} });
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return fallback();
  }
  const isRecord = (value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (
    !isRecord(stored) ||
    (stored.settings !== undefined && !isRecord(stored.settings)) ||
    (stored.ledger !== undefined && !isRecord(stored.ledger))
  )
    return fallback();
  const settings = { ...defaultSettings };
  for (const field of [
    'notificationsEnabled',
    'parentCheckReminderEnabled',
    'unfinishedReminderEnabled',
  ] as const)
    settings[field] = stored.settings?.[field] === true;
  for (const field of ['parentCheckReminderTime', 'unfinishedReminderTime'] as const)
    settings[field] =
      typeof stored.settings?.[field] === 'string' && parseTime(stored.settings[field])
        ? stored.settings[field]
        : '';
  const ledger = Object.fromEntries(
    Object.entries(stored.ledger ?? {}).filter(([, value]) => value === true),
  ) as DeliveryLedger;
  return { settings, ledger };
}
export function writePreferences(
  userId: string,
  settings: NotificationSettings,
  ledger: DeliveryLedger,
) {
  return AsyncStorage.setItem(key(userId), JSON.stringify({ settings, ledger }));
}
