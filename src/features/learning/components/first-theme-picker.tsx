import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizing, spacing } from '@/design-system/tokens';
import { CollectionArtwork } from '@/features/learning/components/collection-artwork';
import { useSelectCollectionTheme } from '@/features/learning/hooks/use-learning';
import { collectionThemes } from '@/features/learning/utils/collection-themes';

export function FirstThemePicker({
  pendingPoints,
  onSelected,
}: {
  pendingPoints: number;
  onSelected?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const saving = useRef(false);
  const selectTheme = useSelectCollectionTheme();
  const label = collectionThemes.find(([code]) => code === selected)?.[1];

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        어떤 친구부터 키워볼까?
      </Text>
      <Text style={styles.description}>공부하고 부모님께 확인받으면 쑥쑥 자라요.</Text>
      <View style={styles.grid}>
        {collectionThemes.map(([code, name]) => (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ selected: selected === code, disabled: selectTheme.isPending }}
            disabled={selectTheme.isPending}
            onPress={() => setSelected(code)}
            style={[styles.option, selected === code && styles.selected]}
          >
            <View style={styles.art}>
              <CollectionArtwork code={`${code}_01`} />
            </View>
            <Text style={styles.label}>{selected === code ? `✓ ${name}` : name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.description}>테마는 내 컬렉션에서 언제든 바꿀 수 있어요.</Text>
      {pendingPoints > 0 && (
        <View style={styles.notice}>
          <Text style={styles.label}>모아둔 포인트로 바로 키워볼까요?</Text>
          <Text style={styles.description}>
            시작하면 모아둔 {pendingPoints}포인트가 성장에 쓰여요. 남은 포인트도 그대로 보관돼요.
          </Text>
        </View>
      )}
      {selectTheme.isError && (
        <Text accessibilityRole="alert" style={styles.error}>
          테마를 저장하지 못했어요. 다시 시도해 주세요.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: !selected || selectTheme.isPending,
          busy: selectTheme.isPending,
        }}
        disabled={!selected || selectTheme.isPending}
        onPress={() => {
          if (!selected || saving.current) return;
          saving.current = true;
          selectTheme.mutate(selected, {
            onSuccess: onSelected,
            onSettled: () => {
              saving.current = false;
            },
          });
        }}
        style={[styles.button, (!selected || selectTheme.isPending) && styles.disabled]}
      >
        {selectTheme.isPending ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.buttonText}>
            {label ? `${label}과 시작하기` : '키울 테마를 골라주세요'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  art: { width: 100, maxWidth: '100%' },
  label: { color: colors.primaryDark, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  notice: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.primaryLight,
  },
  button: {
    minHeight: sizing.buttonHeight,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  buttonText: { color: colors.card, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: 14 },
});
