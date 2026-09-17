import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import {
  useAddManualDailyTask,
  useDailyPlan,
  useDailyTasks,
  useRescheduleManualTask,
  useSkipManualTask,
  useUnresolvedManualTasks,
} from '@/features/learning/hooks/use-learning';
import { useToday } from '@/shared/hooks/use-today';

import type { DailyTaskWithPlan, ManualTaskInput } from '@/features/learning/types/learning.types';

export function ManualTasksPanel({ childId }: { childId: string }) {
  const today = useToday();
  const plan = useDailyPlan(childId, today);
  const tasks = useDailyTasks(plan.data?.id);
  const unresolved = useUnresolvedManualTasks(childId, today);
  const add = useAddManualDailyTask();
  const reschedule = useRescheduleManualTask();
  const skip = useSkipManualTask();
  const submitting = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(false);
  const [itemType, setItemType] = useState<'WORKBOOK' | 'ACTIVITY'>('WORKBOOK');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<ManualTaskInput['subject']>(null);
  const [minutes, setMinutes] = useState('20');
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('5');
  const [action, setAction] = useState<{ task: DailyTaskWithPlan; kind: 'move' | 'skip' } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showExcess, setShowExcess] = useState(false);
  const busy = add.isPending || reschedule.isPending || skip.isPending;
  const excess =
    (tasks.data ?? [])
      .filter((task) => !task.excluded_for_today && task.status !== 'SKIPPED')
      .reduce((sum, task) => sum + task.planned_minutes, 0) -
    (plan.data?.target_minutes_snapshot ?? Infinity);
  const submit = () => {
    if (busy || submitting.current) return;
    setError(null);
    if (!name.trim()) {
      setError('공부 이름을 입력해 주세요.');
      return;
    }
    if (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 32767) {
      setError('예상시간은 1~32767분 사이의 정수로 입력해 주세요.');
      return;
    }
    if (
      itemType === 'WORKBOOK' &&
      (!/^\d+$/.test(start) ||
        !/^\d+$/.test(end) ||
        Number(start) < 1 ||
        Number(end) < Number(start) ||
        Number(end) > 2147483647)
    ) {
      setError('시작 쪽과 마지막 쪽을 확인해 주세요.');
      return;
    }
    submitting.current = true;
    add.mutate(
      {
        childId,
        planDate: today,
        itemType,
        name,
        subject,
        minutes: Number(minutes),
        startPage: itemType === 'WORKBOOK' ? Number(start) : null,
        endPage: itemType === 'WORKBOOK' ? Number(end) : null,
      },
      {
        onSuccess: () => {
          setForm(false);
          setName('');
          setItemType('WORKBOOK');
          setSubject(null);
          setMinutes('20');
          setStart('1');
          setEnd('5');
          setMessage('오늘 할 일을 추가했어요.');
          setShowExcess(true);
        },
        onError: () => setError('공부를 추가하지 못했어요. 잠시 후 다시 시도해 주세요.'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  const perform = () => {
    if (!action || busy || submitting.current) return;
    submitting.current = true;
    setError(null);
    if (action.kind === 'move')
      reschedule.mutate(
        { taskId: action.task.id, date: today },
        {
          onSettled: () => {
            submitting.current = false;
          },
          onSuccess: () => {
            setAction(null);
            setMessage('오늘 공부에 추가했어요.');
            setShowExcess(true);
          },
          onError: (error) => {
            setAction(null);
            setError(error instanceof Error ? error.message : '공부를 옮기지 못했어요.');
            void unresolved.refetch();
          },
        },
      );
    else
      skip.mutate(action.task.id, {
        onSettled: () => {
          submitting.current = false;
        },
        onSuccess: () => {
          setAction(null);
          setMessage('이번 공부는 넘겼어요.');
        },
        onError: () => {
          setAction(null);
          setError('공부를 넘기지 못했어요. 목록을 다시 확인해 주세요.');
          void unresolved.refetch();
        },
      });
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>오늘 계획</Text>
      {plan.data?.day_type === 'REST' && (
        <Text style={s.secondary}>쉬는 날에도 필요한 숙제는 추가할 수 있어요.</Text>
      )}
      {plan.isError || tasks.isError ? (
        <>
          <Text style={s.error}>오늘 공부량을 불러오지 못했어요.</Text>
          <LearningButton
            label="오늘 계획 다시 불러오기"
            onPress={() => {
              void plan.refetch();
              void tasks.refetch();
            }}
          />
        </>
      ) : (
        plan.data && (
          <Text style={s.secondary}>
            목표 {plan.data.target_minutes_snapshot}분 · 계획{' '}
            {(tasks.data ?? [])
              .filter((task) => !task.excluded_for_today && task.status !== 'SKIPPED')
              .reduce((sum, task) => sum + task.planned_minutes, 0)}
            분
          </Text>
        )
      )}
      <LearningButton
        label="+ 오늘 할 일 추가"
        disabled={busy}
        onPress={() => {
          setForm(!form);
          setError(null);
        }}
      />
      {form && (
        <View style={s.card}>
          <View style={s.row}>
            {(['WORKBOOK', 'ACTIVITY'] as const).map((type) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`오늘 할 일 ${type === 'WORKBOOK' ? '문제집' : '활동'}`}
                accessibilityState={{ selected: itemType === type }}
                key={type}
                disabled={busy}
                onPress={() => {
                  if (type === itemType) return;
                  setItemType(type);
                  setStart('1');
                  setEnd('5');
                  setError(null);
                }}
                style={[s.choice, itemType === type && s.selected]}
              >
                <Text style={s.text}>{type === 'WORKBOOK' ? '문제집' : '활동'}</Text>
              </Pressable>
            ))}
          </View>
          <LearningField
            label="오늘 할 일 이름"
            value={name}
            onChangeText={setName}
            disabled={busy}
          />
          <Text style={s.secondary}>과목 (선택)</Text>
          <View style={s.row}>
            {(
              [
                [null, '선택 안 함'],
                ['KOREAN', '국어'],
                ['MATH', '수학'],
                ['ENGLISH', '영어'],
                ['SCIENCE', '과학'],
                ['SOCIAL', '사회'],
                ['OTHER', '기타'],
              ] as const
            ).map(([code, label]) => (
              <Pressable
                key={label}
                accessibilityRole="radio"
                accessibilityLabel={`오늘 할 일 과목 ${label}`}
                accessibilityState={{ selected: subject === code }}
                disabled={busy}
                onPress={() => setSubject(code)}
                style={[s.choice, subject === code && s.selected]}
              >
                <Text style={s.text}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <LearningField
            label="오늘 할 일 예상시간 (분)"
            value={minutes}
            onChangeText={setMinutes}
            numeric
            disabled={busy}
          />
          {itemType === 'WORKBOOK' && (
            <>
              <LearningField
                label="오늘 할 일 시작 쪽"
                value={start}
                onChangeText={setStart}
                numeric
                disabled={busy}
              />
              <LearningField
                label="오늘 할 일 마지막 쪽"
                value={end}
                onChangeText={setEnd}
                numeric
                disabled={busy}
              />
            </>
          )}
          <LearningButton label="오늘 할 일 저장" disabled={busy} onPress={submit} />
        </View>
      )}
      {showExcess && excess > 0 && (
        <View style={s.card}>
          <Text style={s.warning}>오늘 공부량이 목표보다 약 {excess}분 많아요.</Text>
          <LearningButton label="그대로 하기" onPress={() => setShowExcess(false)} />
        </View>
      )}
      {unresolved.isLoading ? (
        <ActivityIndicator />
      ) : unresolved.isError ? (
        <>
          <Text style={s.error}>지난 공부를 불러오지 못했어요.</Text>
          <LearningButton
            label="지난 공부 다시 불러오기"
            onPress={() => void unresolved.refetch()}
          />
        </>
      ) : (
        <LearningButton
          label={`지난 공부 ${unresolved.data?.length ?? 0}개 정리하기`}
          onPress={() => setExpanded(!expanded)}
        />
      )}
      {expanded &&
        (unresolved.data ?? []).map((task) => (
          <View key={task.id} style={s.card}>
            <Text style={s.text}>{task.name_snapshot}</Text>
            <Text style={s.secondary}>
              {task.daily_plans.plan_date} ·{' '}
              {task.item_type === 'WORKBOOK'
                ? `${task.planned_start_page}~${task.planned_end_page}쪽 · `
                : ''}
              {task.planned_minutes}분 ·{' '}
              {task.status === 'IN_PROGRESS'
                ? '공부하는 중이에요'
                : task.status === 'RETRY'
                  ? '다시 해야 해요'
                  : '아직 시작하지 않았어요'}
            </Text>
            <View style={s.row}>
              <LearningButton
                label={`${task.name_snapshot} 오늘에 추가`}
                disabled={busy}
                onPress={() => setAction({ task, kind: 'move' })}
              />
              <LearningButton
                label={`${task.name_snapshot} 이번에는 넘기기`}
                disabled={busy}
                onPress={() => setAction({ task, kind: 'skip' })}
              />
            </View>
            {action?.task.id === task.id && (
              <View style={s.card} accessibilityViewIsModal>
                <Text style={s.text}>{action.task.name_snapshot}</Text>
                <Text style={s.warning}>
                  {action.task.status === 'IN_PROGRESS' ? '진행 중인 공부예요. ' : ''}
                  {action.kind === 'move' ? '오늘로 옮길까요?' : '이번에는 넘길까요?'}
                </Text>
                <View style={s.row}>
                  <LearningButton label="취소" disabled={busy} onPress={() => setAction(null)} />
                  <LearningButton
                    label={action.kind === 'move' ? '오늘로 옮기기 확인' : '넘기기 확인'}
                    disabled={busy}
                    onPress={perform}
                  />
                </View>
              </View>
            )}
          </View>
        ))}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {message && <Text style={s.success}>{message}</Text>}
    </View>
  );
}
