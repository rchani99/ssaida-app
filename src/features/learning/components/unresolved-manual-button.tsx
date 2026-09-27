import { useRouter } from 'expo-router';

import { LearningButton } from '@/features/learning/components/learning-controls';
import { useUnresolvedManualTasks } from '@/features/learning/hooks/use-learning';
import { useToday } from '@/shared/hooks/use-today';

export function UnresolvedManualButton({ childId }: { childId: string }) {
  const router = useRouter();
  const today = useToday();
  const query = useUnresolvedManualTasks(childId, today);
  return (
    <LearningButton
      label={
        query.isLoading || query.isError
          ? '지난 공부 정리하기'
          : `지난 공부 ${query.data?.length ?? 0}개 정리하기`
      }
      onPress={() => router.push('/parent-review?tab=unresolved')}
    />
  );
}
