import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { completeOnboarding } from '@/features/onboarding/services/complete-onboarding';
import { useAppModeStore } from '@/store/app-mode.store';

const TARGET_OPTIONS = [30, 45, 60, 90] as const;
const PIN_PATTERN = /^\d{4}$/;

export function OnboardingScreen() {
  const refreshProfile = useAuth().refreshProfile;
  const setMode = useAppModeStore((state) => state.setMode);
  const [step, setStep] = useState(0);
  const [childName, setChildName] = useState('');
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState<number | null>(null);
  const [customTarget, setCustomTarget] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirmation, setPinConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const goNext = () => {
    setErrorMessage(null);
    if (step === 0 && childName.trim().length === 0) {
      setErrorMessage('아이 이름을 입력해 주세요.');
      return;
    }
    if (step === 1 && dailyTargetMinutes === null) {
      setErrorMessage(
        customTarget
          ? '하루 목표 공부시간을 입력해 주세요.'
          : '하루 목표 공부시간을 선택해 주세요.',
      );
      return;
    }
    if (step === 1 && (dailyTargetMinutes! < 10 || dailyTargetMinutes! > 240)) {
      setErrorMessage('하루 목표는 10~240분 사이로 입력해 주세요.');
      return;
    }
    setStep(Math.min(step + 1, 2));
  };

  const submit = async () => {
    if (submitting.current) return;
    setErrorMessage(null);
    if (!PIN_PATTERN.test(pin)) {
      setErrorMessage('부모 PIN은 숫자 4자리로 입력해 주세요.');
      return;
    }
    if (pin !== pinConfirmation) {
      setErrorMessage('PIN이 일치하지 않습니다.');
      return;
    }
    if (dailyTargetMinutes === null) return;

    submitting.current = true;
    setIsSubmitting(true);
    try {
      await completeOnboarding({ childName, dailyTargetMinutes, parentPin: pin });
      setMode('child');
      await refreshProfile();
    } catch {
      setErrorMessage('온보딩 정보를 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.keyboardView}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.progress}>{step + 1} / 3</Text>
            <Text style={styles.title}>{getStepTitle(step)}</Text>
            <Text style={styles.description}>{getStepDescription(step)}</Text>
          </View>

          <View style={styles.content}>
            {step === 0 && (
              <TextInput
                editable={!isSubmitting}
                autoFocus
                maxLength={20}
                onChangeText={setChildName}
                placeholder="아이 이름"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                value={childName}
              />
            )}

            {step === 1 && (
              <View style={styles.optionList}>
                {TARGET_OPTIONS.map((minutes) => {
                  const selected = !customTarget && dailyTargetMinutes === minutes;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={minutes}
                      onPress={() => {
                        setCustomTarget(false);
                        setDailyTargetMinutes(minutes);
                        setErrorMessage(null);
                      }}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                        {minutes}분
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: customTarget }}
                  onPress={() => {
                    setCustomTarget(true);
                    setDailyTargetMinutes(customMinutes ? Number(customMinutes) : null);
                    setErrorMessage(null);
                  }}
                  style={[styles.option, customTarget && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, customTarget && styles.optionTextSelected]}>
                    직접 입력
                  </Text>
                </Pressable>
                {customTarget && (
                  <View style={styles.field}>
                    <Text style={styles.label}>하루 목표 공부시간 (분)</Text>
                    <TextInput
                      editable={!isSubmitting}
                      accessibilityLabel="하루 목표 공부시간, 10~240분"
                      keyboardType="number-pad"
                      maxLength={3}
                      placeholder="예: 75"
                      placeholderTextColor={colors.textSecondary}
                      value={customMinutes}
                      onChangeText={(value) => {
                        const digits = value.replace(/\D/g, '');
                        setCustomMinutes(digits);
                        setDailyTargetMinutes(digits ? Number(digits) : null);
                        setErrorMessage(null);
                      }}
                      style={styles.input}
                    />
                    <Text style={styles.description}>10~240분 사이로 입력해 주세요.</Text>
                  </View>
                )}
              </View>
            )}

            {step === 2 && (
              <View style={styles.pinFields}>
                <View style={styles.field}>
                  <Text style={styles.label}>PIN 4자리</Text>
                  <TextInput
                    editable={!isSubmitting}
                    keyboardType="number-pad"
                    maxLength={4}
                    onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
                    secureTextEntry
                    style={styles.input}
                    value={pin}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>PIN 재입력</Text>
                  <TextInput
                    editable={!isSubmitting}
                    keyboardType="number-pad"
                    maxLength={4}
                    onChangeText={(value) => setPinConfirmation(value.replace(/\D/g, ''))}
                    secureTextEntry
                    style={styles.input}
                    value={pinConfirmation}
                  />
                </View>
              </View>
            )}

            {errorMessage && (
              <Text accessibilityRole="alert" style={styles.error}>
                {errorMessage}
              </Text>
            )}
          </View>

          <View style={styles.footer}>
            {step > 0 && (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => {
                  setErrorMessage(null);
                  setStep((current) => current - 1);
                }}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>이전</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={step === 2 ? submit : goNext}
              style={styles.primaryButton}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.primaryButtonText}>{step === 2 ? '완료' : '다음'}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStepTitle(step: number) {
  if (step === 0) return '아이 이름을 알려주세요';
  if (step === 1) return '하루 목표를 정해볼까요?';
  return '부모 PIN을 설정해 주세요';
}

function getStepDescription(step: number) {
  if (step === 0) return '아이 화면에서 사용할 이름이에요.';
  if (step === 1) return '하루에 집중할 공부시간을 선택해 주세요.';
  return '부모 화면으로 전환할 때 사용할 숫자 4자리예요.';
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 72,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.sm },
  progress: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  content: { flexGrow: 1, paddingTop: spacing.xxl, gap: spacing.md },
  input: {
    height: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    fontSize: 17,
  },
  optionList: { gap: spacing.sm },
  option: {
    height: sizing.buttonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  optionTextSelected: { color: colors.primaryDark },
  pinFields: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  error: { color: colors.error, fontSize: 13 },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.lg },
  backButton: {
    flex: 1,
    minWidth: 0,
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    flex: 2,
    minWidth: 0,
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.card, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
