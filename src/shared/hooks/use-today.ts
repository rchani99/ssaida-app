import { create } from 'zustand';

import { toLocalDateString } from '@/shared/utils/date';

const useDateStore = create<{ today: string }>(() => ({ today: toLocalDateString() }));
export function useToday() {
  return useDateStore((state) => state.today);
}
export function refreshToday(now = new Date()) {
  const today = toLocalDateString(now);
  const changed = today !== useDateStore.getState().today;
  if (changed) useDateStore.setState({ today });
  return changed;
}
