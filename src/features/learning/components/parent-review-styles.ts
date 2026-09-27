import { StyleSheet } from 'react-native';

import { dashboardTokens as t } from '@/design-system/tokens';

export const parentReviewStyles = StyleSheet.create({
  panel: {
    backgroundColor: t.colors.card,
    ...t.border.card,
    borderRadius: t.radius.normal,
    padding: t.spacing[16],
    gap: t.spacing[12],
    ...t.shadow,
  },
  card: {
    paddingVertical: t.spacing[12],
    gap: t.spacing[12],
    borderBottomColor: t.colors.divider,
  },
  title: { ...t.typography.section, color: t.colors.textPrimary },
  secondary: { ...t.typography.body, color: t.colors.textSecondary },
  resultControl: {
    flexDirection: 'row',
    padding: t.spacing[4],
    gap: t.spacing[4],
    backgroundColor: t.colors.background,
    borderRadius: t.radius.normal,
  },
  resultOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingVertical: t.spacing[8],
    paddingHorizontal: t.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.pill,
  },
  resultSelected: { backgroundColor: t.colors.card, ...t.shadow },
  resultText: { ...t.typography.body, color: t.colors.textSecondary, textAlign: 'center' },
  resultSelectedText: { color: t.colors.primary, fontWeight: '600' },
});
