import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';
import { useCurrentChild, useSaveChildName } from '@/features/learning/hooks/use-learning';

export function ChildSettingsPanel() {
  const child = useCurrentChild();
  const save = useSaveChildName();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const value = draft ?? child.data?.name ?? '';
  return (
    <View style={s.panel}>
      <Text style={s.title}>아이 정보 관리</Text>
      <Text style={s.secondary}>현재 안전하게 변경 가능한 아이 이름만 제공해요.</Text>
      <LearningField
        label="아이 이름"
        value={value}
        onChangeText={(name) => {
          setDraft(name);
          setMessage('');
        }}
        disabled={!child.data || save.isPending}
        maxLength={20}
      />
      <LearningButton
        label={save.isPending ? '저장 중…' : '아이 이름 저장'}
        disabled={!child.data || save.isPending || draft === null || !value.trim()}
        onPress={() => {
          if (!child.data) return;
          save.mutate(
            { childId: child.data.id, name: value },
            {
              onSuccess: () => {
                setDraft(null);
                setMessage('아이 이름을 저장했어요.');
              },
              onError: (error) => setMessage(error.message),
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
