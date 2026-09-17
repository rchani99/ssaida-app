import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { TaskOrderError } from '@/features/learning/api/learning-api';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { TaskDragList } from '@/features/learning/components/task-drag-list';
import {
  useDailyPlan,
  useDailyTasks,
  useReorderDailyTasks,
} from '@/features/learning/hooks/use-learning';
import { editableTasks, orderSnapshot, seoulDate } from '@/features/learning/utils/task-order';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function TaskOrderPanel({
  childId,
  onDragStateChange,
}: {
  childId: string;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragChanged = useCallback(
    (active: boolean) => {
      setDragging(active);
      onDragStateChange?.(active);
    },
    [onDragStateChange],
  );
  const [today, setToday] = useState(() => seoulDate());
  useEffect(() => {
    const refresh = () => setToday(seoulDate());
    const timer = setInterval(refresh, 30_000); // Date only; no periodic network sync.
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  const plan = useDailyPlan(childId, today);
  const tasks = useDailyTasks(plan.data?.id);
  const mutation = useReorderDailyTasks();
  const [draft, setDraft] = useState<{ planId: string; date: string; tasks: DailyTask[] } | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const reloadVersion = useRef(0);
  const eligible = editableTasks(tasks.data ?? []);
  const stale = Boolean(
    draft &&
    (draft.planId !== plan.data?.id ||
      draft.date !== today ||
      orderSnapshot(draft.tasks) !== orderSnapshot(eligible)),
  );
  const busy = mutation.isPending;
  const reload = async (kind?: 'conflict' | 'request') => {
    const version = ++reloadVersion.current;
    setDraft(null);
    if (kind)
      setMessage(
        kind === 'conflict'
          ? '공부 상태가 변경됐어요. 최신 목록을 불러오고 있어요.'
          : '저장 결과를 확인하지 못했어요. 최신 목록을 확인해 주세요.',
      );
    try {
      const refreshed = await plan.refetch();
      if (refreshed.isError || !refreshed.data) throw new Error('Reload failed');
      if (refreshed.data.id === plan.data?.id) {
        const refreshedTasks = await tasks.refetch();
        if (refreshedTasks.isError) throw new Error('Reload failed');
      }
      if (kind && version === reloadVersion.current)
        setMessage(
          kind === 'conflict'
            ? '공부 상태가 변경되어 최신 내용으로 다시 불러왔습니다.'
            : '최신 목록을 다시 불러왔어요. 순서를 확인한 뒤 다시 시도해 주세요.',
        );
    } catch {
      if (version === reloadVersion.current)
        setMessage('최신 목록을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.');
    }
  };
  const save = () => {
    if (!draft || stale || busy || dragging || submitting.current || draft.date !== seoulDate())
      return;
    submitting.current = true;
    setMessage('');
    mutation.mutate(
      { planId: draft.planId, tasks: draft.tasks },
      {
        onSuccess: () => {
          setDraft(null);
          setMessage('오늘 공부 순서를 저장했어요.');
        },
        onError: (error) => {
          void reload(error instanceof TaskOrderError ? error.kind : 'request');
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>오늘 공부 순서</Text>
      <Text style={s.secondary}>
        아직 시작하지 않은 공부끼리 순서를 바꿔요. 이어하기와 다시 하기는 먼저 표시돼요.
      </Text>
      {plan.isLoading || tasks.isLoading ? (
        <Text>공부 목록을 불러오고 있어요.</Text>
      ) : plan.isError || tasks.isError ? (
        <LearningButton
          label="순서 목록 다시 불러오기"
          disabled={busy}
          onPress={() => void reload()}
        />
      ) : draft ? (
        <>
          {stale && (
            <Text accessibilityRole="alert" style={s.warning}>
              공부 목록이나 날짜가 바뀌었어요. 다시 불러와 주세요.
            </Text>
          )}
          <TaskDragList
            tasks={draft.tasks}
            disabled={busy || stale || plan.isFetching || tasks.isFetching}
            onDragStateChange={dragChanged}
            onMove={(from, to) => {
              if (busy || stale || from === to) return;
              const reordered = [...draft.tasks];
              const [task] = reordered.splice(from, 1);
              reordered.splice(to, 0, task);
              setDraft({ ...draft, tasks: reordered });
            }}
          />
          <LearningButton
            label="순서 저장"
            disabled={busy || stale || dragging || plan.isFetching || tasks.isFetching}
            onPress={save}
          />
          <LearningButton label="순서 변경 취소" disabled={busy} onPress={() => setDraft(null)} />
          {stale && (
            <LearningButton
              label="최신 순서 불러오기"
              disabled={busy}
              onPress={() => void reload()}
            />
          )}
        </>
      ) : (
        <>
          <Text style={s.secondary}>순서를 바꿀 수 있는 공부 {eligible.length}개</Text>
          <LearningButton
            label="오늘 순서 변경"
            disabled={
              busy || eligible.length < 2 || !plan.data || plan.isFetching || tasks.isFetching
            }
            onPress={() => {
              if (plan.data) {
                setDraft({ planId: plan.data.id, date: today, tasks: eligible });
                reloadVersion.current++;
                setMessage('');
              }
            }}
          />
        </>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
    </View>
  );
}
