import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ParentPinSettingsPanel } from '@/features/auth/components/parent-pin-settings-panel';
import { SensitiveAccountPanel } from '@/features/auth/components/sensitive-account-panel';
import {
  LearningButton,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';

export function ParentPinHelpPanel({
  onClose,
  onBusyChange,
}: {
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [page, setPage] = useState<'menu' | 'change' | 'recovery'>('menu');
  const [busy, setBusy] = useState(false);
  const handleBusyChange = useCallback(
    (value: boolean) => {
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  if (page === 'change') {
    return (
      <View style={{ gap: 16 }}>
        <ParentPinSettingsPanel onBusyChange={handleBusyChange} />
        <LearningButton
          label="PIN 입력으로 돌아가기"
          variant="outline"
          disabled={busy}
          onPress={onClose}
        />
      </View>
    );
  }
  if (page === 'recovery') {
    return (
      <SensitiveAccountPanel
        kind="recovery"
        completionLabel="PIN 입력으로 돌아가기"
        onClose={onClose}
        onBusyChange={handleBusyChange}
      />
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={s.title}>
        PIN 번호 찾기/변경
      </Text>
      <Text style={s.secondary}>현재 PIN을 알고 있는지에 따라 선택해 주세요.</Text>
      <LearningButton
        label="현재 PIN을 알아요 · 변경하기"
        variant="primary"
        onPress={() => setPage('change')}
      />
      <LearningButton
        label="PIN을 잊었어요 · 재설정"
        variant="outline"
        onPress={() => setPage('recovery')}
      />
      <LearningButton label="PIN 입력으로 돌아가기" variant="neutral" onPress={onClose} />
    </View>
  );
}
