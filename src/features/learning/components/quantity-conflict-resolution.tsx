import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { QuantityResolutionError } from '@/features/learning/api/quantity-resolution-api';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  ParentReviewActions,
  ParentReviewConfirm,
} from '@/features/learning/components/parent-review-actions';
import {
  usePreviewQuantityResolution,
  useResolveQuantityConflict,
} from '@/features/learning/hooks/use-quantity-resolution';
import { seoulDate } from '@/features/learning/utils/task-order';

import type {
  DailyTaskWithPlan,
  QuantityResolution,
  StudyItem,
} from '@/features/learning/types/learning.types';

export function QuantityConflictResolution({
  task,
  item,
  onResolved,
  reviewStyle = false,
}: {
  task: DailyTaskWithPlan;
  item?: StudyItem;
  onResolved: (proposal: QuantityResolution) => void;
  reviewStyle?: boolean;
}) {
  const preview = usePreviewQuantityResolution();
  const resolve = useResolveQuantityConflict();
  const [proposal, setProposal] = useState<QuantityResolution | null>(null);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState<'preview' | 'apply' | 'cancel' | null>(null);
  const submitting = useRef(false);
  const busy = preview.isPending || resolve.isPending;
  const eligible =
    task.source_type === 'AUTO' &&
    task.item_type === 'WORKBOOK' &&
    task.status === 'PLANNED' &&
    task.started_at === null &&
    !!task.quantity_conflict &&
    !task.excluded_for_today &&
    task.daily_plans.plan_date === seoulDate();
  const fail = (error: unknown) => {
    setChoice(null);
    setProposal(null);
    setMessage(
      error instanceof QuantityResolutionError
        ? error.message
        : '최신 목록에서 다시 확인해 주세요.',
    );
  };
  const load = () => {
    if (busy || submitting.current || !eligible) return;
    submitting.current = true;
    setMessage('');
    preview.mutate(task.id, {
      onSuccess: (result) => {
        setProposal(result);
        setChoice(null);
      },
      onError: fail,
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  const save = () => {
    if (!proposal || busy || submitting.current || !eligible) return;
    submitting.current = true;
    setMessage('');
    resolve.mutate(proposal, {
      onSuccess: (result) => {
        setChoice(null);
        setProposal(null);
        onResolved(result);
      },
      onError: fail,
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  return (
    <View style={s.card}>
      <Text style={s.secondary}>
        현재 확정 진도: {item ? `${item.workbook_last_completed_page}쪽` : '불러오는 중'}
      </Text>
      {!eligible ? (
        <Text style={s.secondary}>오늘 아직 시작하지 않은 공부만 진도에 맞출 수 있어요.</Text>
      ) : proposal ? (
        <>
          <Text style={s.text}>확정 진도 {proposal.confirmed_progress}쪽 기준</Text>
          <Text style={s.text}>
            {proposal.action === 'EXCLUDE'
              ? `${proposal.old_start}~${proposal.old_end}쪽은 이미 확인된 범위예요. 오늘 실행 목록에서 제외할까요?`
              : `${proposal.old_start}~${proposal.old_end}쪽 → ${proposal.new_start}~${proposal.new_end}쪽으로 맞출까요?`}
          </Text>
          <Text style={s.secondary}>원본 설정과 확정 진도, 성장 포인트는 바꾸지 않아요.</Text>
          {reviewStyle ? (
            <ParentReviewActions
              label={`${task.name_snapshot} 진도 처리 방법`}
              disabled={busy}
              actions={[
                {
                  label: '진도 맞추기 적용',
                  selected: choice === 'apply',
                  onPress: () => setChoice('apply'),
                },
                {
                  label: '진도 맞추기 취소',
                  selected: choice === 'cancel',
                  onPress: () => setChoice('cancel'),
                },
              ]}
            />
          ) : (
            <>
              <LearningButton label="진도 맞추기 적용" disabled={busy} onPress={save} />
              <LearningButton
                label="진도 맞추기 취소"
                disabled={busy}
                onPress={() => setProposal(null)}
              />
            </>
          )}
        </>
      ) : reviewStyle ? (
        <ParentReviewActions
          label={`${task.name_snapshot} 진도 처리 방법`}
          disabled={busy}
          actions={[
            {
              label: '진도에 맞추기',
              selected: choice === 'preview',
              onPress: () => setChoice('preview'),
            },
          ]}
        />
      ) : (
        <LearningButton label="진도에 맞추기" disabled={busy} onPress={load} />
      )}
      {reviewStyle && eligible && (
        <ParentReviewConfirm
          label={`${task.name_snapshot} 진도 처리 확인`}
          disabled={
            busy || (proposal ? choice !== 'apply' && choice !== 'cancel' : choice !== 'preview')
          }
          onPress={() => {
            if (busy || submitting.current) return;
            if (!proposal && choice === 'preview') load();
            else if (proposal && choice === 'apply') save();
            else if (proposal && choice === 'cancel') {
              setProposal(null);
              setChoice(null);
            }
          }}
        />
      )}
      {busy && <Text style={s.secondary}>확인하고 있어요.</Text>}
      {!!message && (
        <Text accessibilityRole="alert" style={s.warning}>
          {message}
        </Text>
      )}
    </View>
  );
}
