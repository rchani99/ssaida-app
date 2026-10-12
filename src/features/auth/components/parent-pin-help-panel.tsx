import { useState } from 'react';
import { Text, View } from 'react-native';

import { ParentPinSettingsPanel } from '@/features/auth/components/parent-pin-settings-panel';
import { SensitiveAccountPanel } from '@/features/auth/components/sensitive-account-panel';
import { sensitiveActionsEnabled } from '@/features/auth/services/sensitive-actions-enabled';
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
  const back = () => {
    if (!busy) setPage('menu');
  };
  if (page === 'change') {
    return (
      <View style={{ gap: 16 }}>
        <ParentPinSettingsPanel
          onBusyChange={(value) => {
            setBusy(value);
            onBusyChange(value);
          }}
        />
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
    return sensitiveActionsEnabled() ? (
      <SensitiveAccountPanel kind="recovery" onClose={back} />
    ) : (
      <View style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={s.title}>
          PIN을 잊으셨나요?
        </Text>
        <Text style={s.text}>PIN을 잊었을 때 재설정하는 기능은 아직 준비 중이에요.</Text>
        <Text style={s.secondary}>
          기존 PIN은 조회할 수 없어요. 로그아웃하거나 다시 로그인해도 PIN은 초기화되지 않아요.
        </Text>
        <LearningButton label="돌아가기" variant="outline" onPress={back} />
      </View>
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
