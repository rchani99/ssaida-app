import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dashboardTokens as t } from '@/design-system/tokens';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { ManualTasksPanel } from '@/features/learning/components/manual-tasks-panel';
import { ParentConfirmationPanel } from '@/features/learning/components/parent-confirmation-panel';
import { useCurrentChild, usePendingConfirmations } from '@/features/learning/hooks/use-learning';
import { useSeoulToday } from '@/features/learning/hooks/use-seoul-today';
import { ScreenMessage } from '@/shared/components/screen-message';
import { SegmentedTabs } from '@/shared/components/segmented-tabs';

export function ParentReviewScreen() {
  const child = useCurrentChild();
  if (child.isLoading) return <ScreenMessage loading message="가족 정보를 불러오고 있어요." />;
  if (child.isError || !child.data)
    return (
      <ScreenMessage
        message="가족 정보를 불러오지 못했어요."
        actionLabel="다시 불러오기"
        onAction={() => void child.refetch()}
      />
    );
  return <ParentReviewContent key={child.data.id} childId={child.data.id} />;
}

export function ParentReviewContent({ childId }: { childId: string }) {
  const params = useLocalSearchParams<{ tab?: string; returnTo?: string }>();
  const router = useRouter();
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const today = useSeoulToday();
  const pending = usePendingConfirmations(childId);
  const returnToEdit = params.returnTo === 'today-edit';
  const tab = params.tab === 'unresolved' || params.tab === 'conflicts' ? params.tab : 'pending';
  const [checked, setChecked] = useState(false);
  const refetch = pending.refetch;
  useEffect(() => {
    if (!returnToEdit) return;
    let active = true;
    void refetch()
      .then(() => {
        if (active) setChecked(true);
      })
      .catch(() => {
        /* Query error UI handles failed entry refresh. */
      });
    return () => {
      active = false;
    };
  }, [returnToEdit, refetch]);
  useEffect(() => {
    if (!focused.current || !returnToEdit || !checked || !pending.isSuccess || pending.isFetching)
      return;
    const past = (pending.data ?? []).some(
      (task) =>
        task.daily_plans.plan_date < today &&
        task.status === 'CHILD_COMPLETED' &&
        task.parent_verified_at === null,
    );
    if (!past) router.replace('/parent-today-edit');
  }, [
    focused,
    returnToEdit,
    checked,
    pending.isSuccess,
    pending.isFetching,
    pending.data,
    today,
    router,
  ]);
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <SegmentedTabs
            options={[
              { value: 'pending', label: '확인 필요' },
              { value: 'unresolved', label: '미완료' },
              { value: 'conflicts', label: '진도 충돌' },
            ]}
            value={tab}
            onChange={(value) => router.setParams({ tab: value })}
          />
          {returnToEdit && (
            <>
              <Text style={s.secondary}>
                지난 공부를 모두 확인하면 오늘 공부 편집으로 돌아가요.
              </Text>
              <LearningButton
                label="편집 진입 취소"
                onPress={() => {
                  focused.current = false;
                  router.replace('/parent/home');
                }}
              />
            </>
          )}
          {tab === 'pending' && (
            <ParentConfirmationPanel
              key="pending"
              childId={childId}
              section="pending"
              reviewStyle
              beforeDate={returnToEdit ? today : undefined}
            />
          )}
          {tab === 'unresolved' && (
            <ManualTasksPanel childId={childId} mode="unresolved" showList reviewStyle />
          )}
          {tab === 'conflicts' && (
            <ParentConfirmationPanel
              key="conflicts"
              childId={childId}
              section="conflicts"
              reviewStyle
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: t.layout.screenPadding, gap: t.spacing[16] },
});
