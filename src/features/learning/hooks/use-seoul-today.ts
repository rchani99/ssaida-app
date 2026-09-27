import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { seoulDate } from '@/features/learning/utils/task-order';

// Match the existing plan editors' date boundary; this timer does not fetch data.
export function useSeoulToday() {
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
  return today;
}
