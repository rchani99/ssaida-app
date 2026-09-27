import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  excludeDailyTask,
  updateDailyTaskQuantity,
  reorderDailyTasks,
  updateStudyItem,
  changeStudyItemStatus,
  saveRestWeekdays,
  saveChildName,
  saveDailyTargetMinutes,
  addManualDailyTask,
  fetchReviewTasks,
  fetchUnresolvedManualTasks,
  rescheduleManualTask,
  skipManualTask,
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
  review: (childId: string) => ['learning', 'review', childId] as const,
  unresolved: (childId: string, date: string) => ['learning', 'unresolved', childId, date] as const,
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

export function useExcludeDailyTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: excludeDailyTask,
    retry: false,
    networkMode: 'always',
    onSettled: () => {
      void invalidate().catch(() => {});
    },
  });
}

export function useUpdateDailyTaskQuantity() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: updateDailyTaskQuantity,
    retry: false,
    networkMode: 'always',
    // A slow refetch must not hold the save button in the pending state.
    onSettled: () => {
      void invalidate().catch(() => {});
    },
  });
}

export function useReorderDailyTasks() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: reorderDailyTasks,
    retry: false,
    networkMode: 'always',
    // Refetch must not hold the mutation pending (also refresh unknown outcomes).
    onSettled: () => {
      void invalidate().catch(() => {});
    },
  });
}

export function useReviewTasks(childId: string) {
  return useQuery({
    queryKey: learningKeys.review(childId),
    queryFn: () => fetchReviewTasks(childId),
  });
}
export function useUnresolvedManualTasks(childId: string, date: string) {
  return useQuery({
    queryKey: learningKeys.unresolved(childId, date),
    queryFn: () => fetchUnresolvedManualTasks(childId, date),
  });
}
export function useAddManualDailyTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: addManualDailyTask, onSuccess: invalidate });
}
export function useRescheduleManualTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: rescheduleManualTask, onSuccess: invalidate });
}
export function useSkipManualTask() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: skipManualTask, onSuccess: invalidate });
}

export function useCurrentChild() {
  return useQuery({ queryKey: learningKeys.child, queryFn: fetchCurrentChild });
}

export function useStudyItems(childId?: string, includeDeleted = false) {
  return useQuery({
    queryKey: [...learningKeys.studyItems(childId ?? ''), includeDeleted],
    queryFn: () => fetchStudyItems(childId!, includeDeleted),
    enabled: Boolean(childId),
  });
}

export function useUpdateStudyItem() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: updateStudyItem, onSuccess: invalidate });
}
export function useChangeStudyItemStatus() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: changeStudyItemStatus, onSuccess: invalidate });
}
export function useSaveRestWeekdays() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: saveRestWeekdays, onSuccess: invalidate });
}
export function useSaveChildName() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: saveChildName, onSuccess: invalidate });
}
export function useSaveDailyTargetMinutes() {
  const invalidate = useInvalidateLearning();
  return useMutation({ mutationFn: saveDailyTargetMinutes, onSuccess: invalidate });
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
