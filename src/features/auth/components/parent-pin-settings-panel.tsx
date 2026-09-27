import { useState } from 'react';
import { Text, View } from 'react-native';

import { changeParentPin } from '@/features/auth/services/change-parent-pin';
import {
  LearningButton,
  LearningField,
  learningStyles as s,
} from '@/features/learning/components/learning-controls';

export function ParentPinSettingsPanel() {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const clear = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmation('');
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>부모 PIN 변경</Text>
      <Text style={s.secondary}>현재 PIN을 확인한 뒤 숫자 4자리 새 PIN으로 변경해요.</Text>
      <LearningField
        label="현재 PIN"
        value={currentPin}
        onChangeText={setCurrentPin}
        numeric
        secure
        maxLength={4}
        disabled={busy}
      />
      <LearningField
        label="새 PIN"
        value={newPin}
        onChangeText={setNewPin}
        numeric
        secure
        maxLength={4}
        disabled={busy}
      />
      <LearningField
        label="새 PIN 확인"
        value={confirmation}
        onChangeText={setConfirmation}
        numeric
        secure
        maxLength={4}
        disabled={busy}
      />
      <LearningButton
        label={busy ? '변경 중…' : 'PIN 변경'}
        disabled={
          busy || currentPin.length !== 4 || newPin.length !== 4 || confirmation.length !== 4
        }
        onPress={() => {
          if (newPin !== confirmation) {
            setMessage('새 PIN이 일치하지 않아요.');
            return;
          }
          if (newPin === currentPin) {
            setMessage('현재 PIN과 다른 PIN을 입력해 주세요.');
            return;
          }
          setBusy(true);
          setMessage('');
          void changeParentPin(currentPin, newPin)
            .then((result) => {
              setMessage(
                result === 'changed'
                  ? 'PIN을 변경했어요.'
                  : result === 'invalid'
                    ? '현재 PIN이 맞지 않아요.'
                    : result === 'locked'
                      ? '5분 뒤에 다시 시도해 주세요.'
                      : '현재 PIN과 다른 PIN을 입력해 주세요.',
              );
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => {
              clear();
              setBusy(false);
            });
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
