import { planNotices } from '@/features/notifications/planner';
import { parseTime, prefix, signature } from '@/features/notifications/types';

import type {
  DeliveryLedger,
  NotificationPort,
  NotificationSettings,
  Snapshot,
} from '@/features/notifications/types';

export async function clearNotices(port: NotificationPort) {
  for (const notice of await port.scheduled())
    if (notice.id.startsWith(prefix)) await port.cancel(notice.id);
  for (const { id } of await port.presented()) if (id.startsWith(prefix)) await port.dismiss(id);
}

export async function clearOtherAccounts(port: NotificationPort, userId: string) {
  for (const notice of [...(await port.scheduled()), ...(await port.presented())]) {
    if (!notice.id.startsWith(prefix)) continue;
    let owner: unknown;
    try {
      owner = JSON.parse(notice.signature).target?.userId;
    } catch {
      /* Unknown legacy notice is not safe to retain. */
    }
    if (owner !== userId) {
      await port.cancel(notice.id);
      await port.dismiss(notice.id);
    }
  }
}

// Settings cancellation must work even if the subsequent DB refresh is offline.
export async function pruneSettings(
  port: NotificationPort,
  settings: NotificationSettings,
  now = new Date(),
) {
  for (const notice of await port.scheduled()) {
    let obsolete = false;
    if (notice.id.startsWith('ssaida:parent-check:')) {
      let oldTime: unknown;
      try {
        oldTime = JSON.parse(notice.signature).trigger;
      } catch {
        /* Cancel unknown metadata. */
      }
      obsolete =
        !settings.parentCheckReminderEnabled ||
        JSON.stringify(oldTime) !== JSON.stringify(parseTime(settings.parentCheckReminderTime));
    }
    if (notice.id.startsWith('ssaida:unfinished:')) {
      const time = parseTime(settings.unfinishedReminderTime);
      let at = new Date(NaN);
      try {
        at = new Date(JSON.parse(notice.signature).trigger.at);
      } catch {
        /* Cancel unknown metadata. */
      }
      obsolete =
        !settings.unfinishedReminderEnabled ||
        !time ||
        at.toDateString() !== now.toDateString() ||
        at.getHours() !== time.hour ||
        at.getMinutes() !== time.minute;
    }
    if (obsolete) {
      await port.cancel(notice.id);
      await port.dismiss(notice.id);
    }
  }
}

// Caller serializes reconciliation/settings writes and invalidates current() on account change.
export async function reconcile(
  port: NotificationPort,
  snapshot: Snapshot,
  settings: NotificationSettings,
  ledger: DeliveryLedger,
  saveLedger: () => Promise<void>,
  current: () => boolean,
  now = Date.now(),
) {
  const plan = planNotices(snapshot, settings, ledger, now);
  const existing = await port.scheduled();
  const presented = await port.presented();
  if (!current()) return;
  for (const notice of existing) {
    if (!current()) return;
    const desired = plan.scheduled.find((entry) => entry.id === notice.id);
    if (
      notice.id.startsWith(prefix) &&
      (desired ? signature(desired) !== notice.signature : !plan.keep.has(notice.id))
    )
      await port.cancel(notice.id);
  }
  for (const { id } of presented) {
    if (!current()) return;
    if (id.startsWith(prefix) && !plan.keep.has(id)) await port.dismiss(id);
  }
  for (const notice of plan.scheduled) {
    if (!current()) return;
    if (!existing.some((old) => old.id === notice.id && old.signature === signature(notice)))
      await port.schedule(notice);
  }
  for (const entry of plan.immediate) {
    if (!current()) return;
    // Reserve before dispatch: restart/crash cannot spam the same completion.
    // This prefers at-most-once over guaranteed delivery (no OS/AsyncStorage transaction).
    entry.keys.forEach((key) => {
      ledger[key] = true;
    });
    await saveLedger();
    if (!current()) return;
    try {
      await port.schedule(entry.notice);
    } catch (error) {
      entry.keys.forEach((key) => {
        delete ledger[key];
      });
      await saveLedger();
      throw error;
    }
  }
}
