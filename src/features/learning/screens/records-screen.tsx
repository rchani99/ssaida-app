import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import {
  formatRecordPeriod,
  RecordsHistoryList,
} from '@/features/learning/components/records-history-list';
import { useCurrentChild, useReviewTasksInRange } from '@/features/learning/hooks/use-learning';
import { useSeoulToday } from '@/features/learning/hooks/use-seoul-today';
import {
  buildMonthlyRecords,
  compareMonthlyRate,
  compareWeeklyRate,
  endOfMonth,
  groupHistoryForWeek,
  shiftDate,
  shiftMonth,
  startOfMonth,
  startOfWeek,
} from '@/features/learning/utils/records';
import { ParentCard } from '@/shared/components/parent-ui';
import { ScreenMessage } from '@/shared/components/screen-message';
import { SegmentedTabs } from '@/shared/components/segmented-tabs';

import type { MonthlyCalendarDay, RecordsDay } from '@/features/learning/utils/records';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function RecordsScreen() {
  const router = useRouter();
  const today = useSeoulToday();
  const currentWeekStart = startOfWeek(today);
  const currentMonthStart = startOfMonth(today);
  const [periodMode, setPeriodMode] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);
  const [selectedMonthStart, setSelectedMonthStart] = useState(currentMonthStart);
  const child = useCurrentChild();
  const isCurrentWeek = selectedWeekStart === currentWeekStart;
  const isCurrentMonth = selectedMonthStart === currentMonthStart;
  const selectedReferenceDate = isCurrentWeek ? today : shiftDate(selectedWeekStart, 6);
  const rangeStart =
    periodMode === 'weekly' ? shiftDate(selectedWeekStart, -7) : shiftMonth(selectedMonthStart, -1);
  const rangeEnd =
    periodMode === 'weekly'
      ? selectedReferenceDate
      : isCurrentMonth
        ? today
        : endOfMonth(selectedMonthStart);
  const records = useReviewTasksInRange(child.data?.id, rangeStart, rangeEnd);

  if (child.isLoading || (child.data && records.isLoading))
    return <ScreenMessage loading message="기록을 불러오고 있어요." />;
  if (child.isError || !child.data || records.isError)
    return (
      <ScreenMessage
        actionLabel="다시 불러오기"
        message="기록을 불러오지 못했어요."
        onAction={() => void (child.isError ? child.refetch() : records.refetch())}
      />
    );

  const tasks = records.data ?? [];
  const comparison = compareWeeklyRate(tasks, selectedReferenceDate);
  const summary = comparison.current;
  const recent = groupHistoryForWeek(tasks, summary.weekStart, selectedReferenceDate).slice(0, 1);
  const monthlyComparison = compareMonthlyRate(tasks, selectedMonthStart, today);
  const monthly = monthlyComparison.current;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.periodHeader}>
        <SegmentedTabs
          options={[
            { value: 'weekly', label: '주간' },
            { value: 'monthly', label: '월간' },
          ]}
          value={periodMode}
          onChange={setPeriodMode}
        />
        <View style={styles.weekNavigation}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={periodMode === 'weekly' ? '이전 주' : '이전 달'}
            onPress={() =>
              periodMode === 'weekly'
                ? setSelectedWeekStart((week) => shiftDate(week, -7))
                : setSelectedMonthStart((month) => shiftMonth(month, -1))
            }
            style={styles.weekButton}
          >
            <ChevronLeft {...dashboardIconProps} color={t.colors.textPrimary} />
          </Pressable>
          <Text style={styles.period}>
            {periodMode === 'weekly'
              ? formatRecordPeriod(summary.weekStart, summary.weekEnd)
              : formatMonth(selectedMonthStart)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={periodMode === 'weekly' ? '다음 주' : '다음 달'}
            accessibilityState={{
              disabled: periodMode === 'weekly' ? isCurrentWeek : isCurrentMonth,
            }}
            disabled={periodMode === 'weekly' ? isCurrentWeek : isCurrentMonth}
            onPress={() =>
              periodMode === 'weekly'
                ? setSelectedWeekStart((week) => {
                    const next = shiftDate(week, 7);
                    return next > currentWeekStart ? currentWeekStart : next;
                  })
                : setSelectedMonthStart((month) => {
                    const next = shiftMonth(month, 1);
                    return next > currentMonthStart ? currentMonthStart : next;
                  })
            }
            style={[
              styles.weekButton,
              (periodMode === 'weekly' ? isCurrentWeek : isCurrentMonth) &&
                styles.weekButtonDisabled,
            ]}
          >
            <ChevronRight
              {...dashboardIconProps}
              color={
                (periodMode === 'weekly' ? isCurrentWeek : isCurrentMonth)
                  ? t.colors.divider
                  : t.colors.textPrimary
              }
            />
          </Pressable>
        </View>
        {periodMode === 'weekly' && !isCurrentWeek && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이번 주로 돌아가기"
            onPress={() => setSelectedWeekStart(currentWeekStart)}
            style={styles.todayButton}
          >
            <Text style={styles.todayButtonText}>이번 주</Text>
          </Pressable>
        )}
        {periodMode === 'monthly' && !isCurrentMonth && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이번 달로 돌아가기"
            onPress={() => setSelectedMonthStart(currentMonthStart)}
            style={styles.todayButton}
          >
            <Text style={styles.todayButtonText}>이번 달</Text>
          </Pressable>
        )}
      </View>

      {periodMode === 'weekly' ? (
        <>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              이번 주 실천
            </Text>
            <View style={styles.statsRow}>
              <ParentCard style={styles.practiceCard}>
                <ProgressRing rate={summary.rate} />
                <Text style={styles.heroCount}>
                  {summary.plannedCount}개 중 {summary.practicedCount}개 완료
                </Text>
              </ParentCard>
              <ParentCard style={styles.timeCard}>
                <View style={styles.timeHeader}>
                  <View style={styles.iconCircle}>
                    <Clock3 {...dashboardIconProps} color={t.colors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>계획 시간</Text>
                </View>
                <Text style={styles.timeValue}>{summary.plannedMinutes}분</Text>
                <View
                  accessible
                  accessibilityLabel="실제 수행 시간은 현재 기록되지 않아요"
                  style={styles.disabledTrack}
                />
                <Text style={styles.unavailable}>실제 수행 시간은{`\n`}현재 기록되지 않아요</Text>
              </ParentCard>
            </View>
            <Comparison
              difference={comparison.difference}
              previousRate={comparison.previous.rate}
            />
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              요일별 달성
            </Text>
            <ParentCard>
              <View style={styles.chart}>
                {summary.days.map((day, index) => (
                  <DayBar
                    key={day.date}
                    day={day}
                    label={DAY_LABELS[index]}
                    future={day.date > today}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                <Legend color={t.colors.primary} label="실천" />
                <Legend color={t.colors.warningBackground} label="미실천" />
                <Legend color={t.colors.divider} label="계획 없음" />
              </View>
            </ParentCard>
          </View>

          <View style={styles.section}>
            <View style={styles.historyHeading}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                최근 학습 기록
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/parent-records')}
                style={styles.allButton}
              >
                <Text style={styles.allButtonText}>전체보기</Text>
                <ArrowRight
                  {...dashboardIconProps}
                  size={t.icon.size.small}
                  color={t.colors.primary}
                />
              </Pressable>
            </View>
            <RecordsHistoryList
              groups={recent}
              tasks={tasks}
              emptyMessage="아직 지난 학습 기록이 없어요."
            />
          </View>
        </>
      ) : (
        <MonthlyRecords
          monthly={monthly}
          difference={monthlyComparison.difference}
          previousRate={monthlyComparison.previous.rate}
          onOpenHistory={() => router.push('/parent-records')}
        />
      )}
    </ScrollView>
  );
}

function MonthlyRecords({
  monthly,
  difference,
  previousRate,
  onOpenHistory,
}: {
  monthly: ReturnType<typeof buildMonthlyRecords>;
  difference: number | null;
  previousRate: number | null;
  onOpenHistory: () => void;
}) {
  const firstDay = new Date(`${monthly.monthStart}T12:00:00+09:00`).getUTCDay() || 7;
  return (
    <>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          이번 달 실천
        </Text>
        <View style={styles.statsRow}>
          <ParentCard style={styles.practiceCard}>
            <ProgressRing rate={monthly.rate} scope="이번 달" />
            <Text style={styles.heroCount}>
              {monthly.plannedCount}개 중 {monthly.practicedCount}개 완료
            </Text>
          </ParentCard>
          <ParentCard style={styles.timeCard}>
            <View style={styles.timeHeader}>
              <View style={styles.iconCircle}>
                <Clock3 {...dashboardIconProps} color={t.colors.primary} />
              </View>
              <Text style={styles.cardTitle}>계획 시간</Text>
            </View>
            <Text style={styles.timeValue}>{formatMonthlyMinutes(monthly.plannedMinutes)}</Text>
            <Text style={styles.unavailable}>
              {monthly.plannedMinutes >= 60
                ? `총 ${formatMonthlyMinutes(monthly.plannedMinutes)} · 선택한 달 합계`
                : '선택한 달의 계획 시간 합계'}
            </Text>
          </ParentCard>
        </View>
        <MonthlyComparison difference={difference} previousRate={previousRate} />
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          주차별 실천률
        </Text>
        <ParentCard style={styles.monthlyChartCard}>
          {monthly.weeks.map((week) => (
            <View
              accessible
              accessibilityLabel={`${week.label} ${week.rate === null ? '계획 없음' : `실천률 ${week.rate}%`}`}
              key={week.label}
              style={styles.weekRow}
            >
              <Text style={styles.weekLabel}>{week.label}</Text>
              <View style={styles.weekTrack}>
                {week.rate !== null && (
                  <View style={[styles.weekFill, { width: `${week.rate}%` }]} />
                )}
              </View>
              <Text style={styles.weekRate}>{week.rate === null ? '없음' : `${week.rate}%`}</Text>
            </View>
          ))}
        </ParentCard>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          월간 달력
        </Text>
        <ParentCard style={styles.calendarCard}>
          <View style={styles.calendarRow}>
            {DAY_LABELS.map((label) => (
              <Text key={label} style={styles.calendarWeekday}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {Array.from({ length: firstDay - 1 }, (_, index) => (
              <View key={`blank-${index}`} style={styles.calendarCell} />
            ))}
            {monthly.calendar.map((day) => (
              <CalendarDay key={day.date} day={day} />
            ))}
          </View>
          <View style={styles.legend}>
            <Legend color={t.colors.primary} label="완료" />
            <Legend color={t.colors.warning} label="일부 실천" />
            <Legend color={t.colors.warningBackground} label="미실천" />
            <Legend color={t.colors.divider} label="계획 없음" />
          </View>
        </ParentCard>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenHistory}
        style={styles.monthHistoryButton}
      >
        <Text style={styles.monthHistoryText}>이번 달 기록 전체보기</Text>
        <ArrowRight {...dashboardIconProps} size={t.icon.size.small} color={t.colors.primary} />
      </Pressable>
    </>
  );
}

function CalendarDay({ day }: { day: MonthlyCalendarDay }) {
  const colors = {
    complete: { background: t.colors.primary, text: t.colors.card },
    partial: { background: t.colors.warning, text: t.colors.card },
    missed: { background: t.colors.warningBackground, text: t.colors.textPrimary },
    none: { background: t.colors.dividerSoft, text: t.colors.textSecondary },
  }[day.status];
  const labels = { complete: '완료', partial: '일부 실천', missed: '미실천', none: '계획 없음' };
  return (
    <View
      accessible
      accessibilityLabel={`${Number(day.date.slice(8))}일 ${labels[day.status]}`}
      style={styles.calendarCell}
    >
      <View style={[styles.calendarDate, { backgroundColor: colors.background }]}>
        <Text style={[styles.calendarDateText, { color: colors.text }]}>
          {Number(day.date.slice(8))}
        </Text>
      </View>
    </View>
  );
}

function MonthlyComparison({
  difference,
  previousRate,
}: {
  difference: number | null;
  previousRate: number | null;
}) {
  if (difference === null || previousRate === null)
    return <Text style={styles.monthlyComparisonUnavailable}>지난달 비교 · 비교할 계획 없음</Text>;
  const Icon = difference > 0 ? ArrowUp : difference < 0 ? ArrowDown : Minus;
  const color =
    difference > 0 ? t.colors.primary : difference < 0 ? t.colors.warning : t.colors.textSecondary;
  const value = difference > 0 ? `+${difference}` : String(difference);
  return (
    <View style={styles.monthlyComparison}>
      <Icon {...dashboardIconProps} size={t.icon.size.small} color={color} />
      <Text style={[styles.comparisonText, { color }]}>지난달 대비 {value}%p</Text>
    </View>
  );
}

function formatMonthlyMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function formatMonth(date: string) {
  return `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월`;
}

function ProgressRing({ rate, scope = '이번 주' }: { rate: number | null; scope?: string }) {
  const size = 104;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = rate ?? 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rate === null ? `${scope} 계획 없음` : `${scope} 실천률 ${rate}%`}
      accessibilityValue={rate === null ? undefined : { min: 0, max: 100, now: rate }}
      style={styles.ring}
    >
      <Svg width={size} height={size} accessibilityElementsHidden>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={t.colors.divider}
          strokeWidth={stroke}
          fill="none"
        />
        {rate !== null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={t.colors.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress / 100)}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <View pointerEvents="none" style={styles.ringLabel}>
        <Text style={rate === null ? styles.noPlan : styles.rate}>
          {rate === null ? '계획 없음' : `${rate}%`}
        </Text>
        {rate !== null && <Text style={styles.rateCaption}>실천률</Text>}
      </View>
    </View>
  );
}

function Comparison({
  difference,
  previousRate,
}: {
  difference: number | null;
  previousRate: number | null;
}) {
  if (difference === null || previousRate === null)
    return <Text style={styles.comparisonUnavailable}>지난주 비교 · 비교할 계획 없음</Text>;
  const Icon = difference > 0 ? ArrowUp : difference < 0 ? ArrowDown : Minus;
  const color =
    difference > 0 ? t.colors.primary : difference < 0 ? t.colors.warning : t.colors.textSecondary;
  const value = difference > 0 ? `+${difference}` : String(difference);
  return (
    <View style={styles.comparison}>
      <Icon {...dashboardIconProps} size={t.icon.size.small} color={color} />
      <Text style={[styles.comparisonText, { color }]}>지난주 같은 요일까지 {value}%p</Text>
    </View>
  );
}

function DayBar({ day, label, future }: { day: RecordsDay; label: string; future: boolean }) {
  const ratio = (day.rate ?? 0) / 100;
  const status = future ? '예정' : day.planned === 0 ? '없음' : `${day.practiced}/${day.planned}`;
  return (
    <View
      accessible
      accessibilityLabel={`${label}요일 ${future ? '예정' : day.planned === 0 ? '계획 없음' : `${day.planned}개 중 ${day.practiced}개 실천`}`}
      style={styles.day}
    >
      <Text style={styles.dayValue}>{status}</Text>
      <View style={[styles.barTrack, day.planned > 0 && !future && styles.barMissed]}>
        {day.practiced > 0 && !future && (
          <View style={[styles.barDone, { height: `${Math.round(ratio * 100)}%` }]} />
        )}
      </View>
      <Text style={styles.dayName}>{label}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: t.layout.screenPadding,
    gap: t.spacing[24],
    backgroundColor: t.colors.background,
  },
  periodHeader: { gap: t.spacing[12] },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[8],
  },
  weekButton: {
    width: t.icon.touchMin,
    height: t.icon.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.card,
    ...t.border.card,
  },
  weekButtonDisabled: { borderColor: t.colors.divider, backgroundColor: t.colors.background },
  period: {
    ...t.typography.cardTitle,
    color: t.colors.textPrimary,
    minWidth: 112,
    textAlign: 'center',
  },
  todayButton: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: t.spacing[16],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.card,
    ...t.border.card,
  },
  todayButtonText: { ...t.typography.chip, color: t.colors.primary },
  section: { gap: t.spacing[12] },
  sectionTitle: { ...t.typography.section, color: t.colors.textPrimary },
  statsRow: { flexDirection: 'row', alignItems: 'stretch', gap: t.spacing[12] },
  practiceCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[8],
    paddingHorizontal: t.spacing[8],
  },
  ring: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rate: { ...t.typography.metric, color: t.colors.primary },
  rateCaption: { ...t.typography.caption, color: t.colors.textSecondary },
  noPlan: { ...t.typography.caption, color: t.colors.textSecondary },
  heroCount: {
    ...t.typography.body,
    color: t.colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[4] },
  comparisonText: { ...t.typography.caption, fontWeight: '600', flexShrink: 1 },
  comparisonUnavailable: { ...t.typography.caption, color: t.colors.textSecondary },
  monthlyComparison: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[4],
    paddingHorizontal: t.spacing[12],
    paddingVertical: t.spacing[8],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.dividerSoft,
  },
  monthlyComparisonUnavailable: {
    ...t.typography.caption,
    color: t.colors.textSecondary,
    opacity: 0.72,
  },
  timeCard: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: t.spacing[8],
    paddingHorizontal: t.spacing[12],
  },
  timeHeader: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[8] },
  iconCircle: {
    padding: t.spacing[8],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  cardTitle: { ...t.typography.cardTitle, color: t.colors.textPrimary },
  timeValue: { ...t.typography.metric, color: t.colors.textPrimary },
  disabledTrack: {
    height: t.spacing[12],
    borderWidth: 1,
    borderColor: t.colors.divider,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  unavailable: { ...t.typography.caption, color: t.colors.textSecondary },
  chart: {
    height: 158,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: t.spacing[8],
  },
  day: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: t.spacing[4],
  },
  dayValue: { fontSize: 10, lineHeight: 14, color: t.colors.textSecondary },
  barTrack: {
    width: '70%',
    maxWidth: 28,
    height: 104,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: t.spacing[8],
    backgroundColor: t.colors.divider,
  },
  barMissed: { backgroundColor: t.colors.warningBackground },
  barDone: { width: '100%', borderRadius: t.spacing[8], backgroundColor: t.colors.primary },
  dayName: { ...t.typography.caption, color: t.colors.textPrimary, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: t.spacing[12] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[4] },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...t.typography.caption, color: t.colors.textSecondary },
  monthlyChartCard: { gap: t.spacing[12] },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[8] },
  weekLabel: { ...t.typography.caption, width: 42, color: t.colors.textPrimary, fontWeight: '600' },
  weekTrack: {
    flex: 1,
    height: t.spacing[12],
    overflow: 'hidden',
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.dividerSoft,
  },
  weekFill: { height: '100%', borderRadius: t.radius.pill, backgroundColor: t.colors.primary },
  weekRate: {
    ...t.typography.caption,
    width: 36,
    textAlign: 'right',
    color: t.colors.textSecondary,
  },
  calendarCard: { gap: t.spacing[12] },
  calendarRow: { flexDirection: 'row' },
  calendarWeekday: {
    ...t.typography.caption,
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: t.colors.textSecondary,
    fontWeight: '600',
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDate: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.pill,
  },
  calendarDateText: { ...t.typography.caption, fontWeight: '700' },
  monthHistoryButton: {
    minHeight: t.icon.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[4],
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.card,
    ...t.border.card,
  },
  monthHistoryText: { ...t.typography.button, color: t.colors.primary },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing[8],
  },
  allButton: {
    minHeight: t.icon.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[4],
    paddingLeft: t.spacing[12],
  },
  allButtonText: { ...t.typography.button, color: t.colors.primary },
});
