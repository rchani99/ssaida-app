import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { useAuth } from '@/features/auth/hooks/use-auth';

export function SettingsScreen() {
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setErrorMessage(null);
    try {
      await signOut();
    } catch {
      setErrorMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>설정</Text>
      <Text style={styles.description}>부모 모드 placeholder 화면</Text>
      <Pressable
        accessibilityRole="button"
        disabled={isSigningOut}
        onPress={handleSignOut}
        style={styles.button}
      >
        {isSigningOut ? (
          <ActivityIndicator color={colors.error} />
        ) : (
          <Text style={styles.buttonText}>로그아웃</Text>
        )}
      </Pressable>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  description: { color: colors.textSecondary, fontSize: 16 },
  button: {
    width: '100%',
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.button,
  },
  buttonText: { color: colors.error, fontSize: 16, fontWeight: '700' },
  error: { color: colors.error, fontSize: 13 },
});
