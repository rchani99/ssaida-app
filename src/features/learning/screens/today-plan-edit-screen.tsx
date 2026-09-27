import { useRouter } from 'expo-router';
import { CircleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import { learningStyles as s } from '@/features/learning/components/learning-controls';
import { ManualTasksPanel } from '@/features/learning/components/manual-tasks-panel';
import { parentReviewStyles as cardStyles } from '@/features/learning/components/parent-review-styles';
import { TaskExclusionPanel } from '@/features/learning/components/task-exclusion-panel';
import { TaskOrderPanel } from '@/features/learning/components/task-order-panel';
import { TaskQuantityPanel } from '@/features/learning/components/task-quantity-panel';
import { TodayPlanEditGate } from '@/features/learning/components/today-plan-edit-gate';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';

export function TodayPlanEditScreen() {
  const child = useCurrentChild();
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  if (child.isLoading) return <ScreenMessage loading message="가족 정보를 불러오고 있어요." />;
  if (child.isError || !child.data)
    return (
      <ScreenMessage
        message="가족 정보를 불러오지 못했어요."
        actionLabel="다시 불러오기"
        onAction={() => void child.refetch()}
      />
    );
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          scrollEnabled={!dragging}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: t.spacing[16], gap: t.spacing[16] }}
        >
          <TodayPlanEditGate
            key={child.data.id}
            childId={child.data.id}
            autoStart
            hideEditClose
            onReview={() => router.replace('/parent-review?tab=pending&returnTo=today-edit')}
            onClose={() => router.replace('/parent/home')}
          >
            <ManualTasksPanel childId={child.data.id} mode="add" reviewStyle />
            <View
              style={{
                gap: t.spacing[4],
                padding: t.spacing[12],
                backgroundColor: t.colors.background,
                borderWidth: 1,
                borderColor: t.colors.dividerSoft,
                borderRadius: t.radius.normal,
              }}
            >
              {[
                '아직 시작하지 않은 공부끼리 순서를 바꿔요.',
                '이어하기와 다시 하기는 먼저 표시돼요.',
                '오른쪽 손잡이를 잡고 순서를 바꿔보세요.',
              ].map((message) => (
                <View
                  key={message}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing[8] }}
                >
                  <CircleAlert
                    {...dashboardIconProps}
                    size={t.icon.size.small}
                    color={t.colors.warning}
                  />
                  <Text style={{ ...t.typography.caption, color: t.colors.textPrimary, flex: 1 }}>
                    {message}
                  </Text>
                </View>
              ))}
            </View>
            <TodayTaskCards childId={child.data.id} onDragStateChange={setDragging} />
          </TodayPlanEditGate>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TodayTaskCards({
  childId,
  onDragStateChange,
}: {
  childId: string;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const statuses: Record<string, string> = {
    PLANNED: '시작 전',
    IN_PROGRESS: '공부 중',
    CHILD_COMPLETED: '부모 확인 대기',
    RETRY: '다시 하기',
    PARENT_CONFIRMED: '부모 확인 완료',
    PARTIAL: '부분 완료',
    SKIPPED: '이번에는 넘김',
  };
  return (
    <TaskQuantityPanel
      editStyle
      childId={childId}
      renderContent={(quantity, quantityFeedback) => (
        <TaskExclusionPanel
          editStyle
          childId={childId}
          renderContent={(exclusion, exclusionFeedback) => (
            <>
              <TaskOrderPanel
                editStyle
                listOnly
                childId={childId}
                onDragStateChange={onDragStateChange}
                renderBadge={(task) => (
                  <View
                    style={{
                      paddingHorizontal: t.spacing[8],
                      paddingVertical: t.spacing[4],
                      borderRadius: t.radius.pill,
                      backgroundColor: t.colors.background,
                    }}
                  >
                    <Text style={{ ...t.typography.caption, color: t.colors.textSecondary }}>
                      {statuses[task.status]}
                    </Text>
                  </View>
                )}
                renderTask={(task) => (
                  <>
                    <Text
                      style={[
                        cardStyles.secondary,
                        { marginLeft: t.spacing[12], marginTop: -t.spacing[4] },
                      ]}
                    >
                      {task.item_type === 'WORKBOOK'
                        ? `${task.planned_start_page}~${task.planned_end_page}쪽 · `
                        : ''}
                      약 {task.planned_minutes}분
                    </Text>
                    {!!task.quantity_conflict && (
                      <Text style={s.warning}>
                        진도 변경으로 다시 확인이 필요해요. 대시보드의 부모 확인에서 진도에 맞춰
                        주세요.
                      </Text>
                    )}
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                        gap: t.spacing[8],
                        marginTop: t.spacing[4],
                      }}
                    >
                      {quantity.get(task.id)}
                      {exclusion.get(task.id)}
                    </View>
                  </>
                )}
              />
              {quantityFeedback}
              {exclusionFeedback}
            </>
          )}
        />
      )}
    />
  );
}
