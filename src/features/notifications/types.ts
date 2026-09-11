import type { DailyPlan, DailyTask } from '@/features/learning/types/learning.types';

export type NotificationSettings = {
  notificationsEnabled: boolean;
  parentCheckReminderEnabled: boolean;
  parentCheckReminderTime: string;
  unfinishedReminderEnabled: boolean;
  unfinishedReminderTime: string;
};
export const defaultSettings: NotificationSettings = {
  notificationsEnabled: false,
  parentCheckReminderEnabled: false,
  parentCheckReminderTime: '',
  unfinishedReminderEnabled: false,
  unfinishedReminderTime: '',
};
export type Permission = 'granted' | 'denied' | 'undetermined';
export type NotificationTarget = {
  userId: string;
  childId: string;
  destination: 'parent' | 'child';
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  target: NotificationTarget;
  trigger: null | { hour: number; minute: number } | { at: number };
};
export type ScheduledNotice = { id: string; signature: string };
export type NotificationPort = {
  supported: boolean;
  initialize(): Promise<void>;
  permission(request?: boolean): Promise<Permission>;
  scheduled(): Promise<ScheduledNotice[]>;
  presented(): Promise<ScheduledNotice[]>;
  schedule(notice: Notice): Promise<void>;
  cancel(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  listen(callback: (target: NotificationTarget) => void): () => void;
};
export type Snapshot = {
  userId: string;
  childId: string;
  date: string;
  plan: DailyPlan | null;
  tasks: DailyTask[];
  pending: (DailyTask & { daily_plans: { day_type: string } })[];
};
// Delivery metadata only, never a persisted copy of learning data or PIN/session.
export type DeliveryLedger = Record<string, true>;
export const prefix = 'ssaida:';
export function signature(notice: Notice) {
  return JSON.stringify(notice);
}
export function parseTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}
