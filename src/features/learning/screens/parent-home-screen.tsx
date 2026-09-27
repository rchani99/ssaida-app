import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';
import { ParentReviewLinks } from '@/features/learning/components/parent-review-links';
import { TodayPlanSummary } from '@/features/learning/components/today-plan-summary';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export function ParentHomeScreen() {
  const router = useRouter();
  const childQuery = useCurrentChild();
  if (childQuery.isLoading) return <ScreenMessage loading message="가족 정보를 불러오고 있어요." />;
  if (childQuery.isError || !childQuery.data) {
    return (
      <ScreenMessage
        actionLabel="다시 불러오기"
        message="가족 정보를 불러오지 못했어요."
        onAction={() => void childQuery.refetch()}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TodayPlanSummary childId={childQuery.data.id} mode="status" />
        <ParentReviewLinks childId={childQuery.data.id} />
        <TodayPlanSummary childId={childQuery.data.id} />
        <Pressable
          accessibilityRole="button"
          style={styles.editButton}
          onPress={() => router.push('/parent-today-edit')}
        >
          <Text style={styles.editButtonText}>오늘 공부 편집</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  editButton: {
    minHeight: t.icon.touchMin,
    paddingHorizontal: t.spacing[16],
    paddingVertical: t.spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.normal,
  },
  editButtonText: { ...t.typography.button, color: t.colors.card, textAlign: 'center' },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    gap: t.layout.sectionGap,
    padding: t.layout.screenPadding,
    backgroundColor: t.colors.background,
  },
});
