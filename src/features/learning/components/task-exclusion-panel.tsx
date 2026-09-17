import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { TaskExclusionError } from '@/features/learning/api/learning-api';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  useDailyPlan,
  useDailyTasks,
  useExcludeDailyTask,
} from '@/features/learning/hooks/use-learning';
import { seoulDate } from '@/features/learning/utils/task-order';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function TaskExclusionPanel({ childId }: { childId: string }) {
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
  const mutation = useExcludeDailyTask();
  const [draft, setDraft] = useState<{ task: DailyTask; date: string } | null>(null);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const recoveryVersion = useRef(0);
  const rows = (tasks.data ?? []).filter(
    (task) =>
      task.source_type === 'AUTO' &&
      (task.excluded_for_today ||
        (task.status === 'PLANNED' && task.started_at === null && !task.quantity_conflict)),
  );
  const recover = async (error?: unknown) => {
    const version = ++recoveryVersion.current;
    setDraft(null);
    setMessage('최신 공부 목록을 불러오고 있어요.');
    try {
      const result = await tasks.refetch();
      if (result.isError) throw new Error('Refetch failed');
      if (version !== recoveryVersion.current) return;
      setMessage(
        error instanceof TaskExclusionError && error.kind === 'conflict'
          ? '공부 상태가 변경되어 최신 내용으로 다시 불러왔습니다.'
          : '최신 목록을 불러왔어요. 제외 여부를 확인해 주세요.',
      );
    } catch {
      if (version === recoveryVersion.current)
        setMessage('목록을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.');
    }
  };
  const save = () => {
    if (!draft || submitting.current || mutation.isPending) return;
    const current = rows.find((task) => task.id === draft.task.id);
    if (
      !current ||
      current.excluded_for_today ||
      current.updated_at !== draft.task.updated_at ||
      draft.date !== seoulDate() ||
      draft.task.daily_plan_id !== plan.data?.id
    ) {
      void recover(new TaskExclusionError('conflict'));
      return;
    }
    submitting.current = true;
    setMessage('');
    mutation.mutate(
      { task: draft.task },
      {
        onSuccess: () => {
          setDraft(null);
          setMessage('오늘 공부에서 제외했어요. 다음 공부 일정은 그대로예요.');
        },
        onError: (error) => {
          void recover(error);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>오늘만 제외</Text>
      <Text style={s.secondary}>
        아직 시작하지 않은 자동 공부만 오늘 계획에서 제외해요. 등록한 공부와 기록은 유지돼요.
      </Text>
      {plan.isLoading || tasks.isLoading ? (
        <Text>공부 목록을 불러오고 있어요.</Text>
      ) : plan.isError || tasks.isError ? (
        <Text style={s.error}>공부 목록을 불러오지 못했어요.</Text>
      ) : (
        <>
          {rows.length === 0 && (
            <Text style={s.secondary}>오늘 제외할 수 있는 자동 공부가 없어요.</Text>
          )}
          {rows.map((task) => (
            <View key={task.id} style={s.card}>
              <Text style={s.text}>{task.name_snapshot}</Text>
              {task.excluded_for_today ? (
                <Text style={s.secondary}>오늘 제외됨</Text>
              ) : draft?.task.id === task.id ? (
                <View style={s.card}>
                  <Text style={s.text}>이 공부를 오늘만 제외할까요?</Text>
                  <LearningButton
                    label="제외 취소"
                    disabled={mutation.isPending}
                    onPress={() => setDraft(null)}
                  />
                  <LearningButton
                    label="오늘만 제외 확인"
                    disabled={mutation.isPending || tasks.isFetching}
                    onPress={save}
                  />
                </View>
              ) : (
                <LearningButton
                  label={task.name_snapshot + ' 오늘만 제외'}
                  disabled={mutation.isPending || tasks.isFetching}
                  onPress={() => {
                    recoveryVersion.current++;
                    setDraft({ task, date: today });
                    setMessage('');
                  }}
                />
              )}
            </View>
          ))}
        </>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
      {(message || plan.isError || tasks.isError) && (
        <LearningButton
          label="제외 목록 다시 불러오기"
          disabled={mutation.isPending}
          onPress={() => {
            void plan.refetch();
            void recover();
          }}
        />
      )}
    </View>
  );
}
