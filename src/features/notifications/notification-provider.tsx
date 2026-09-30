import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { ensureDailyPlan, fetchCurrentChild } from '@/features/learning/api/learning-api';
import { learningKeys } from '@/features/learning/hooks/use-learning';
import { fetchNotificationSnapshot } from '@/features/notifications/api';
import { NotificationContext } from '@/features/notifications/notification-context';
import { notificationPort as port } from '@/features/notifications/notification-port';
import {
  clearNotices,
  clearOtherAccounts,
  pruneSettings,
  reconcile,
} from '@/features/notifications/reconcile';
import {
  readPreferences,
  removePreferences,
  writePreferences,
} from '@/features/notifications/storage';
import { defaultSettings } from '@/features/notifications/types';
import { queryClient } from '@/lib/query-client';
import { refreshToday } from '@/shared/hooks/use-today';
import { toLocalDateString } from '@/shared/utils/date';

import type {
  NotificationSettings,
  NotificationTarget,
  Permission,
} from '@/features/notifications/types';
import type { PropsWithChildren } from 'react';

export function NotificationProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.session?.user.id ?? null;
  const eligible = !auth.isLoading && auth.profile?.onboarding_completed === true;
  const scope = eligible ? userId : null;
  const currentScope = useRef(scope);
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      currentScope.current = null;
    };
  }, [scope]);
  const queue = useRef(Promise.resolve());
  const [settings, setSettings] = useState({ ...defaultSettings });
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tap, setTap] = useState<NotificationTarget | null>(null);
  const [gateRequest, setGateRequest] = useState(0);
  const run = useCallback((job: () => Promise<void>) => {
    const work = queue.current.then(job);
    queue.current = work.catch(() => {});
    return work;
  }, []);
  const report = useCallback(
    () => setError('알림을 동기화하지 못했어요. 앱을 다시 열거나 설정을 확인해 주세요.'),
    [],
  );
  const sync = useCallback(async (id: string, current: () => boolean) => {
    await port.initialize();
    const prefs = await readPreferences(id);
    const allowed = await port.permission();
    if (!current()) return;
    setSettings((previous) =>
      JSON.stringify(previous) === JSON.stringify(prefs.settings) ? previous : prefs.settings,
    );
    setPermission(allowed);
    setReady(true);
    if (!port.supported || allowed !== 'granted' || !prefs.settings.notificationsEnabled) {
      await clearNotices(port);
      if (current()) setError(null);
      return;
    }
    await clearOtherAccounts(port, id);
    if (!current()) return;
    await pruneSettings(port, prefs.settings);
    const date = toLocalDateString();
    const snapshot = await queryClient.fetchQuery({
      queryKey: ['notifications', id, date],
      queryFn: () => fetchNotificationSnapshot(id, date),
      staleTime: 0,
    });
    if (!current() || date !== toLocalDateString()) return;
    if (!snapshot) {
      await clearNotices(port);
      return;
    }
    await reconcile(
      port,
      snapshot,
      prefs.settings,
      prefs.ledger,
      () => writePreferences(id, prefs.settings, prefs.ledger),
      () => current() && date === toLocalDateString(),
    );
    if (current()) setError(null);
  }, []);

  useEffect(() => port.listen(setTap), []);
  useEffect(() => {
    if (auth.isLoading) return;
    let active = true;
    const current = () => active && currentScope.current === scope;
    const start = async () => {
      if (!current()) return;
      await port.initialize();
      if (!current()) return;
      setReady(false);
      setSettings({ ...defaultSettings });
      if (!scope) {
        setGateRequest(0);
        await clearNotices(port);
        return;
      }
      // Remove schedules from any previous account before reading this account's data.
      // Own schedules remain intact across refresh/restart.
      const prefs = await readPreferences(scope);
      if (!current()) return;
      setSettings(prefs.settings);
      setReady(true);
      await sync(scope, current);
    };
    void run(start).catch(report);
    return () => {
      active = false;
    };
  }, [scope, auth.isLoading, run, sync, report]);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rolloverPending = false;
    const current = () => active && currentScope.current === scope;
    const refresh = (resume = false, dateOnly = false) => {
      const changed = refreshToday();
      if (changed) rolloverPending = true;
      // The foreground timer only checks the local date; no same-day network/OS sync.
      if (dateOnly && !changed) return;
      void run(async () => {
        if (!current()) return;
        const completingRollover = rolloverPending;
        if (rolloverPending) {
          const child = await fetchCurrentChild();
          if (!current()) return;
          if (child) await ensureDailyPlan(child.id, toLocalDateString());
          rolloverPending = false;
        }
        if (completingRollover || resume)
          await queryClient.invalidateQueries({ queryKey: learningKeys.all });
        if (current()) await sync(scope, current);
      }).catch(report);
    };
    refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refresh(false, true);
    }, 60_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh(true);
    });
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      // Coalesce a batch's invalidation/mutation updates; never invalidate on notification sync.
      clearTimeout(timer);
      timer = setTimeout(() => refresh(), 100);
    });
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(timer);
      listener.remove();
      unsubscribe();
    };
  }, [scope, run, sync, report]);

  const save = async (next: NotificationSettings) => {
    if (!scope || !ready) return;
    const id = scope;
    await run(async () => {
      if (currentScope.current !== id) return;
      const prefs = await readPreferences(id);
      await writePreferences(id, next, prefs.ledger);
      if (currentScope.current !== id) return;
      setSettings(next);
      await sync(id, () => currentScope.current === id);
    }).catch((error) => {
      report();
      throw error;
    });
  };
  const enable = async () => {
    if (!scope || !ready || !port.supported) return;
    const id = scope;
    await run(async () => {
      if (currentScope.current !== id) return;
      await port.initialize();
      const allowed = await port.permission(true);
      if (currentScope.current !== id) return;
      setPermission(allowed);
      if (allowed !== 'granted') return;
      const prefs = await readPreferences(id);
      const next = { ...prefs.settings, notificationsEnabled: true };
      await writePreferences(id, next, prefs.ledger);
      await sync(id, () => currentScope.current === id);
    }).catch((error) => {
      report();
      throw error;
    });
  };
  const clearDeletedAccount = async (id: string) => {
    if (currentScope.current && currentScope.current !== id) throw new Error('Account changed');
    // Invalidate running reconciliation before draining queued settings/ledger writes.
    currentScope.current = null;
    setReady(false);
    setTap(null);
    setGateRequest(0);
    await run(async () => {
      if (currentScope.current && currentScope.current !== id) {
        await removePreferences(id);
        throw new Error('Account changed');
      }
      const results = await Promise.allSettled([clearNotices(port), removePreferences(id)]);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Cleanup incomplete');
    });
  };
  return (
    <NotificationContext.Provider
      value={{
        settings,
        permission,
        ready,
        error,
        supported: port.supported,
        save,
        enable,
        tap,
        clearTap: () => setTap(null),
        gateRequest,
        requestGate: () => setGateRequest(Date.now()),
        clearGate: () => setGateRequest(0),
        clearDeletedAccount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
