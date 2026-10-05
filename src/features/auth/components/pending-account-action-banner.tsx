import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';
import {
  describeRemaining,
  fetchPendingSensitiveActions,
} from '@/features/auth/services/pending-sensitive-actions';

import type { PendingSensitiveAction } from '@/features/auth/services/pending-sensitive-actions';

// Visibility is half of what replaces identity re-proof: a waiting period nobody can hide.
// Display only, on every screen. Cancelling a deletion lives in parent settings behind the
// PIN, and entering the PIN already cancels a waiting PIN reset by itself.
export function PendingAccountActionBanner() {
  const [pending, setPending] = useState<PendingSensitiveAction[]>([]);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const actions = await fetchPendingSensitiveActions();
      if (alive.current) setPending(actions);
    } catch {
      /* Keep the last known state; the server remains the source of truth. */
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    // Deferred so the first read is an external subscription, not a synchronous effect render.
    void Promise.resolve().then(() => {
      if (alive.current) void refresh();
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      subscription.remove();
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
              ? remaining
                ? `계정 삭제가 요청됐어요 · ${remaining} 뒤 삭제 가능 · 요청하지 않았다면 설정에서 취소해 주세요`
                : '계정 삭제 대기 기간이 끝났어요 · 요청하지 않았다면 설정에서 취소해 주세요'
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
