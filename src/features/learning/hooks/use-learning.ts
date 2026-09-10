import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  completeDailyTask,
  confirmDailyTasks,
  createStudyItem,
  ensureDailyPlan,
  fetchContinuingTasks,
  fetchCurrentChild,
  fetchCurrentCollectible,
  fetchDailyPlan,
  fetchDailyTask,
  fetchDailyTasks,
  fetchPendingConfirmations,
  fetchStudyItems,
  revealCollectible,
  selectCollectionTheme,
  startDailyTask,
} from '@/features/learning/api/learning-api';

export const learningKeys = {
  all: ['learning'] as const,
  child: ['learning', 'child'] as const,
  studyItems: (childId: string) => ['learning', 'study-items', childId] as const,
  plan: (childId: string, date: string) => ['learning', 'plan', childId, date] as const,
  tasks: (planId: string) => ['learning', 'tasks', planId] as const,
  continuing: (childId: string, date: string) => ['learning', 'continuing', childId, date] as const,
  pendingConfirmations: (childId: string) =>
    ['learning', 'pending-confirmations', childId] as const,
  task: (taskId: string) => ['learning', 'task', taskId] as const,
  collectible: (childId: string, themeCode: string | null) =>
    ['learning', 'collectible', childId, themeCode] as const,
};

function useInvalidateLearning() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: learningKeys.all });
}

export function useCurrentChild() {
  return useQuery({ queryKey: learningKeys.child, queryFn: fetchCurrentChild });
}

export function useStudyItems(childId?: string) {
  return useQuery({
    queryKey: learningKeys.studyItems(childId ?? ''),
    queryFn: () => fetchStudyItems(childId!),
    enabled: Boolean(childId),
  });
}

export function useDailyPlan(childId: string | undefined, planDate: string) {
  return useQuery({
    queryKey: learningKeys.plan(childId ?? '', planDate),
    queryFn: () => fetchDailyPlan(childId!, planDate),
    enabled: Boolean(childId),
  });
}

export function useDailyTasks(planId?: string) {
  return useQuery({
    queryKey: learningKeys.tasks(planId ?? ''),
    queryFn: () => fetchDailyTasks(planId!),
    enabled: Boolean(planId),
  });
}

export function useContinuingTasks(childId: string | undefined, planDate: string) {
  return useQuery({
    queryKey: learningKeys.continuing(childId ?? '', planDate),
    queryFn: () => fetchContinuingTasks(childId!, planDate),
    enabled: Boolean(childId),
  });
}

export function usePendingConfirmations(childId?: string) {
  return useQuery({
    queryKey: learningKeys.pendingConfirmations(childId ?? ''),
    queryFn: () => fetchPendingConfirmations(childId!),
    enabled: Boolean(childId),
  });
}

export function useDailyTask(taskId?: string) {
  return useQuery({
    queryKey: learningKeys.task(taskId ?? ''),
    queryFn: () => fetchDailyTask(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useCurrentCollectible(childId?: string, themeCode?: string | null) {
  return useQuery({
    queryKey: learningKeys.collectible(childId ?? '', themeCode ?? null),
    queryFn: () => fetchCurrentCollectible(childId!, themeCode ?? null),
    enabled: Boolean(childId && themeCode),
  });
}

export function useCreateStudyItem() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: createStudyItem, onSuccess: invalidate });
}

export function useEnsureDailyPlan() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: ({ childId, date }: { childId: string; date: string }) =>
      ensureDailyPlan(childId, date),
    onSuccess: invalidate,
  });
}

export function useStartDailyTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: startDailyTask, onSuccess: invalidate });
}

export function useCompleteDailyTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: completeDailyTask, onSuccess: invalidate });
}

export function useConfirmDailyTasks() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: confirmDailyTasks, onSuccess: invalidate });
}

export function useSelectCollectionTheme() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: selectCollectionTheme, onSuccess: invalidate });
}

export function useRevealCollectible() {
  // Mark stale without refetching: hook-level onSuccess runs before the panel's
  // call-level onSuccess. An immediate refetch could replace collectible.id first,
  // hiding the just-revealed name. "정원으로" performs the full invalidation/refetch.
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revealCollectible,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: learningKeys.all, refetchType: 'none' }),
  });
}
