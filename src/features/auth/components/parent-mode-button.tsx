import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { verifyParentPin } from '@/features/auth/services/verify-parent-pin';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAppModeStore } from '@/store/app-mode.store';

export function ParentModeButton() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [visible, setVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const submitting = useRef(false);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const close = () => {
    attempt.current += 1;
    submitting.current = false;
    setVisible(false);
    setPin('');
    setError(null);
    setPending(false);
    setConfirmingLogout(false);
  };

  const submit = async () => {
    if (submitting.current || !/^[0-9]{4}$/.test(pin)) return;
    submitting.current = true;
    const request = ++attempt.current;
    const userId = session?.user.id;
    setPending(true);
    setError(null);
    // Only component memory and the RPC request contain the input; clear immediately.
    const result = verifyParentPin(pin);
    setPin('');
    try {
      const verdict = await result;
      const { data } = await getSupabaseClient().auth.getSession();
      if (request !== attempt.current || data.session?.user.id !== userId) return;
      if (verdict !== 'valid') {
        setError(verdict === 'locked' ? '5분 뒤에 다시 시도해 주세요.' : 'PIN이 맞지 않아요.');
        return;
      }
      close();
      useAppModeStore.getState().setMode('parent');
      router.replace('/');
    } catch {
      if (request === attempt.current) setError('PIN을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (request === attempt.current) {
        submitting.current = false;
        setPending(false);
      }
    }
  };

  const logout = async () => {
    if (submitting.current || !confirmingLogout) return;
    submitting.current = true;
    attempt.current += 1;
    setPin('');
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      // AuthProvider resets the mode and cache; the auth guard routes to login.
      close();
    } catch {
      setError('로그아웃하지 못했어요. 다시 시도해 주세요.');
    } finally {
      submitting.current = false;
      setSigningOut(false);
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={styles.open}>
        <Text style={styles.openText}>부모님</Text>
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (signingOut) return;
          if (confirmingLogout) {
            setConfirmingLogout(false);
            setError(null);
          } else close();
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.panel} accessibilityViewIsModal>
            {confirmingLogout ? (
              <>
                <Text style={styles.title}>로그아웃할까요?</Text>
                <Text style={styles.help}>다시 로그인해야 사용할 수 있어요.</Text>
                {error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={signingOut}
                  onPress={() => {
                    setConfirmingLogout(false);
                    setError(null);
                  }}
                  style={styles.cancel}
                >
                  <Text style={styles.openText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={signingOut}
                  onPress={() => void logout()}
                  style={styles.confirm}
                >
                  <Text style={styles.confirmText}>{signingOut ? '로그아웃 중…' : '로그아웃'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>부모 PIN을 입력해 주세요</Text>
                <TextInput
                  accessibilityLabel="부모 PIN"
                  autoFocus
                  secureTextEntry
                  autoComplete="off"
                  textContentType="none"
                  keyboardType="number-pad"
                  maxLength={4}
                  editable={!pending && !signingOut}
                  value={pin}
                  onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
                  onSubmitEditing={() => void submit()}
                  style={styles.input}
                />
                {error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={pending || signingOut || pin.length !== 4}
                  onPress={() => void submit()}
                  style={styles.confirm}
                >
                  {pending ? (
                    <ActivityIndicator color={colors.card} />
                  ) : (
                    <Text style={styles.confirmText}>확인</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={signingOut}
                  onPress={close}
                  style={styles.cancel}
                >
                  <Text style={styles.openText}>취소</Text>
                </Pressable>
                <Text style={styles.help}>
                  PIN을 잊었다면 로그아웃할 수 있어요. PIN은 초기화되지 않아요.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={pending || signingOut}
                  onPress={() => {
                    if (submitting.current) return;
                    setPin('');
                    setError(null);
                    setConfirmingLogout(true);
                  }}
                  style={styles.cancel}
                >
                  <Text style={styles.openText}>{signingOut ? '로그아웃 중…' : '로그아웃'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  open: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  openText: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(37,41,37,0.35)',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, color: colors.textPrimary, fontWeight: '700' },
  input: {
    height: sizing.buttonHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    textAlign: 'center',
    fontSize: 24,
    color: colors.textPrimary,
    backgroundColor: colors.card,
  },
  confirm: {
    height: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  confirmText: { color: colors.card, fontWeight: '700', fontSize: 16 },
  cancel: { alignItems: 'center', padding: spacing.sm },
  error: { color: colors.error, fontSize: 14 },
  help: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
