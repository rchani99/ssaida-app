import { Redirect, useLocalSearchParams } from 'expo-router';

import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';
import { useAppModeStore } from '@/store/app-mode.store';

export default function IndexScreen() {
  const mode = useAppModeStore((state) => state.mode);
  const { destination } = useLocalSearchParams<{ destination?: string }>();
  const child = useCurrentChild();
  if (mode === 'child') {
    if (child.isLoading) return <ScreenMessage loading message="아이 정보를 불러오고 있어요." />;
    if (child.isError || !child.data)
      return (
        <ScreenMessage
          message="아이 정보를 불러오지 못했어요."
          actionLabel="다시 불러오기"
          onAction={() => void child.refetch()}
        />
      );
    if (!child.data.selected_collection_theme_code) return <Redirect href="/choose-theme" />;
  }

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
