import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { signInWithGoogle } from '@/features/auth/services/google-oauth';

export function LoginScreen() {
  const { errorMessage: configurationError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Google 로그인에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = errorMessage ?? configurationError;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.copy}>
          <Text style={styles.title}>쌓이다</Text>
          <Text style={styles.subtitle}>오늘이 모여 습관이 됩니다.</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || configurationError !== null}
            onPress={handleGoogleLogin}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (isSubmitting || configurationError) && styles.buttonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.buttonText}>Google로 계속하기</Text>
            )}
          </Pressable>
          <Text style={styles.guide}>부모 계정으로 로그인해 주세요.</Text>
          {displayedError && <Text style={styles.error}>{displayedError}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 96,
    paddingBottom: spacing.xxl,
  },
  copy: { gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 36, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 18 },
  actions: { gap: spacing.md },
  button: {
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  guide: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
});
