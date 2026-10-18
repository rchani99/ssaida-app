import { StyleSheet, Text } from 'react-native';

import { colors } from '@/design-system/tokens';
import { useDailyPoints } from '@/features/learning/hooks/use-daily-points';
import { useSeoulToday } from '@/features/learning/hooks/use-seoul-today';

export function TodayPointsNote({ childId }: { childId: string }) {
  const today = useSeoulToday();
  const query = useDailyPoints(childId, today);
  const result = query.data;
  if (query.isError) {
    return (
      <Text accessibilityRole="button" onPress={() => void query.refetch()} style={styles.note}>
        오늘 받은 포인트를 불러오지 못했어요. 눌러서 다시 확인해 주세요.
      </Text>
    );
  }
  let message = '오늘 받은 포인트를 확인하고 있어요.';
  if (!query.isLoading && result) {
    const points = result.points.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
    if (result.points > 0) {
      return (
        <Text accessibilityLiveRegion="polite" style={styles.note}>
          <Text style={styles.earned}>
            {result.unrecordedCount > 0 ? '오늘 기록된 포인트는 ' : '오늘 부모님 확인으로 '}
            <Text style={styles.points}>+{points}</Text>
            {result.unrecordedCount > 0 ? '포인트예요.' : '포인트 받았어요!'}
          </Text>
          {result.unrecordedCount > 0 && ' 이전 확인분은 포함되지 않았어요.'}
        </Text>
      );
    }
    message = result.unrecordedCount > 0
      ? '오늘 이전에 확인받은 포인트는 기록이 없어 합계를 알 수 없어요.'
      : '오늘 받은 포인트는 0포인트예요. 공부를 마치고 부모님께 확인받아 보세요.';
  }
  return <Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>;
}

const styles = StyleSheet.create({
  note: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  earned: { fontWeight: '700' },
  points: { color: '#B84646' },
});
