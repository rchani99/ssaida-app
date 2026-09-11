import type { NotificationPort } from '@/features/notifications/types';

// Web/SSR must not import or invoke native notification APIs.
export const notificationPort: NotificationPort = {
  supported: false,
  initialize: async () => {},
  permission: async () => 'denied',
  scheduled: async () => [],
  presented: async () => [],
  schedule: async () => {},
  cancel: async () => {},
  dismiss: async () => {},
  listen: () => () => {},
};
