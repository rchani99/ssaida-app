import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';
import { ensureDeletionWatch } from '@/features/auth/services/deletion-watch';
import {
  describeRemaining,
  fetchPendingSensitiveActions,
} from '@/features/auth/services/pending-sensitive-actions';
import { subscribeSensitiveActions } from '@/features/auth/services/sensitive-action-events';

import type { PendingSensitiveAction } from '@/features/auth/services/pending-sensitive-actions';

// Visibility is half of what replaces identity re-proof: a waiting period nobody can hide.
// Display only, on every screen. Cancelling a deletion lives in parent settings behind the
// PIN, and entering the PIN already cancels a waiting PIN reset by itself.
export function PendingAccountActionBanner() {
  const [pending, setPending] = useState<PendingSensitiveAction[]>([]);
  const alive = useRef(true);
  const readVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const actions = await fetchPendingSensitiveActions();
      if (alive.current && version === readVersion.current) setPending(actions);
      if (alive.current && actions.some((action) => action.purpose === 'delete_account'))
        await ensureDeletionWatch();
    } catch {
      /* Keep the last known state; the server remains the source of truth. */
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    readVersion.current++;
    // Deferred so the first read is an external subscription, not a synchronous effect render.
    void Promise.resolve().then(() => {
      if (alive.current) void refresh();
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    const unsubscribe = subscribeSensitiveActions(() => void refresh());
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30_000);
    return () => {
      alive.current = false;
      subscription.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);
  if (!pending.length) return null;
  return (
    <View style={styles.container}>
      {pending.map((action) => {
        const remaining = describeRemaining(action.availableAt);
        return (
          <Text accessibilityRole="alert" key={action.purpose} style={styles.text}>
            {action.purpose === 'delete_account'
              ? action.processing
                ? '계정 삭제 처리 중이에요 · 삭제가 시작되어 취소할 수 없어요'
                : remaining
                  ? `계정 삭제가 요청됐어요 · ${remaining} 뒤부터 자동 삭제 · 요청하지 않았다면 설정에서 취소해 주세요`
                  : '자동 삭제를 기다리고 있어요 · 처리가 시작되기 전까지 설정에서 취소할 수 있어요'
              : remaining
                ? `부모 PIN 재설정이 요청됐어요 · ${remaining} 뒤 변경 가능 · 현재 PIN으로 부모님 모드에 들어가면 취소돼요`
                : '부모 PIN 재설정 대기 기간이 끝났어요 · 현재 PIN으로 부모님 모드에 들어가면 취소돼요'}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderBottomLeftRadius: radius.button,
    borderBottomRightRadius: radius.button,
  },
  text: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
