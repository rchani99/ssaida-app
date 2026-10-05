import type { AccountActions } from './account-actions';
import type { PendingSensitiveAction } from './pending-sensitive-actions';
import type { SensitivePurpose } from './sensitive-action-flow';

export type SensitiveUiState = {
  phase: 'intro' | 'requesting' | 'waiting' | 'ready' | 'executing' | 'done' | 'error';
  message: string;
  availableAt?: string;
  expiresAt?: string;
};
export function createSensitiveActionUiFlow(deps: {
  purpose: SensitivePurpose;
  enabled(): boolean;
  actions(): AccountActions;
  changed(state: SensitiveUiState): void;
  now?(): number;
}) {
  const now = () => deps.now?.() ?? Date.now();
  let actions: AccountActions | undefined;
  let phase: SensitiveUiState['phase'] = 'intro';
  let generation = 0;
  let availableAt: string | undefined;
  let expiresAt: string | undefined;
  const report = (next: SensitiveUiState['phase'], message = '') => {
    phase = next;
    deps.changed({ phase: next, message, availableAt, expiresAt });
  };
  const settle = (message = '') => {
    if (!availableAt) {
      report('intro', message);
      return;
    }
    report(now() >= Date.parse(availableAt) ? 'ready' : 'waiting', message);
  };
  const flow = () => {
    if (!actions) actions = deps.actions();
    return actions;
  };
  return {
    // Reflects an existing waiting period without creating one. Opening the screen must
    // never start a countdown on its own.
    resume(pending: PendingSensitiveAction | null) {
      if (['requesting', 'executing', 'done'].includes(phase)) return;
      availableAt = pending?.availableAt;
      expiresAt = pending?.expiresAt;
      settle();
    },
    async start() {
      if (!deps.enabled() || ['requesting', 'executing', 'done'].includes(phase)) return;
      const current = ++generation;
      report('requesting');
      try {
        const request = await flow().begin(deps.purpose);
        if (current !== generation) return;
        availableAt = request.availableAt;
        expiresAt = request.expiresAt;
        settle();
      } catch {
        if (current === generation)
          report('error', '요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    },
    async execute(pin?: string, confirmation?: string) {
      if (!deps.enabled() || phase !== 'ready') return;
      if (
        deps.purpose === 'reset_parent_pin' &&
        (!/^[0-9]{4}$/.test(pin ?? '') || pin !== confirmation)
      ) {
        report('ready', '숫자 4자리 새 PIN을 두 번 똑같이 입력해 주세요.');
        return;
      }
      const current = ++generation;
      report('executing');
      try {
        // begin() is idempotent, so this resolves the identifier for an existing waiting
        // period (for example after an app restart) without changing its schedule.
        const request = await flow().begin(deps.purpose);
        availableAt = request.availableAt;
        expiresAt = request.expiresAt;
        if (now() < Date.parse(request.availableAt)) {
          if (current === generation) settle('아직 대기 시간이 남아 있어요.');
          return;
        }
        await flow().execute(pin);
        if (current !== generation) return;
        availableAt = undefined;
        expiresAt = undefined;
        report(
          'done',
          deps.purpose === 'delete_account'
            ? '계정 삭제가 완료됐어요'
            : 'PIN을 새로 설정했어요. 새 PIN으로 부모님 모드에 들어가 주세요.',
        );
      } catch {
        if (current !== generation) return;
        report(
          'error',
          deps.purpose === 'delete_account'
            ? '계정 삭제 상태를 확인해 주세요. 완료 여부를 확인하기 전에는 다시 삭제하지 않아요.'
            : 'PIN을 설정하지 못했어요. 대기 상태를 다시 확인해 주세요.',
        );
      }
    },
    // Explicit user decision. Closing the screen must not cancel a waiting period.
    async cancel() {
      if (phase === 'executing' || phase === 'done') return;
      const current = ++generation;
      try {
        // Resolve the identifier first: a waiting period resumed from the display read has
        // none, and cancelling only local state would leave the server request running.
        if (!flow().request) await flow().begin(deps.purpose);
        await flow().cancel();
        if (current !== generation) return;
        availableAt = undefined;
        expiresAt = undefined;
        actions = undefined;
        report('intro', '요청을 취소했어요.');
      } catch {
        if (current === generation) settle('요청을 취소하지 못했어요. 다시 시도해 주세요.');
      }
    },
    dismiss() {
      generation++;
      actions = undefined;
    },
  };
}
