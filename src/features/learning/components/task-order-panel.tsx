import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { TaskOrderError } from '@/features/learning/api/learning-api';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { parentReviewStyles as cardStyles } from '@/features/learning/components/parent-review-styles';
import { TaskDragList } from '@/features/learning/components/task-drag-list';
import {
  useDailyPlan,
  useDailyTasks,
  useReorderDailyTasks,
} from '@/features/learning/hooks/use-learning';
import { editableTasks, orderSnapshot, seoulDate } from '@/features/learning/utils/task-order';

import type { DailyTask } from '@/features/learning/types/learning.types';
import type { ReactNode } from 'react';

type Order = { planId: string; date: string; tasks: DailyTask[] };

export function TaskOrderPanel({
  childId,
  onDragStateChange,
  renderTask,
  renderBadge,
  editStyle = false,
  listOnly = false,
}: {
  childId: string;
  onDragStateChange?: (dragging: boolean) => void;
  renderTask?: (task: DailyTask) => ReactNode;
  renderBadge?: (task: DailyTask) => ReactNode;
  editStyle?: boolean;
  listOnly?: boolean;
}) {
  const [today, setToday] = useState(() => seoulDate());
  useEffect(() => {
    const refresh = () => setToday(seoulDate());
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  const plan = useDailyPlan(childId, today);
  const tasks = useDailyTasks(plan.data?.id);
  const mutation = useReorderDailyTasks();
  const [optimistic, setOptimistic] = useState<Order | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const gesture = useRef<Order | null>(null);
  const eligible = editableTasks(tasks.data ?? []);
  const snapshot = orderSnapshot(eligible);
  const validOptimistic =
    optimistic !== null && optimistic.planId === plan.data?.id && optimistic.date === today;
  const ordered = validOptimistic ? optimistic.tasks : eligible;
  const eligibleIds = new Set(eligible.map((task) => task.id));
  let index = 0;
  // Keep non-editable rows in their existing slots and preserve their priority.
  const visible = (tasks.data ?? []).map((task) =>
    eligibleIds.has(task.id) ? (ordered[index++] ?? task) : task,
  );
  const disabled =
    mutation.isPending ||
    recovering ||
    !!optimistic ||
    plan.isFetching ||
    tasks.isFetching ||
    today !== seoulDate();
  const dragChanged = useCallback(
    (active: boolean) => {
      gesture.current =
        active && plan.data ? { planId: plan.data.id, date: today, tasks: eligible } : null;
      onDragStateChange?.(active);
    },
    [plan.data, today, onDragStateChange, eligible],
  );
  const reload = async () => {
    const refreshed = await plan.refetch();
    if (refreshed.isError || !refreshed.data) throw new Error('Reload failed');
    if (refreshed.data.id === plan.data?.id) {
      const result = await tasks.refetch();
      if (result.isError) throw new Error('Reload failed');
    }
  };
  const move = (from: number, to: number) => {
    if (disabled || submitting.current || from === to || !plan.data || eligible.length < 2) return;
    const source = visible[from];
    const target = visible[to];
    if (!source || !target || !eligibleIds.has(source.id) || !eligibleIds.has(target.id)) return;
    const start = gesture.current;
    if (
      start &&
      (start.planId !== plan.data.id ||
        start.date !== seoulDate() ||
        orderSnapshot(start.tasks) !== snapshot)
    ) {
      setMessage('공부 상태가 변경됐어요. 최신 목록에서 다시 순서를 바꿔 주세요.');
      return;
    }
    const reordered = [...eligible];
    const [moved] = reordered.splice(
      eligible.findIndex((task) => task.id === source.id),
      1,
    );
    reordered.splice(
      eligible.findIndex((task) => task.id === target.id),
      0,
      moved,
    );
    submitting.current = true;
    setMessage('');
    setOptimistic({ planId: plan.data.id, date: today, tasks: reordered });
    mutation.mutate(
      { planId: plan.data.id, tasks: reordered },
      {
        onSuccess: () => {
          setMessage('순서가 변경됐어요.');
          setRecovering(true);
          void reload()
            .then(() => setOptimistic(null))
            .catch(() => {
              setMessage('순서는 저장됐어요. 최신 목록을 다시 불러와 주세요.');
            })
            .finally(() => {
              setRecovering(false);
              submitting.current = false;
            });
        },
        onError: (error) => {
          setOptimistic(null);
          setRecovering(true);
          setMessage(
            error instanceof TaskOrderError && error.kind === 'conflict'
              ? '공부 상태가 변경됐어요. 최신 순서로 복원합니다.'
              : '저장 결과를 확인하지 못했어요. 최신 순서를 다시 불러옵니다.',
          );
          void reload()
            .catch(() => setMessage('최신 목록을 불러오지 못했어요. 다시 불러와 주세요.'))
            .finally(() => {
              setRecovering(false);
              submitting.current = false;
            });
        },
      },
    );
  };
  return (
    <View style={listOnly ? undefined : editStyle ? cardStyles.panel : s.panel}>
      {!listOnly && <Text style={editStyle ? cardStyles.title : s.title}>오늘 공부 순서</Text>}
      {!listOnly && eligible.length > 1 && (
        <Text style={cardStyles.secondary}>
          아직 시작하지 않은 공부끼리 순서를 바꿔요. 이어하기와 다시 하기는 먼저 표시돼요.
        </Text>
      )}
      {plan.isLoading || tasks.isLoading ? (
        <Text>공부 목록을 불러오고 있어요.</Text>
      ) : plan.isError || tasks.isError ? (
        <LearningButton
          label="순서 목록 다시 불러오기"
          disabled={mutation.isPending || recovering}
          onPress={() => {
            void reload().catch(() => setMessage('최신 목록을 불러오지 못했어요.'));
          }}
        />
      ) : visible.length ? (
        <TaskDragList
          tasks={visible}
          draggableIds={eligible.map((task) => task.id)}
          disabled={disabled}
          onMove={move}
          onDragStateChange={dragChanged}
          renderDetails={renderTask}
          renderBadge={renderBadge}
          showHint={!listOnly}
        />
      ) : (
        <Text style={cardStyles.secondary}>오늘 계획된 공부가 없어요.</Text>
      )}
      {!!message && !(listOnly && message === '순서가 변경됐어요.') && (
        <Text accessibilityRole="alert" style={cardStyles.secondary}>
          {message}
        </Text>
      )}
      {!!message && message !== '순서가 변경됐어요.' && !recovering && (
        <LearningButton
          label="최신 순서 불러오기"
          variant="outline"
          disabled={mutation.isPending}
          onPress={() => {
            if (submitting.current) return;
            setRecovering(true);
            void reload()
              .then(() => {
                setOptimistic(null);
                setMessage('');
              })
              .catch(() => setMessage('최신 목록을 불러오지 못했어요.'))
              .finally(() => setRecovering(false));
          }}
        />
      )}
    </View>
  );
}
