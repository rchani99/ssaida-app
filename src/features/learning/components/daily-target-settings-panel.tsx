import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useCurrentChild, useSaveDailyTargetMinutes } from '@/features/learning/hooks/use-learning';

const OPTIONS = [30, 45, 60, 90] as const;

export function DailyTargetSettingsPanel() {
  const child = useCurrentChild();
  const save = useSaveDailyTargetMinutes();
  const [draft, setDraft] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const value = draft ?? child.data?.daily_target_minutes ?? 60;
  return (
    <View style={s.panel}>
      <Text style={s.title}>학습 시간 기본값</Text>
      <Text style={s.secondary}>
        오늘 이미 만들어진 계획은 유지되고, 이후 새 계획부터 적용돼요.
      </Text>
      <View style={s.row}>
        {OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === minutes }}
            disabled={!child.data || save.isPending}
            onPress={() => {
              setDraft(minutes);
              setMessage('');
            }}
            style={[s.choice, value === minutes && s.selected]}
          >
            <Text style={s.text}>{minutes}분</Text>
          </Pressable>
        ))}
      </View>
      <LearningButton
        label={save.isPending ? '저장 중…' : '기본 시간 저장'}
        disabled={!child.data || save.isPending || draft === null}
        onPress={() => {
          if (!child.data) return;
          save.mutate(
            { childId: child.data.id, minutes: value },
            {
              onSuccess: () => {
                setDraft(null);
                setMessage('학습 시간 기본값을 저장했어요.');
              },
              onError: () => setMessage('저장하지 못했어요. 다시 시도해 주세요.'),
            },
          );
        }}
      />
      {message && (
        <Text accessibilityRole="alert" style={s.secondary}>
          {message}
        </Text>
      )}
    </View>
  );
}
