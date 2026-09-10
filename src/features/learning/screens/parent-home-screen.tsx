import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import {
  useConfirmDailyTasks,
  useCreateStudyItem,
  useCurrentChild,
  usePendingConfirmations,
  useStudyItems,
} from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';
import { useAppModeStore } from '@/store/app-mode.store';

import type { CreateStudyItemInput } from '@/features/learning/types/learning.types';
import type { ComponentProps, ReactNode } from 'react';

const SUBJECTS = [
  { code: null, label: '선택 안 함' },
  { code: 'KOREAN', label: '국어' },
  { code: 'MATH', label: '수학' },
  { code: 'ENGLISH', label: '영어' },
  { code: 'SCIENCE', label: '과학' },
  { code: 'SOCIAL', label: '사회' },
  { code: 'OTHER', label: '기타' },
] as const;
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export function ParentHomeScreen() {
  const router = useRouter();
  const setMode = useAppModeStore((state) => state.setMode);
  const childQuery = useCurrentChild();
  const childId = childQuery.data?.id;
  const studyItemsQuery = useStudyItems(childId);
  const pendingQuery = usePendingConfirmations(childId);
  const confirmTasks = useConfirmDailyTasks();
  const [actualPages, setActualPages] = useState<Record<string, string>>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);

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

  const pending = pendingQuery.data ?? [];
  const handleConfirmAll = () => {
    setConfirmError(null);
    try {
      const confirmations = pending.map((task) => {
        if (task.item_type === 'ACTIVITY') {
          return { dailyTaskId: task.id, status: 'PARENT_CONFIRMED' as const, actualEndPage: null };
        }
        const value = Number(actualPages[task.id] ?? task.planned_end_page);
        if (!Number.isInteger(value) || value < (task.planned_end_page ?? 1)) {
          throw new Error('문제집의 실제 완료 페이지를 확인해 주세요.');
        }
        if (task.study_item_id !== null) {
          const item = studyItemsQuery.data?.find((item) => item.id === task.study_item_id);
          if (!item || item.workbook_last_page === null) {
            throw new Error('문제집 정보를 불러온 뒤 다시 확인해 주세요.');
          }
          if (value > item.workbook_last_page) {
            throw new Error('마지막 쪽을 넘을 수 없어요.');
          }
        }
        return { dailyTaskId: task.id, status: 'PARENT_CONFIRMED' as const, actualEndPage: value };
      });

      confirmTasks.mutate(confirmations, {
        onError: () => setConfirmError('완료 내용을 저장하지 못했어요. 다시 확인해 주세요.'),
      });
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : '완료 페이지를 확인해 주세요.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>부모 홈</Text>
            <Text style={styles.description}>{childQuery.data.name}의 공부를 관리해요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode('child');
              router.replace('/');
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>아이 화면</Text>
          </Pressable>
        </View>

        <StudyItemForm childId={childQuery.data.id} />

        <Section title="등록한 공부">
          {studyItemsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : studyItemsQuery.isError ? (
            <Text style={styles.error}>등록 공부를 불러오지 못했어요.</Text>
          ) : studyItemsQuery.data?.length ? (
            studyItemsQuery.data.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowDetail}>
                    {item.item_type === 'WORKBOOK'
                      ? `${item.workbook_last_completed_page}쪽까지 완료 · 한 번에 ${item.workbook_pages_per_session}쪽`
                      : `매번 약 ${item.estimated_minutes}분`}
                  </Text>
                </View>
                <Text style={styles.badge}>
                  {item.status === 'ACTIVE'
                    ? '사용 중'
                    : item.status === 'COMPLETED'
                      ? '완료'
                      : '멈춤'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>먼저 공부를 등록해 주세요.</Text>
          )}
        </Section>

        <Section title="부모님 확인">
          {pendingQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : pendingQuery.isError ? (
            <Text style={styles.error}>확인할 공부를 불러오지 못했어요.</Text>
          ) : pending.length === 0 ? (
            <Text style={styles.empty}>지금 확인할 공부가 없어요.</Text>
          ) : (
            <>
              {pending.map((task) => (
                <View key={task.id} style={styles.confirmRow}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{task.name_snapshot}</Text>
                    <Text style={styles.rowDetail}>
                      {task.item_type === 'WORKBOOK'
                        ? `계획 ${task.planned_start_page}쪽 ~ ${task.planned_end_page}쪽`
                        : `약 ${task.planned_minutes}분 활동`}
                    </Text>
                  </View>
                  {task.item_type === 'WORKBOOK' && (
                    <View style={styles.pageField}>
                      <TextInput
                        accessibilityLabel={`${task.name_snapshot} 실제 완료 페이지`}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setActualPages((current) => ({
                            ...current,
                            [task.id]: value.replace(/\D/g, ''),
                          }))
                        }
                        style={styles.pageInput}
                        value={actualPages[task.id] ?? String(task.planned_end_page)}
                      />
                      <Text style={styles.pageSuffix}>쪽까지</Text>
                    </View>
                  )}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={confirmTasks.isPending}
                onPress={handleConfirmAll}
                style={styles.primaryButton}
              >
                {confirmTasks.isPending ? (
                  <ActivityIndicator color={colors.card} />
                ) : (
                  <Text style={styles.primaryButtonText}>모두 확인했어요</Text>
                )}
              </Pressable>
            </>
          )}
          {confirmError && <Text style={styles.error}>{confirmError}</Text>}
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StudyItemForm({ childId }: { childId: string }) {
  const createItem = useCreateStudyItem();
  const [expanded, setExpanded] = useState(false);
  const [itemType, setItemType] = useState<'WORKBOOK' | 'ACTIVITY'>('WORKBOOK');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<CreateStudyItemInput['subject']>(null);
  const [minutes, setMinutes] = useState('20');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [pagesPerSession, setPagesPerSession] = useState('5');
  const [lastPage, setLastPage] = useState('100');
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    const estimatedMinutes = Number(minutes);
    const pages = Number(pagesPerSession);
    const last = Number(lastPage);
    if (!name.trim()) return setMessage('공부 이름을 입력해 주세요.');
    if (weekdays.length === 0) return setMessage('공부할 요일을 하나 이상 선택해 주세요.');
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
      return setMessage('예상시간을 확인해 주세요.');
    }
    if (
      itemType === 'WORKBOOK' &&
      (!Number.isInteger(pages) || pages <= 0 || !Number.isInteger(last) || last <= 0)
    ) {
      return setMessage('문제집 페이지 정보를 확인해 주세요.');
    }

    createItem.mutate(
      {
        childId,
        itemType,
        name,
        subject,
        estimatedMinutes,
        studyWeekdays: weekdays,
        workbookPagesPerSession: itemType === 'WORKBOOK' ? pages : undefined,
        workbookLastPage: itemType === 'WORKBOOK' ? last : undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setWeekdays([]);
          setExpanded(false);
          setMessage('공부를 등록했어요.');
        },
        onError: () => setMessage('공부를 등록하지 못했어요. 입력 내용을 확인해 주세요.'),
      },
    );
  };

  return (
    <Section title="공부 등록">
      {!expanded ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>새 공부 등록</Text>
        </Pressable>
      ) : (
        <View style={styles.form}>
          <View style={styles.segment}>
            {(['WORKBOOK', 'ACTIVITY'] as const).map((type) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: itemType === type }}
                key={type}
                onPress={() => setItemType(type)}
                style={[styles.segmentButton, itemType === type && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, itemType === type && styles.segmentTextSelected]}>
                  {type === 'WORKBOOK' ? '문제집' : '활동'}
                </Text>
              </Pressable>
            ))}
          </View>
          <LabeledInput
            label="공부 이름"
            onChangeText={setName}
            placeholder="예: 수학 문제집"
            value={name}
          />
          <Text style={styles.label}>과목 (선택)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {SUBJECTS.map((option) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: subject === option.code }}
                  key={option.label}
                  onPress={() => setSubject(option.code)}
                  style={[styles.chip, subject === option.code && styles.chipSelected]}
                >
                  <Text
                    style={[styles.chipText, subject === option.code && styles.chipTextSelected]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <LabeledInput
            keyboardType="number-pad"
            label="예상 소요시간 (분)"
            onChangeText={setMinutes}
            value={minutes}
          />
          <Text style={styles.label}>공부 요일</Text>
          <View style={styles.weekdays}>
            {WEEKDAYS.map((label, index) => {
              const day = index + 1;
              const selected = weekdays.includes(day);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={label}
                  onPress={() =>
                    setWeekdays((current) =>
                      selected
                        ? current.filter((value) => value !== day)
                        : [...current, day].sort(),
                    )
                  }
                  style={[styles.weekday, selected && styles.weekdaySelected]}
                >
                  <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {itemType === 'WORKBOOK' && (
            <View style={styles.pageInputs}>
              <View style={styles.flex}>
                <LabeledInput
                  keyboardType="number-pad"
                  label="한 번에 풀 페이지"
                  onChangeText={setPagesPerSession}
                  value={pagesPerSession}
                />
              </View>
              <View style={styles.flex}>
                <LabeledInput
                  keyboardType="number-pad"
                  label="마지막 페이지"
                  onChangeText={setLastPage}
                  value={lastPage}
                />
              </View>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={createItem.isPending}
            onPress={submit}
            style={styles.primaryButton}
          >
            {createItem.isPending ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.primaryButtonText}>등록하기</Text>
            )}
          </Pressable>
        </View>
      )}
      {message && (
        <Text style={message.includes('등록했어요') ? styles.success : styles.error}>
          {message}
        </Text>
      )}
    </Section>
  );
}

function LabeledInput({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textSecondary} style={styles.input} {...props} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 14 },
  section: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  form: { gap: spacing.md },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
  },
  segmentSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  segmentText: { color: colors.textSecondary, fontWeight: '700' },
  segmentTextSelected: { color: colors.primaryDark },
  field: { gap: spacing.sm },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  input: {
    height: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextSelected: { color: colors.primaryDark, fontWeight: '700' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  weekday: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 19,
  },
  weekdaySelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  weekdayText: { color: colors.textSecondary, fontSize: 13 },
  weekdayTextSelected: { color: colors.card, fontWeight: '700' },
  pageInputs: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: {
    minHeight: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.button,
  },
  secondaryButtonText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  rowDetail: { color: colors.textSecondary, fontSize: 13 },
  badge: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  confirmRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageField: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageInput: {
    width: 84,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    textAlign: 'center',
  },
  pageSuffix: { color: colors.textSecondary, fontSize: 14 },
  empty: { color: colors.textSecondary, fontSize: 14 },
  success: { color: colors.primaryDark, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
});
