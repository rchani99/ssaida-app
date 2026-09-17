import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/design-system/tokens';
import { useAppModeStore } from '@/store/app-mode.store';

export function ChildModeButton() {
  const router = useRouter();
  const setMode = useAppModeStore((state) => state.setMode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="아이 화면"
      onPress={() => {
        setMode('child');
        router.replace('/');
      }}
      style={styles.button}
    >
      <Text style={styles.label}>아이 화면</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  label: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
});
