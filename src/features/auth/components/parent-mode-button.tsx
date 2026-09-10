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
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);
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
      const valid = await result;
      const { data } = await getSupabaseClient().auth.getSession();
      if (request !== attempt.current || data.session?.user.id !== userId) return;
      if (!valid) {
        setError('PIN이 맞지 않아요.');
        return;
      }
      close();
      useAppModeStore.getState().setMode('parent');
      router.replace('/parent/home');
    } catch {
      if (request === attempt.current) setError('PIN을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (request === attempt.current) {
        submitting.current = false;
        setPending(false);
      }
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={styles.open}>
        <Text style={styles.openText}>부모님</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.panel} accessibilityViewIsModal>
            <Text style={styles.title}>부모 PIN을 입력해 주세요</Text>
            <TextInput
              accessibilityLabel="부모 PIN"
              autoFocus
              secureTextEntry
              autoComplete="off"
              textContentType="none"
              keyboardType="number-pad"
              maxLength={4}
              editable={!pending}
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
              disabled={pending || pin.length !== 4}
              onPress={() => void submit()}
              style={styles.confirm}
            >
              {pending ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.confirmText}>확인</Text>
              )}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={close} style={styles.cancel}>
              <Text style={styles.openText}>취소</Text>
            </Pressable>
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
});
