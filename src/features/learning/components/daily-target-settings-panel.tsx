import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useCurrentChild, useSaveDailyTargetMinutes } from '@/features/learning/hooks/use-learning';

const OPTIONS = [30, 45, 60, 90] as const;

export function DailyTargetSettingsPanel() {
  const child = useCurrentChild();
  const save = useSaveDailyTargetMinutes();
  const [draft, setDraft] = useState<string | null>(null);
  const [custom, setCustom] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const savedValue = child.data?.daily_target_minutes ?? 60;
  const textValue = draft ?? String(savedValue);
  const value = Number(textValue);
  const isCustom = custom ?? !OPTIONS.some((minutes) => minutes === savedValue);
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
            accessibilityState={{ selected: !isCustom && value === minutes }}
            disabled={!child.data || save.isPending}
            onPress={() => {
              setCustom(false);
              setDraft(String(minutes));
              setMessage('');
            }}
            style={[s.choice, !isCustom && value === minutes && s.selected]}
          >
            <Text style={s.text}>{minutes}분</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isCustom }}
          disabled={!child.data || save.isPending}
          onPress={() => {
            setCustom(true);
            setMessage('');
          }}
          style={[s.choice, isCustom && s.selected]}
        >
          <Text style={s.text}>직접 입력</Text>
        </Pressable>
      </View>
      {isCustom && (
        <>
          <LearningField
            label="하루 목표 공부시간 (분)"
            value={textValue}
            numeric
            maxLength={3}
            disabled={!child.data || save.isPending}
            onChangeText={(text) => {
              setDraft(text);
              setMessage('');
            }}
          />
          <Text style={s.secondary}>10~240분 사이로 입력해 주세요.</Text>
        </>
      )}
      <LearningButton
        label={save.isPending ? '저장 중…' : '기본 시간 저장'}
        disabled={!child.data || save.isPending || draft === null}
        onPress={() => {
          if (!child.data) return;
          if (!Number.isInteger(value) || value < 10 || value > 240) {
            setMessage('하루 목표는 10~240분 사이로 입력해 주세요.');
            return;
          }
          save.mutate(
            { childId: child.data.id, minutes: value },
            {
              onSuccess: () => {
                setDraft(null);
                setCustom(null);
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
