import { createContext, useContext } from 'react';

import type {
  NotificationSettings,
  NotificationTarget,
  Permission,
} from '@/features/notifications/types';

export type NotificationContextValue = {
  settings: NotificationSettings;
  permission: Permission;
  ready: boolean;
  supported: boolean;
  error: string | null;
  save(settings: NotificationSettings): Promise<void>;
  enable(): Promise<void>;
  tap: NotificationTarget | null;
  clearTap(): void;
  gateRequest: number;
  requestGate(): void;
  clearGate(): void;
  clearDeletedAccount(userId: string): Promise<void>;
};
export const NotificationContext = createContext<NotificationContextValue | null>(null);
export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('NotificationProvider is required');
  return value;
}
