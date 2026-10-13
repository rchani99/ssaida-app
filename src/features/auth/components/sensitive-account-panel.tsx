import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';

import { createAccountActions } from '@/features/auth/services/account-actions';
import {
  describeRemaining,
  fetchPendingSensitiveActions,
} from '@/features/auth/services/pending-sensitive-actions';
import { subscribeSensitiveActions } from '@/features/auth/services/sensitive-action-events';
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
      '계정을 삭제하면 아이 정보, 공부 계획과 기록, 컬렉션과 성장 기록, 부모 PIN이 함께 삭제돼요. 요청한 뒤 14일이 지나면 앱을 다시 열지 않아도 자동으로 삭제돼요. 삭제 처리가 시작되기 전까지 취소할 수 있고, 삭제 후에는 복구할 수 없어요.',
    request: '계정 삭제 요청',
    waiting: '뒤부터 자동 삭제가 진행돼요. 그 전까지는 아무것도 삭제되지 않아요.',
    ready:
      '자동 삭제를 기다리고 있어요. 지금 직접 삭제를 완료할 수도 있어요. 삭제 처리가 시작되면 취소하거나 복구할 수 없어요.',
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
  onBusyChange,
  completionLabel = '확인',
}: {
  kind: 'deletion' | 'recovery';
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
  completionLabel?: string;
}) {
  const { clearDeletedAccount } = useNotifications();
  const [state, setState] = useState<SensitiveUiState>({ phase: 'intro', message: '' });
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const purpose = kind === 'deletion' ? 'delete_account' : 'reset_parent_pin';
  const text = copy[kind];
  const flow = useMemo(
    () =>
      createSensitiveActionUiFlow({
        purpose,
        enabled: () => sensitiveActionsEnabled(purpose),
        actions: () => createAccountActions({ clearNotifications: clearDeletedAccount }),
        changed: setState,
      }),
    [purpose, clearDeletedAccount],
  );
  const alive = useRef(true);
  const readVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const pending = await fetchPendingSensitiveActions();
      if (!alive.current || version !== readVersion.current) return;
      setReadError(false);
      const request = pending.find((entry) => entry.purpose === purpose) ?? null;
      if (!request) {
        setPin('');
        setConfirmation('');
      }
      flow.resume(request);
    } catch {
      if (alive.current && version === readVersion.current) setReadError(true);
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [flow, purpose]);
  useEffect(() => {
    alive.current = true;
    readVersion.current++;
    void Promise.resolve().then(() => {
      if (alive.current) void refresh();
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
      else {
        setPin('');
        setConfirmation('');
      }
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
      // Leaving the screen must never cancel a waiting period.
      flow.dismiss();
    };
  }, [flow, refresh]);
  const busy = ['requesting', 'executing', 'cancelling'].includes(state.phase);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  if (!sensitiveActionsEnabled(purpose)) return null;
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
            {kind === 'deletion' && (
              <LearningButton
                label={
                  deletionConfirmed
                    ? '✓ 자동 삭제와 복구 불가를 확인했어요'
                    : '자동 삭제와 복구 불가를 확인했어요'
                }
                variant="outline"
                onPress={() => setDeletionConfirmed(!deletionConfirmed)}
              />
            )}
            <LearningButton
              label={text.request}
              disabled={busy || !loaded || readError || (kind === 'deletion' && !deletionConfirmed)}
              onPress={() => {
                if (kind === 'deletion' && !deletionConfirmed) return;
                setDeletionConfirmed(false);
                void flow.start();
              }}
              variant="primary"
            />
          </>
        )}
        {busy && (
          <Text accessibilityRole="alert" style={s.text}>
            {state.phase === 'requesting'
              ? '요청을 접수하고 있어요…'
              : state.phase === 'cancelling'
                ? '요청을 취소하고 있어요…'
                : kind === 'deletion'
                  ? '계정 삭제 중이에요…'
                  : '새 PIN을 설정하고 있어요…'}
          </Text>
        )}
        {state.availableAt && (state.phase === 'waiting' || state.phase === 'ready') && (
          <Text style={s.secondary}>
            {`처리 가능: ${new Date(state.availableAt).toLocaleString('ko-KR')}\n유효 기한: ${new Date(state.expiresAt!).toLocaleString('ko-KR')}`}
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
                disabled={busy || readError}
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
                disabled={busy || readError || !/^[0-9]{4}$/.test(pin) || pin !== confirmation}
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
        {(readError || state.phase === 'error') && !busy && (
          <>
            {readError && (
              <Text accessibilityRole="alert" style={s.warning}>
                대기 상태를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.
              </Text>
            )}
            <LearningButton label="대기 상태 다시 확인" onPress={() => void refresh()} />
          </>
        )}
        {!busy && (
          <LearningButton
            label={state.phase === 'done' ? completionLabel : '닫기'}
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
