import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { ParentConfirmationPanel } from '@/features/learning/components/parent-confirmation-panel';
import { parentReviewStyles as cardStyles } from '@/features/learning/components/parent-review-styles';
import { usePendingConfirmations } from '@/features/learning/hooks/use-learning';
import { seoulDate } from '@/features/learning/utils/task-order';

import type { ReactNode } from 'react';

export function TodayPlanEditGate({
  childId,
  children,
  autoStart = false,
  onClose,
  onReview,
  hideEditClose = false,
}: {
  childId: string;
  children: ReactNode;
  autoStart?: boolean;
  onClose?: () => void;
  onReview?: () => void;
  hideEditClose?: boolean;
}) {
  const query = usePendingConfirmations(childId);
  const [stage, setStage] = useState<'closed' | 'checking' | 'blocked' | 'review' | 'edit'>(
    'closed',
  );
  const [error, setError] = useState(false);
  const request = useRef(0);
  const past = (query.data ?? []).filter(
    (task) =>
      task.daily_plans.plan_date < seoulDate() &&
      task.status === 'CHILD_COMPLETED' &&
      task.parent_verified_at === null,
  );
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  // Finish the pending navigation only after a successful, settled refresh.
  // Once opened, background refetches must not unmount an active edit draft.
  if (stage === 'review' && query.isSuccess && !query.isFetching && past.length === 0) {
    setStage('edit');
  }
  const refetch = query.refetch;
  const enter = useCallback(async () => {
    const version = ++request.current;
    setError(false);
    setStage('checking');
    try {
      const result = await refetch();
      if (version !== request.current) return;
      if (result.isError || !result.data) throw new Error('Review list unavailable');
      setStage(
        result.data.some(
          (task) =>
            task.daily_plans.plan_date < seoulDate() &&
            task.status === 'CHILD_COMPLETED' &&
            task.parent_verified_at === null,
        )
          ? 'blocked'
          : 'edit',
      );
    } catch {
      if (version === request.current) {
        setError(true);
        setStage('closed');
      }
    }
  }, [refetch]);
  const close = () => {
    request.current++;
    setStage('closed');
    onClose?.();
  };
  useEffect(() => {
    if (!autoStart) return;
    const pendingRequest = request;
    let active = true;
    // Defer the entry request until mount has settled; a cancelled/Strict Mode
    // mount must not start a second request or restore an abandoned editor.
    void Promise.resolve().then(() => {
      if (active) void enter();
    });
    return () => {
      active = false;
      pendingRequest.current++;
    };
  }, [autoStart, enter]);
  return (
    <View style={{ gap: t.spacing[16] }}>
      {stage === 'closed' && <LearningButton label="오늘 공부 편집" onPress={() => void enter()} />}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          확인할 공부를 불러오지 못했어요. 다시 시도해 주세요.
        </Text>
      )}
      {stage === 'checking' && <Text style={s.secondary}>지난 공부를 확인하고 있어요.</Text>}
      {stage === 'blocked' && (
        <View style={cardStyles.panel}>
          <Text accessibilityRole="alert" style={cardStyles.title}>
            먼저 확인할 공부가 있어요
          </Text>
          <Text style={cardStyles.secondary}>
            지난 공부를 확인한 후 오늘 계획을 변경할 수 있어요.
          </Text>
          <Text style={cardStyles.secondary}>확인할 공부 {past.length}개</Text>
          <LearningButton
            label="지난 공부 확인하기"
            variant="primary"
            onPress={() => (onReview ? onReview() : setStage('review'))}
          />
          <LearningButton label="편집 취소" variant="outline" onPress={close} />
        </View>
      )}
      {stage === 'review' && <ParentConfirmationPanel childId={childId} beforeDate={seoulDate()} />}
      {stage === 'edit' && children}
      {stage !== 'closed' && stage !== 'blocked' && !(stage === 'edit' && hideEditClose) && (
        <LearningButton
          variant="outline"
          label={stage === 'edit' ? '오늘 공부 편집 닫기' : '편집 진입 취소'}
          onPress={close}
        />
      )}
    </View>
  );
}
