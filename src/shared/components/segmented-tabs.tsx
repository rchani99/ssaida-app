import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected && styles.selectedTab]}
          >
            <Text style={[styles.tabText, selected && styles.selectedText]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: t.colors.dividerSoft,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingVertical: t.spacing[8],
    paddingHorizontal: t.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selectedTab: { borderBottomColor: t.colors.primary },
  tabText: { ...t.typography.body, color: t.colors.textSecondary, textAlign: 'center' },
  selectedText: { color: t.colors.primary, fontWeight: '600' },
});
