import { SplashScreen } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, View } from 'react-native';

import {
  accountRecovery,
  subscribeAccountRecovery,
} from '@/features/auth/services/account-recovery';
import { ScreenMessage } from '@/shared/components/screen-message';

// Mount outside Auth/Notification providers, so no account query or notification writer
// starts before a pending cleanup is finished. Errors keep this gate closed.
export function AccountRecoveryGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<
    'loading' | 'clear' | 'complete' | 'unknown' | 'pending' | 'expired' | 'failed' | 'retry'
  >('loading');
  const generation = useRef(0);
  const completed = useRef(false);
  const inspect = useCallback(async () => {
    const request = ++generation.current;
    try {
      const marker = await accountRecovery.read();
      if (request !== generation.current) return;
      if (!marker) {
        setState(completed.current ? 'complete' : 'clear');
        return;
      }
      if (marker.phase === 'cleanup') completed.current = true;
      void SplashScreen.hideAsync();
      if (marker.phase === 'unconfirmed' && !marker.operation) {
        setState('unknown');
        return;
      }
      setState('loading');
      await accountRecovery.resume();
      if (request === generation.current) {
        completed.current = true;
        setState('complete');
      }
    } catch (error) {
      if (request !== generation.current) return;
      void SplashScreen.hideAsync();
      const code = error instanceof Error ? error.message : '';
      setState(
        code === 'DELETE_PENDING'
          ? 'pending'
          : code === 'DELETE_RECEIPT_EXPIRED'
            ? 'expired'
            : code === 'DELETE_NOT_EXECUTED'
              ? 'failed'
              : 'retry',
      );
    }
  }, []);
  useEffect(() => {
    const lifecycle = generation;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void inspect();
    });
    const unsubscribe = subscribeAccountRecovery(() => {
      void inspect();
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void inspect();
    });
    return () => {
      active = false;
      lifecycle.current++;
      unsubscribe();
      subscription.remove();
    };
  }, [inspect]);
  if (state === 'clear') return children;
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <ScreenMessage
        loading={state === 'loading'}
        message={
          state === 'complete'
            ? '계정 삭제가 완료됐어요'
            : state === 'unknown'
              ? '계정 삭제 결과 확인이 필요해요. 자동으로 다시 삭제 요청을 보내거나 기기 데이터를 지우지 않아요.'
              : state === 'pending'
                ? '서버에서 삭제 결과를 아직 확인하지 못했어요. 기기 데이터를 유지하며 나중에 다시 확인할 수 있어요.'
                : state === 'expired'
                  ? '삭제 확인 영수증이 만료됐거나 확인할 수 없어요. 기기 데이터는 유지되며 지원을 통한 확인이 필요해요.'
                  : state === 'failed'
                    ? '이 삭제 요청은 실행되지 않았어요. 기기 데이터는 유지되며 지원을 통한 확인이 필요해요.'
                    : state === 'retry'
                      ? '기기 데이터 정리가 완료되지 않았어요. 다시 시도해 주세요.'
                      : '기기 데이터를 확인하고 있어요.'
        }
        actionLabel={
          state === 'complete'
            ? '로그인 화면으로'
            : state === 'retry'
              ? '정리 다시 시도'
              : ['pending', 'expired', 'failed'].includes(state)
                ? '삭제 결과 다시 확인'
                : undefined
        }
        onAction={
          state === 'complete'
            ? () => {
                completed.current = false;
                setState('clear');
              }
            : ['retry', 'pending', 'expired', 'failed'].includes(state)
              ? () => {
                  void inspect();
                }
              : undefined
        }
      />
    </View>
  );
}
