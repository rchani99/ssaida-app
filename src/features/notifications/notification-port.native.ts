import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { prefix, signature } from '@/features/notifications/types';

import type { NotificationPort, NotificationTarget } from '@/features/notifications/types';

const channelId = 'ssaida-reminders';
export const notificationPort: NotificationPort = {
  supported: true,
  initialize: async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(channelId, {
        name: '공부 확인 및 리마인드',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
  },
  permission: async (request = false) => {
    let result = await Notifications.getPermissionsAsync();
    if (request && result.status === 'undetermined' && result.canAskAgain)
      result = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: false },
      });
    if (Platform.OS === 'ios') {
      if (
        [
          Notifications.IosAuthorizationStatus.AUTHORIZED,
          Notifications.IosAuthorizationStatus.PROVISIONAL,
          Notifications.IosAuthorizationStatus.EPHEMERAL,
        ].includes(result.ios?.status ?? Notifications.IosAuthorizationStatus.NOT_DETERMINED)
      )
        return 'granted';
    } else if (result.granted) return 'granted';
    return result.status === 'undetermined' && result.canAskAgain ? 'undetermined' : 'denied';
  },
  scheduled: async () =>
    (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
      id: request.identifier,
      signature: String(request.content.data?.signature ?? ''),
    })),
  presented: async () =>
    (await Notifications.getPresentedNotificationsAsync()).map((notice) => ({
      id: notice.request.identifier,
      signature: String(notice.request.content.data?.signature ?? ''),
    })),
  schedule: async (notice) => {
    await Notifications.scheduleNotificationAsync({
      identifier: notice.id,
      content: {
        title: notice.title,
        body: notice.body,
        data: { ...notice.target, signature: signature(notice) },
      },
      trigger:
        notice.trigger === null
          ? { channelId }
          : 'at' in notice.trigger
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(notice.trigger.at),
                channelId,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                ...notice.trigger,
                channelId,
              },
    });
  },
  cancel: Notifications.cancelScheduledNotificationAsync,
  dismiss: Notifications.dismissNotificationAsync,
  listen: (callback) => {
    let last = '';
    let active = true;
    const receive = (response: Notifications.NotificationResponse | null) => {
      if (
        !active ||
        !response ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      const { request, date } = response.notification;
      const key = `${request.identifier}:${date}`;
      if (!request.identifier.startsWith(prefix) || key === last) return;
      last = key;
      const data = request.content.data;
      if (
        typeof data?.userId === 'string' &&
        typeof data.childId === 'string' &&
        (data.destination === 'parent' || data.destination === 'child')
      )
        callback(data as NotificationTarget);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const listener = Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync()
      .then(receive)
      .catch(() => {});
    return () => {
      active = false;
      listener.remove();
    };
  },
};
