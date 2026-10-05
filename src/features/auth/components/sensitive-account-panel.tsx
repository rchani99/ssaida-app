import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';

import { createAccountActions } from '@/features/auth/services/account-actions';
import {
  describeRemaining,
  fetchPendingSensitiveActions,
} from '@/features/auth/services/pending-sensitive-actions';
import { createSensitiveActionUiFlow } from '@/features/auth/services/sensitive-action-ui-flow';
import { sensitiveActionsEnabled } from '@/features/auth/services/sensitive-actions-enabled';
import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useNotifications } from '@/features/notifications/notification-context';

import type { SensitiveUiState } from '@/features/auth/services/sensitive-action-ui-flow';

const copy = {
  deletion: {
    title: '계정 삭제',
    intro:
      '계정을 삭제하면 아이 정보, 공부 계획과 기록, 컬렉션과 성장 기록, 부모 PIN이 함께 삭제돼요. 바로 삭제되지 않고 14일 동안 기다린 뒤 이 화면에서 삭제를 완료해요. 기다리는 동안에는 언제든 취소할 수 있어요.',
    request: '계정 삭제 요청',
    waiting: '뒤에 계정을 삭제할 수 있어요. 그 전까지는 아무것도 삭제되지 않아요.',
    ready: '대기 기간이 끝났어요. 지금 삭제하면 되돌릴 수 없어요.',
    confirm: '계정 영구 삭제',
    cancel: '삭제 요청 취소',
  },
  recovery: {
    title: '부모 PIN 재설정',
    intro:
      '현재 PIN을 몰라도 재설정할 수 있어요. 요청하면 72시간 뒤에 새 PIN을 정할 수 있어요. 기다리는 동안 현재 PIN으로 부모님 모드에 한 번이라도 들어가면 요청이 자동으로 취소돼요.',
    request: 'PIN 재설정 요청',
    waiting: '뒤에 새 PIN을 정할 수 있어요.',
    ready: '이제 새 PIN을 정할 수 있어요.',
    confirm: 'PIN 재설정',
    cancel: '재설정 요청 취소',
  },
} as const;

export function SensitiveAccountPanel({
  kind,
  onClose,
}: {
  kind: 'deletion' | 'recovery';
  onClose?: () => void;
}) {
  const { clearDeletedAccount } = useNotifications();
  const [state, setState] = useState<SensitiveUiState>({ phase: 'intro', message: '' });
  const [loaded, setLoaded] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const purpose = kind === 'deletion' ? 'delete_account' : 'reset_parent_pin';
  const text = copy[kind];
  const flow = useMemo(
    () =>
      createSensitiveActionUiFlow({
        purpose,
        enabled: sensitiveActionsEnabled,
        actions: () => createAccountActions({ clearNotifications: clearDeletedAccount }),
        changed: setState,
      }),
    [purpose, clearDeletedAccount],
  );
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const pending = await fetchPendingSensitiveActions();
      if (!alive.current) return;
      flow.resume(pending.find((entry) => entry.purpose === purpose) ?? null);
    } catch {
      /* The waiting period lives on the server; a failed read only delays the display. */
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [flow, purpose]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      subscription.remove();
      // Leaving the screen must never cancel a waiting period.
      flow.dismiss();
    };
  }, [flow, refresh]);
  if (!sensitiveActionsEnabled()) return null;
  const busy = state.phase === 'requesting' || state.phase === 'executing';
  const remaining = state.availableAt ? describeRemaining(state.availableAt) : null;
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={s.panel}>
        <Text accessibilityRole="header" style={s.title}>
          {text.title}
        </Text>
        {(state.phase === 'intro' || state.phase === 'error') && (
          <>
            <Text style={s.secondary}>{text.intro}</Text>
            <LearningButton
              label={text.request}
              disabled={busy || !loaded}
              onPress={() => void flow.start()}
              variant="primary"
            />
          </>
        )}
        {busy && (
          <Text accessibilityRole="alert" style={s.text}>
            {state.phase === 'requesting'
              ? '요청을 접수하고 있어요…'
              : kind === 'deletion'
                ? '계정 삭제 중이에요…'
                : '새 PIN을 설정하고 있어요…'}
          </Text>
        )}
        {state.phase === 'waiting' && (
          <>
            <Text style={s.warning}>{remaining ? `${remaining} ${text.waiting}` : text.ready}</Text>
            <Text style={s.secondary}>
              {kind === 'recovery'
                ? '현재 PIN으로 부모님 모드에 들어가면 이 요청은 취소돼요.'
                : '기다리는 동안 데이터는 그대로 유지돼요.'}
            </Text>
          </>
        )}
        {state.phase === 'ready' &&
          (kind === 'deletion' ? (
            <>
              <Text style={s.warning}>{text.ready}</Text>
              <LearningButton
                label={text.confirm}
                disabled={busy}
                onPress={() => void flow.execute()}
                variant="primary"
              />
            </>
          ) : (
            <>
              <Text style={s.text}>{text.ready}</Text>
              <LearningField
                label="새 PIN"
                value={pin}
                onChangeText={setPin}
                numeric
                secure
                maxLength={4}
              />
              <LearningField
                label="새 PIN 확인"
                value={confirmation}
                onChangeText={setConfirmation}
                numeric
                secure
                maxLength={4}
              />
              <LearningButton
                label={text.confirm}
                disabled={busy || !/^[0-9]{4}$/.test(pin) || pin !== confirmation}
                variant="primary"
                onPress={() => {
                  const work = flow.execute(pin, confirmation);
                  setPin('');
                  setConfirmation('');
                  void work;
                }}
              />
            </>
          ))}
        {(state.phase === 'waiting' || state.phase === 'ready') && (
          <LearningButton label={text.cancel} disabled={busy} onPress={() => void flow.cancel()} />
        )}
        {!!state.message && (
          <Text accessibilityRole="alert" style={s.secondary}>
            {state.message}
          </Text>
        )}
        {state.phase !== 'executing' && (
          <LearningButton
            label={state.phase === 'done' ? '확인' : '닫기'}
            onPress={() => {
              setPin('');
              setConfirmation('');
              flow.dismiss();
              onClose?.();
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}
