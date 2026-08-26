import { Redirect } from 'expo-router';

import { useAppModeStore } from '@/store/app-mode.store';

export default function IndexScreen() {
  const mode = useAppModeStore((state) => state.mode);

  return <Redirect href={mode === 'child' ? '/child/today' : '/parent/home'} />;
}
