import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isDevelopmentEndpoint } from '@/config/environment-policy';
import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { getSupabaseClient } from '@/lib/supabase/client';

export function isLocalTestLoginAllowed() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN !== 'true') return false;
  if ((process.env.EXPO_PUBLIC_APP_ENV ?? 'development') !== 'development') return false;
  return isDevelopmentEndpoint(process.env.EXPO_PUBLIC_SUPABASE_URL);
}

export function LocalTestLogin() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!isLocalTestLoginAllowed()) return null;
  const close = () => {
    setOpen(false);
    setEmail('');
    setPassword('');
    setError('');
  };
  const login = async () => {
    if (busy || !isLocalTestLoginAllowed()) return;
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (failure) setError('테스트 계정과 비밀번호를 확인해 주세요.');
      else close();
    } catch {
      setError('DEV Supabase 연결을 확인해 주세요.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.button}>
        <Text style={styles.text}>DEV · 테스트 계정 로그인</Text>
      </Pressable>
      <Modal
        visible={open}
        onRequestClose={() => {
          if (!busy) close();
        }}
        animationType="slide"
      >
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.text}>DEV · 테스트 계정 전용</Text>
            <TextInput
              accessibilityLabel="테스트 이메일"
              placeholder="이메일"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="off"
              editable={!busy}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="테스트 비밀번호"
              placeholder="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              editable={!busy}
              style={styles.input}
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <View style={styles.form}>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !email.trim() || !password}
                onPress={() => void login()}
                style={styles.button}
              >
                <Text style={styles.text}>{busy ? '로그인 중…' : '테스트 계정으로 로그인'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={close}
                style={styles.button}
              >
                <Text style={styles.text}>닫기</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  form: { padding: spacing.md, gap: spacing.md },
  text: { color: colors.textPrimary, fontSize: 16 },
  error: { color: colors.error },
  input: {
    height: sizing.buttonHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  button: {
    minHeight: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.button,
  },
});
