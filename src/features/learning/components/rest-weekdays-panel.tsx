import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useCurrentChild, useSaveRestWeekdays } from '@/features/learning/hooks/use-learning';

export function RestWeekdaysPanel() {
  const child = useCurrentChild();
  const save = useSaveRestWeekdays();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [message, setMessage] = useState('');
  const days = draft ?? child.data?.rest_weekdays ?? [];
  return (
    <View style={s.panel}>
      <Text style={s.title}>정기 휴식 요일</Text>
      <Text style={s.secondary}>
        선택한 요일에는 새 자동 공부를 만들지 않아요. 이미 만들어진 계획과 진행 중인 공부는
        유지되며, 필요한 숙제는 추가할 수 있어요.
      </Text>
      {child.isError ? (
        <LearningButton label="휴식 요일 다시 불러오기" onPress={() => void child.refetch()} />
      ) : (
        <>
          <View style={s.row}>
            {['월', '화', '수', '목', '금', '토', '일'].map((label, index) => {
              const day = index + 1;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${label}요일 쉬기`}
                  accessibilityState={{ checked: days.includes(day) }}
                  disabled={!child.data || save.isPending}
                  onPress={() => {
                    setDraft(
                      days.includes(day)
                        ? days.filter((value) => value !== day)
                        : [...days, day].sort(),
                    );
                    setMessage('');
                  }}
                  style={[s.choice, days.includes(day) && s.selected]}
                >
                  <Text style={s.text}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <LearningButton
            label="휴식 요일 저장"
            disabled={!child.data || save.isPending || draft === null}
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
          />
        </>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
    </View>
  );
}
