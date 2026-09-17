import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { TaskQuantityError } from '@/features/learning/api/learning-api';
import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  useDailyPlan,
  useDailyTasks,
  useStudyItems,
  useUpdateDailyTaskQuantity,
} from '@/features/learning/hooks/use-learning';
import { editableTasks, seoulDate } from '@/features/learning/utils/task-order';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function TaskQuantityPanel({ childId }: { childId: string }) {
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
  const items = useStudyItems(childId);
  const mutation = useUpdateDailyTaskQuantity();
  const [draft, setDraft] = useState<{ task: DailyTask; date: string } | null>(null);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const recoveryVersion = useRef(0);
  const rows = editableTasks(tasks.data ?? []).filter((task) => !task.quantity_conflict);
  const current = draft && rows.find((t) => t.id === draft.task.id);
  const stale = Boolean(
    draft &&
    (!current ||
      current.updated_at !== draft.task.updated_at ||
      draft.date !== today ||
      draft.task.daily_plan_id !== plan.data?.id),
  );
  const reload = async (error?: unknown) => {
    const version = ++recoveryVersion.current;
    setDraft(null);
    setMessage('최신 공부 목록을 불러오고 있어요.');
    try {
      const result = await tasks.refetch();
      if (result.isError) throw new Error('Refetch failed');
      if (version !== recoveryVersion.current) return;
      setMessage(
        error instanceof TaskQuantityError && error.kind === 'conflict'
          ? '공부 상태가 변경되어 최신 내용으로 다시 불러왔습니다.'
          : error instanceof TaskQuantityError && error.kind === 'validation'
            ? '입력 범위를 확인한 뒤 다시 수정해 주세요.'
            : '최신 목록을 불러왔어요. 분량을 확인하고 다시 시도해 주세요.',
      );
    } catch {
      if (version === recoveryVersion.current)
        setMessage('목록을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.');
    }
  };
  const save = () => {
    if (!draft || mutation.isPending || submitting.current) return;
    if (stale || draft.date !== seoulDate()) {
      void reload(new TaskQuantityError('conflict'));
      return;
    }
    const amount = Number(value);
    const workbook = draft.task.item_type === 'WORKBOOK';
    const item = items.data?.find((i) => i.id === draft.task.study_item_id);
    const limit = workbook ? (item?.workbook_last_page ?? 2147483647) : 32767;
    if (
      !/^\d+$/.test(value) ||
      !Number.isInteger(amount) ||
      amount < (workbook ? draft.task.planned_start_page! : 1) ||
      amount > limit
    ) {
      setMessage(
        workbook
          ? '시작 쪽 이상, 문제집 마지막 쪽 이하로 입력해 주세요.'
          : '시간은 1~32767분의 정수로 입력해 주세요.',
      );
      return;
    }
    submitting.current = true;
    setMessage('');
    mutation.mutate(
      { task: draft.task, value: amount },
      {
        onSuccess: () => {
          setDraft(null);
          setMessage('오늘 공부 분량을 저장했어요.');
        },
        onError: (error) => {
          void reload(error);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>오늘 공부 분량</Text>
      <Text style={s.secondary}>
        아직 시작하지 않은 오늘 공부만 바꿔요. 원본 설정과 확정 진도는 바뀌지 않아요.
      </Text>
      {tasks.isLoading || plan.isLoading ? (
        <Text>공부 목록을 불러오고 있어요.</Text>
      ) : tasks.isError || plan.isError ? (
        <LearningButton
          label="분량 목록 다시 불러오기"
          onPress={() => {
            void plan.refetch();
            void reload();
          }}
        />
      ) : (
        <>
          {rows.length === 0 && <Text style={s.secondary}>분량을 바꿀 수 있는 공부가 없어요.</Text>}
          {rows.map((task) => (
            <View key={task.id} style={s.card}>
              <Text style={s.text}>{task.name_snapshot}</Text>
              <Text style={s.secondary}>
                {task.item_type === 'WORKBOOK'
                  ? `${task.planned_start_page}~${task.planned_end_page}쪽`
                  : `${task.planned_minutes}분`}
              </Text>
              {draft?.task.id !== task.id && (
                <LearningButton
                  label={`${task.name_snapshot} 분량 수정`}
                  disabled={mutation.isPending || tasks.isFetching}
                  onPress={() => {
                    recoveryVersion.current++;
                    setDraft({ task, date: today });
                    setValue(
                      String(
                        task.item_type === 'WORKBOOK'
                          ? task.planned_end_page
                          : task.planned_minutes,
                      ),
                    );
                    setMessage('');
                  }}
                />
              )}
              {draft?.task.id === task.id && (
                <View style={s.card}>
                  <Text style={s.text}>{draft.task.name_snapshot} · 오늘 분량 수정</Text>
                  {draft.task.item_type === 'WORKBOOK' && (
                    <Text style={s.secondary}>
                      시작 {draft.task.planned_start_page}쪽 (변경할 수 없어요)
                    </Text>
                  )}
                  <LearningField
                    label={
                      draft.task.item_type === 'WORKBOOK' ? '오늘 끝 페이지' : '오늘 공부 시간 (분)'
                    }
                    numeric
                    value={value}
                    onChangeText={setValue}
                    disabled={mutation.isPending || stale}
                  />
                  {stale && (
                    <Text accessibilityRole="alert" style={s.warning}>
                      공부 상태가 바뀌었어요. 최신 목록을 다시 불러와 주세요.
                    </Text>
                  )}
                  <LearningButton
                    label="분량 저장"
                    onPress={save}
                    disabled={mutation.isPending || stale || tasks.isFetching}
                  />
                  <LearningButton
                    label="분량 수정 취소"
                    disabled={mutation.isPending}
                    onPress={() => setDraft(null)}
                  />
                </View>
              )}
            </View>
          ))}
        </>
      )}
      {stale && !current && (
        <Text accessibilityRole="alert" style={s.warning}>
          공부 상태가 바뀌었어요. 최신 목록을 다시 불러와 주세요.
        </Text>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
      {(message || stale) && (
        <LearningButton
          label="최신 분량 불러오기"
          disabled={mutation.isPending}
          onPress={() => void reload()}
        />
      )}
    </View>
  );
}
