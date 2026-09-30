import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens, spacing } from '@/design-system/tokens';
import { useAppModeStore } from '@/store/app-mode.store';

export function ChildModeButton({ dashboard = false }: { dashboard?: boolean } = {}) {
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
      <View style={dashboard && styles.dashboardPill}>
        <Text style={[styles.label, dashboard && styles.dashboardLabel]}>아이 화면</Text>
        {dashboard && (
          <ChevronRight
            {...dashboardIconProps}
            size={dashboardTokens.icon.size.small}
            color={dashboardTokens.colors.primary}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: dashboardTokens.icon.touchMin,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  label: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  dashboardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardTokens.spacing[4],
    backgroundColor: colors.primaryLight,
    paddingHorizontal: dashboardTokens.spacing[12],
    paddingVertical: dashboardTokens.spacing[4],
    borderRadius: dashboardTokens.radius.pill,
  },
  dashboardLabel: { color: dashboardTokens.colors.primary },
});
