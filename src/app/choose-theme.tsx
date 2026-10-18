import { Redirect, Stack, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/design-system/tokens';
import { FirstThemePicker } from '@/features/learning/components/first-theme-picker';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export default function ChooseThemeScreen() {
  const router = useRouter();
  const child = useCurrentChild();
  if (child.isLoading) return <ScreenMessage loading message="친구들을 데려오고 있어요." />;
  if (child.isError || !child.data)
    return (
      <ScreenMessage
        message="아이 정보를 불러오지 못했어요."
        actionLabel="다시 불러오기"
        onAction={() => void child.refetch()}
      />
    );
  if (child.data.selected_collection_theme_code) return <Redirect href="/child/today" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <FirstThemePicker
          pendingPoints={child.data.pending_growth_points}
          onSelected={() => router.replace('/child/today')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
