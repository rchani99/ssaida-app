import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t } from '@/design-system/tokens';
import { LearningButton } from '@/features/learning/components/learning-controls';
import { useCurrentChild, useSaveRestWeekdays } from '@/features/learning/hooks/use-learning';

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];

export function RestWeekdaysPanel() {
  const child = useCurrentChild();
  const save = useSaveRestWeekdays();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [message, setMessage] = useState('');
  const [weekWidth, setWeekWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const cellMin = Math.max(t.icon.touchMin, t.typography.caption.fontSize * 2 * fontScale + t.spacing[16]);
  const columns = weekWidth >= cellMin * 7 + t.spacing[4] * 6 + t.spacing[8] * 2 ? 7 : 4;
  const weekRows = columns === 7 ? [weekdays] : [weekdays.slice(0, 4), weekdays.slice(4)];
  const days = draft ?? child.data?.rest_weekdays ?? [];
  const unchanged = weekdays.every((_, index) =>
    days.includes(index + 1) === (child.data?.rest_weekdays ?? []).includes(index + 1),
  );
  const saveDisabled = !child.data || save.isPending || unchanged;
  return (
    <View style={styles.panel}>
      <View style={styles.description}>
        <Text accessibilityRole="header" style={styles.title}>정기 휴식 요일</Text>
        <Text style={styles.secondary}>선택한 요일에는 새 자동 공부를 만들지 않아요.</Text>
        <Text style={styles.secondary}>이미 만들어진 계획과 진행 중인 공부는 유지돼요.</Text>
        <Text style={styles.secondary}>필요한 숙제는 직접 추가할 수 있어요.</Text>
      </View>
      {child.isError ? (
        <LearningButton label="휴식 요일 다시 불러오기" onPress={() => void child.refetch()} />
      ) : (
        <>
          <View style={styles.selection}>
          <View style={styles.week} onLayout={({ nativeEvent }) => setWeekWidth(nativeEvent.layout.width)}>
            {weekRows.map((row, rowIndex) => <View key={rowIndex} style={styles.days}>
            {row.map((label, index) => {
              const day = rowIndex * columns + index + 1;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${label}요일, ${days.includes(day) ? '휴식일로 선택됨' : '선택되지 않음'}`}
                  accessibilityState={{ checked: days.includes(day), disabled: !child.data || save.isPending }}
                  disabled={!child.data || save.isPending}
                  onPress={() => {
                    setDraft(
                      days.includes(day)
                        ? days.filter((value) => value !== day)
                        : [...days, day].sort(),
                    );
                    setMessage('');
                  }}
                  style={[styles.day, days.includes(day) && styles.selected, (!child.data || save.isPending) && styles.disabled]}
                >
                  <Text style={[styles.dayText, days.includes(day) && styles.selectedText]}>{label}</Text>
                  <View style={styles.indicator} accessible={false} importantForAccessibility="no-hide-descendants">
                    {days.includes(day) && <Check {...dashboardIconProps} size={t.icon.size.small} color={t.colors.primary} />}
                  </View>
                  <Text accessible={false} style={[styles.restLabel, !days.includes(day) && styles.hiddenLabel]}>휴식</Text>
                </Pressable>
              );
            })}
            {row.length < columns && <View style={styles.emptyCell} accessible={false} />}
            </View>)}
          </View>
          <Text style={styles.secondary}>
            {days.length
              ? `매주 ${weekdays.filter((_, index) => days.includes(index + 1)).join(' · ')}요일은 쉬는 날이에요.`
              : '정기 휴식 요일이 없어요.'}
          </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saveDisabled, busy: save.isPending }}
            style={[styles.save, saveDisabled && styles.disabled]}
            disabled={saveDisabled}
            onPress={() => {
              if (!child.data) return;
              save.mutate(
                { childId: child.data.id, weekdays: days },
                {
                  onSuccess: () => {
                    setDraft(null);
                    setMessage('휴식 요일을 저장했어요.');
                  },
                  onError: () => setMessage('저장하지 못했어요. 다시 시도해 주세요.'),
                },
              );
            }}
          >
            <Text style={styles.saveText}>휴식 요일 저장</Text>
          </Pressable>
        </>
      )}
      {message && (
        <Text accessibilityRole="alert" style={styles.secondary}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: t.spacing[16], gap: t.spacing[20], backgroundColor: t.colors.card, ...t.border.card, borderRadius: t.radius.normal },
  description: { gap: t.spacing[8] },
  title: { ...t.typography.section, color: t.colors.textPrimary },
  secondary: { ...t.typography.body, color: t.colors.textSecondary },
  selection: { gap: t.spacing[12] },
  week: { padding: t.spacing[8], gap: t.spacing[4], borderRadius: t.radius.normal, backgroundColor: t.colors.background },
  days: { flexDirection: 'row', alignItems: 'stretch', gap: t.spacing[4] },
  day: { flex: 1, minWidth: 0, minHeight: t.icon.touchMin, paddingVertical: t.spacing[8], paddingHorizontal: t.spacing[4], alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.colors.divider, borderRadius: t.radius.normal, backgroundColor: t.colors.card },
  emptyCell: { flex: 1 },
  indicator: { height: t.icon.size.small, alignItems: 'center', justifyContent: 'center' },
  restLabel: { ...t.typography.caption, color: t.colors.primary, textAlign: 'center' },
  hiddenLabel: { opacity: 0 },
  dayText: { ...t.typography.body, color: t.colors.textSecondary },
  selected: { backgroundColor: colors.primaryLight, borderColor: t.colors.primary },
  selectedText: { color: t.colors.primary, fontWeight: '600' },
  save: { minHeight: t.icon.touchMin, paddingHorizontal: t.spacing[16], paddingVertical: t.spacing[8], alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.normal, backgroundColor: t.colors.primary },
  saveText: { ...t.typography.button, color: t.colors.card, textAlign: 'center' },
  disabled: { opacity: 0.45 },
});
