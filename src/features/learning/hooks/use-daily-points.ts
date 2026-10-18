import { useQuery } from '@tanstack/react-query';

import { fetchDailyPoints } from '@/features/learning/api/daily-points-api';
import { learningKeys } from '@/features/learning/hooks/use-learning';

export function useDailyPoints(childId: string, date: string) {
  return useQuery({
    queryKey: [...learningKeys.all, 'daily-points', childId, date],
    queryFn: () => fetchDailyPoints(childId, date),
    // Also reflect parent confirmations made on a different device.
    refetchInterval: 30_000,
  });
}
