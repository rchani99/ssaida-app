import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAppModeStore } from '@/store/app-mode.store';

export default function IndexScreen() {
  const mode = useAppModeStore((state) => state.mode);
  const { destination } = useLocalSearchParams<{ destination?: string }>();

  return (
    <Redirect
      href={
        mode === 'child'
          ? '/child/today'
          : destination === 'parent-review'
            ? '/parent-review?tab=pending'
            : '/parent/home'
      }
    />
  );
}
