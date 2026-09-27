import { BookOpen, Clock3 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
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

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t, radius, spacing } from '@/design-system/tokens';
import {
  useCreateStudyItem,
  useCurrentChild,
  useStudyItems,
  useUpdateStudyItem,
  useChangeStudyItemStatus,
} from '@/features/learning/hooks/use-learning';
import { ScreenMessage } from '@/shared/components/screen-message';
import { SegmentedTabs } from '@/shared/components/segmented-tabs';

import type { CreateStudyItemInput, StudyItem } from '@/features/learning/types/learning.types';
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
const LIST_FILTERS = [
  { value: 'ALL', label: '전체' },
  { value: 'WORKBOOK', label: '문제집' },
  { value: 'ACTIVITY', label: '활동' },
] as const;

export function StudyManagementScreen() {
  const [filter, setFilter] = useState<(typeof LIST_FILTERS)[number]['value']>('ALL');
  const childQuery = useCurrentChild();
  const childId = childQuery.data?.id;
  const studyItemsQuery = useStudyItems(childId);
  const visibleItems = (studyItemsQuery.data ?? []).filter(
    (item) => filter === 'ALL' || item.item_type === filter,
  );
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
        <Text style={styles.description}>반복할 공부를 등록하고 관리해요.</Text>
        <SegmentedTabs options={LIST_FILTERS} value={filter} onChange={setFilter} />

        <StudyItemForm
          key={childQuery.data.id}
          childId={childQuery.data.id}
          restWeekdays={childQuery.data.rest_weekdays ?? []}
        />

        <View style={styles.registeredList}>
          <Text accessibilityRole="header" style={styles.registeredTitle}>
            등록한 공부
          </Text>
          <Text style={styles.registeredHelp}>
            잠시 쉬거나 삭제해도 이미 만들어진 계획과 기록은 유지돼요.
          </Text>
          {studyItemsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : studyItemsQuery.isError ? (
            <Text style={styles.error}>등록 공부를 불러오지 못했어요.</Text>
          ) : visibleItems.length ? (
            visibleItems.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.listRow}>
                  <View style={styles.typeIcon}>
                    {item.item_type === 'WORKBOOK' ? (
                      <BookOpen {...dashboardIconProps} color={t.colors.primary} />
                    ) : (
                      <Clock3 {...dashboardIconProps} color={t.colors.primary} />
                    )}
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.rowDetail}>
                        {item.item_type === 'WORKBOOK'
                          ? `${item.workbook_last_completed_page}쪽까지 완료 · 한 번에 ${item.workbook_pages_per_session}쪽`
                          : `매번 약 ${item.estimated_minutes}분`}
                      </Text>
                      <View style={[styles.badge, item.status === 'ACTIVE' && styles.activeBadge]}>
                        <Text
                          style={[
                            styles.badgeText,
                            item.status === 'ACTIVE' && styles.activeBadgeText,
                          ]}
                        >
                          {item.status === 'ACTIVE'
                            ? '사용 중'
                            : item.status === 'COMPLETED'
                              ? '완료'
                              : item.status === 'PAUSED'
                                ? '쉬는 중'
                                : '멈춤'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <StudyItemActions item={item} />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>
              {studyItemsQuery.data?.length
                ? '선택한 유형의 공부가 없어요.'
                : '먼저 공부를 등록해 주세요.'}
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StudyItemActions({ item }: { item: StudyItem }) {
  const change = useChangeStudyItemStatus();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const action = (status: 'ACTIVE' | 'PAUSED' | 'DELETED') => change.mutate({ item, status });
  return (
    <View style={styles.form}>
      <View style={styles.itemActions}>
        <Pressable
          accessibilityRole="button"
          disabled={change.isPending}
          onPress={() => {
            setEditing(!editing);
            setDeleting(false);
          }}
          style={styles.itemActionButton}
        >
          <Text style={styles.itemActionText}>수정</Text>
        </Pressable>
        {item.status === 'ACTIVE' && (
          <Pressable
            accessibilityRole="button"
            disabled={change.isPending || editing}
            onPress={() => action('PAUSED')}
            style={styles.itemActionButton}
          >
            <Text style={styles.itemActionText}>잠시 쉬기</Text>
          </Pressable>
        )}
        {item.status === 'PAUSED' && (
          <Pressable
            accessibilityRole="button"
            disabled={change.isPending || editing}
            onPress={() => action('ACTIVE')}
            style={styles.itemActionButton}
          >
            <Text style={styles.itemActionText}>다시 시작</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={change.isPending || editing}
          onPress={() => setDeleting(!deleting)}
          style={styles.itemActionButton}
        >
          <Text style={[styles.itemActionText, styles.deleteActionText]}>삭제</Text>
        </Pressable>
      </View>
      {editing && (
        <StudyItemForm
          key={item.updated_at}
          childId={item.child_id}
          item={item}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <View style={styles.form}>
          <Text style={styles.description}>
            등록한 공부를 삭제할까요? 이미 만들어진 계획과 학습 기록은 유지돼요.
          </Text>
          <View style={styles.segment}>
            <Pressable
              accessibilityRole="button"
              disabled={change.isPending}
              onPress={() => setDeleting(false)}
              style={styles.secondaryButton}
            >
              <Text>취소</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={change.isPending}
              onPress={() => action('DELETED')}
              style={styles.secondaryButton}
            >
              <Text>삭제 확인</Text>
            </Pressable>
          </View>
        </View>
      )}
      {change.isError && (
        <Text accessibilityRole="alert" style={styles.error}>
          변경하지 못했어요. 목록을 다시 불러온 뒤 시도해 주세요.
        </Text>
      )}
    </View>
  );
}

function StudyItemForm({
  childId,
  item,
  onClose,
  restWeekdays = [],
}: {
  childId: string;
  item?: StudyItem;
  onClose?: () => void;
  restWeekdays?: number[];
}) {
  const createItem = useCreateStudyItem();
  const updateItem = useUpdateStudyItem();
  const busy = createItem.isPending || updateItem.isPending;
  const [expanded, setExpanded] = useState(Boolean(item));
  const [itemType, setItemType] = useState<'WORKBOOK' | 'ACTIVITY'>(
    item?.item_type === 'ACTIVITY' ? 'ACTIVITY' : 'WORKBOOK',
  );
  const [name, setName] = useState(item?.name ?? '');
  const [subject, setSubject] = useState<CreateStudyItemInput['subject']>(
    (item?.subject as CreateStudyItemInput['subject']) ?? null,
  );
  const [minutes, setMinutes] = useState(String(item?.estimated_minutes ?? 20));
  const [weekdays, setWeekdays] = useState<number[]>(item?.study_weekdays ?? []);
  const [pagesPerSession, setPagesPerSession] = useState(
    String(item?.workbook_pages_per_session ?? 5),
  );
  const [lastPage, setLastPage] = useState(String(item?.workbook_last_page ?? 100));
  const initialNextPage =
    item?.workbook_next_start_page_override ?? (item?.workbook_last_completed_page ?? 0) + 1;
  const [nextPage, setNextPage] = useState(String(initialNextPage));
  const [message, setMessage] = useState<string | null>(null);
  const [restHintDay, setRestHintDay] = useState<number | null>(null);
  const restHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availableWeekdays = weekdays.filter((day) => !restWeekdays.includes(day));

  useEffect(() => {
    return () => {
      if (restHintTimer.current !== null) clearTimeout(restHintTimer.current);
    };
  }, []);

  const hideRestHint = () => {
    if (restHintTimer.current !== null) clearTimeout(restHintTimer.current);
    restHintTimer.current = null;
    setRestHintDay(null);
  };

  const showRestHint = (day: number) => {
    if (restHintTimer.current !== null) clearTimeout(restHintTimer.current);
    setRestHintDay(day);
    restHintTimer.current = setTimeout(() => {
      setRestHintDay(null);
      restHintTimer.current = null;
    }, 2000);
  };

  const submit = () => {
    if (busy) return;
    setMessage(null);
    const estimatedMinutes = Number(minutes);
    const pages = Number(pagesPerSession);
    const last = Number(lastPage);
    const next = Number(nextPage);
    if (item?.item_type === 'WORKBOOK' && last < (item.workbook_last_page ?? 0)) {
      return setMessage('기존 계획을 보호하기 위해 등록된 마지막 페이지는 줄일 수 없어요.');
    }
    if (!name.trim()) return setMessage('공부 이름을 입력해 주세요.');
    if (availableWeekdays.length === 0) return setMessage('공부할 요일을 하나 이상 선택해 주세요.');
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0 || estimatedMinutes > 32767) {
      return setMessage('예상시간을 확인해 주세요.');
    }
    if (
      itemType === 'WORKBOOK' &&
      (!Number.isInteger(pages) ||
        pages <= 0 ||
        pages > 32767 ||
        !Number.isInteger(last) ||
        last <= 0 ||
        last > 2147483647 ||
        (item?.status !== 'COMPLETED' && (!Number.isInteger(next) || next < 1 || next > last)) ||
        (item &&
          (last < (item.workbook_last_completed_page ?? 0) ||
            (item.status === 'COMPLETED' && last !== item.workbook_last_page))))
    ) {
      return setMessage('문제집 페이지 정보를 확인해 주세요.');
    }

    if (item) {
      updateItem.mutate(
        {
          item,
          values: {
            name,
            subject,
            estimatedMinutes,
            studyWeekdays: availableWeekdays,
            workbookPagesPerSession: pages,
            workbookLastPage: last,
            workbookNextStartPage:
              itemType === 'WORKBOOK' && next !== initialNextPage ? next : undefined,
          },
        },
        {
          onSuccess: onClose,
          onError: () => setMessage('저장하지 못했어요. 목록을 다시 불러온 뒤 확인해 주세요.'),
        },
      );
      return;
    }
    createItem.mutate(
      {
        childId,
        itemType,
        name,
        subject,
        estimatedMinutes,
        studyWeekdays: availableWeekdays,
        workbookPagesPerSession: itemType === 'WORKBOOK' ? pages : undefined,
        workbookLastPage: itemType === 'WORKBOOK' ? last : undefined,
        workbookNextStartPage: itemType === 'WORKBOOK' ? next : undefined,
      },
      {
        onSuccess: () => {
          hideRestHint();
          setName('');
          setNextPage('1');
          setWeekdays([]);
          setExpanded(false);
          setMessage('공부를 등록했어요.');
        },
        onError: () => setMessage('공부를 등록하지 못했어요. 입력 내용을 확인해 주세요.'),
      },
    );
  };

  return (
    <>
      {!item && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded, disabled: busy }}
          disabled={busy}
          onPress={() => {
            hideRestHint();
            setExpanded((current) => !current);
          }}
          style={styles.registrationToggle}
        >
          <Text style={styles.registrationToggleText}>
            {expanded ? '등록 닫기' : '+ 공부 등록'}
          </Text>
        </Pressable>
      )}
      {(item || expanded) && (
        <Section title={item ? '공부 수정' : '공부 등록'} editing={Boolean(item)}>
          {item && (
            <Text style={styles.description}>
              확정 진도와 이미 만들어진 계획은 바꾸지 않아요. 변경 내용은 앞으로 새로 생성되는
              계획에 적용돼요.
            </Text>
          )}
          <View style={styles.form}>
            <View style={styles.segment}>
              {(['WORKBOOK', 'ACTIVITY'] as const).map((type) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: itemType === type }}
                  key={type}
                  disabled={Boolean(item) || busy}
                  onPress={() => setItemType(type)}
                  style={[styles.segmentButton, itemType === type && styles.segmentSelected]}
                >
                  <Text
                    style={[styles.segmentText, itemType === type && styles.segmentTextSelected]}
                  >
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
            <View style={styles.field}>
              <Text style={styles.label}>과목 (선택)</Text>
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
            </View>
            <LabeledInput
              keyboardType="number-pad"
              label="예상 소요시간 (분)"
              onChangeText={setMinutes}
              value={minutes}
            />
            <View style={styles.field}>
              <Text style={styles.label}>공부 요일</Text>
              <View style={styles.weekdays}>
                {WEEKDAYS.map((label, index) => {
                  const day = index + 1;
                  const isRestDay = restWeekdays.includes(day);
                  const selected = availableWeekdays.includes(day);
                  return (
                    <View
                      key={label}
                      style={[
                        styles.weekdayAnchor,
                        restHintDay === day && styles.weekdayHintAnchor,
                      ]}
                    >
                      <Pressable
                        accessibilityRole={isRestDay ? 'button' : 'checkbox'}
                        accessibilityLabel={`${label}요일${isRestDay ? ', 휴식일이에요' : ''}`}
                        accessibilityHint={
                          isRestDay
                            ? '공부 요일로 선택할 수 없어요. 휴식일 안내를 표시해요.'
                            : undefined
                        }
                        accessibilityState={isRestDay ? undefined : { checked: selected }}
                        hitSlop={{ left: 2, right: 2 }}
                        onPress={() => {
                          // Rest days are help buttons: native disabled state also suppresses taps.
                          if (isRestDay) return showRestHint(day);
                          setWeekdays((current) =>
                            selected
                              ? current.filter((value) => value !== day)
                              : [...current, day].sort(),
                          );
                        }}
                        style={[
                          styles.weekday,
                          selected && styles.weekdaySelected,
                          isRestDay && styles.weekdayDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            selected && styles.weekdayTextSelected,
                            isRestDay && styles.weekdayTextDisabled,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                      {isRestDay && restHintDay === day && (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.restHint,
                            index === 0 && styles.restHintFirst,
                            index === WEEKDAYS.length - 1 && styles.restHintLast,
                          ]}
                        >
                          <Text accessibilityLiveRegion="polite" style={styles.restHintText}>
                            휴식일이에요
                          </Text>
                          <View
                            style={[
                              styles.restHintArrow,
                              index === 0 && styles.restHintArrowFirst,
                              index === WEEKDAYS.length - 1 && styles.restHintArrowLast,
                            ]}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
            {itemType === 'WORKBOOK' && (
              <View style={styles.pageInputs}>
                <View style={styles.flex}>
                  <LabeledInput
                    keyboardType="number-pad"
                    label="다음 시작 페이지"
                    editable={item?.status !== 'COMPLETED' && !busy}
                    onChangeText={setNextPage}
                    value={nextPage}
                  />
                </View>
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
              disabled={busy}
              onPress={submit}
              style={styles.primaryButton}
            >
              {busy ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.primaryButtonText}>{item ? '변경 저장' : '등록하기'}</Text>
              )}
            </Pressable>
          </View>
        </Section>
      )}
      {message && (
        <Text style={message.includes('등록했어요') ? styles.success : styles.error}>
          {message}
        </Text>
      )}
    </>
  );
}

function LabeledInput({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        {...props}
        onChangeText={(value) =>
          props.onChangeText?.(
            props.keyboardType === 'number-pad' ? value.replace(/\D/g, '') : value,
          )
        }
      />
    </View>
  );
}

function Section({
  title,
  children,
  editing = false,
}: {
  title: string;
  children: ReactNode;
  editing?: boolean;
}) {
  return (
    <View style={[styles.section, editing && styles.editSection]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    gap: t.spacing[16],
    padding: t.layout.screenPadding,
    backgroundColor: colors.background,
  },
  registrationToggle: {
    minHeight: t.icon.touchMin,
    paddingHorizontal: t.spacing[16],
    paddingVertical: t.spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.normal,
  },
  registrationToggleText: { ...t.typography.button, color: t.colors.card, textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: 14 },
  section: {
    gap: t.spacing[12],
    padding: t.spacing[16],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  editSection: {
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: t.spacing[12],
    paddingBottom: 0,
  },
  form: { gap: t.spacing[12] },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[8],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
  },
  segmentSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  segmentText: { color: colors.textSecondary, fontWeight: '700' },
  segmentTextSelected: { color: colors.primaryDark },
  field: { gap: 2 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: t.icon.touchMin,
    paddingVertical: t.spacing[8],
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[4] },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextSelected: { color: colors.primaryDark, fontWeight: '700' },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  weekdayAnchor: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 40,
    maxWidth: t.icon.touchMin,
  },
  weekdayHintAnchor: { zIndex: 1 },
  weekday: {
    minHeight: 44,
    paddingVertical: t.spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: t.radius.pill,
  },
  weekdaySelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  weekdayText: { color: colors.textSecondary, fontSize: 13 },
  weekdayTextSelected: { color: colors.card, fontWeight: '700' },
  weekdayDisabled: { backgroundColor: colors.background, borderColor: colors.border },
  weekdayTextDisabled: { color: colors.textSecondary, opacity: 0.4 },
  restHint: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 8,
    width: 108,
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.textPrimary,
  },
  restHintFirst: { left: 0 },
  restHintLast: { right: 0 },
  restHintText: { color: colors.card, fontSize: 13, fontWeight: '600' },
  restHintArrow: {
    position: 'absolute',
    bottom: -6,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.textPrimary,
  },
  restHintArrowFirst: { left: 16 },
  restHintArrowLast: { right: 16 },
  pageInputs: { gap: t.spacing[12] },
  primaryButton: {
    minHeight: t.icon.touchMin,
    paddingVertical: t.spacing[8],
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
  registeredList: { gap: t.spacing[8] },
  registeredTitle: { ...t.typography.section, color: t.colors.textPrimary },
  registeredHelp: {
    ...t.typography.caption,
    color: t.colors.textSecondary,
    marginBottom: t.spacing[4],
  },
  itemCard: {
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[8],
    gap: t.spacing[8],
    backgroundColor: t.colors.card,
    ...t.border.card,
    borderRadius: t.radius.normal,
    ...t.shadow,
  },
  typeIcon: {
    padding: t.spacing[8],
    borderRadius: t.radius.pill,
    backgroundColor: colors.primaryLight,
    flexShrink: 0,
  },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing[8] },
  itemActions: { flexDirection: 'row', gap: t.spacing[8] },
  itemActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: t.spacing[8],
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  itemActionText: { ...t.typography.caption, color: t.colors.textSecondary, textAlign: 'center' },
  deleteActionText: { color: t.colors.danger },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[12],
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...t.typography.cardTitle, color: t.colors.textPrimary },
  rowDetail: { ...t.typography.body, color: t.colors.textSecondary, flexShrink: 1 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.dividerSoft,
    maxWidth: '100%',
  },
  activeBadge: { backgroundColor: colors.primaryLight },
  badgeText: { ...t.typography.caption, color: t.colors.textSecondary },
  activeBadgeText: { color: t.colors.primary },
  empty: { color: colors.textSecondary, fontSize: 14 },
  success: { color: colors.primaryDark, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
});
