export const colors = {
  primary: '#5E8D63',
  primaryDark: '#3F6845',
  primaryLight: '#E8F1E7',
  background: '#F8F9F6',
  card: '#FFFFFF',
  textPrimary: '#252925',
  textSecondary: '#747A74',
  border: '#E3E7E2',
  warning: '#D98A3D',
  error: '#C85C5C',
} as const;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  card: 16,
  button: 14,
} as const;

export const sizing = {
  buttonHeight: 52,
} as const;

export const tokens = { colors, spacing, radius, sizing } as const;

// Opt-in parent v2 tokens. Existing child and legacy component tokens stay unchanged.
export const parentTokens = {
  spacing,
  colors,
  radius: { ...radius, chip: 999 },
  layout: {
    screenPadding: spacing.md,
    sectionGap: spacing.lg,
    contentGap: spacing.sm,
    touchMin: 48,
  },
  card: { padding: spacing.md, compactVertical: spacing.sm, borderWidth: 1 },
  typography: {
    header: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
    section: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
    body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
    chip: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
    metric: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
    button: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  },
  status: {
    neutral: { background: colors.background, foreground: colors.textSecondary },
    success: { background: colors.primaryLight, foreground: colors.primaryDark },
    pending: { background: '#FFF0F2', foreground: '#B84D61' },
    unfinished: { background: '#FFF4E7', foreground: '#A56522' },
    conflict: { background: '#F3EEFC', foreground: '#7953AB' },
  },
  button: { minHeight: sizing.buttonHeight, radius: radius.button },
  icon: { size: 20, container: 28, stroke: 2 },
} as const;

// D1: opt-in foundation for the dashboard redesign. Keep existing exports unchanged.
const dashboardColors = {
  primary: '#2F7D4A',
  background: '#F7FAF7',
  card: '#FFFFFF',
  border: '#BFD8C7',
  textPrimary: '#1D2320',
  textSecondary: '#747B77',
  divider: '#E2E7E3',
  dividerSoft: '#EDF0ED',
  danger: '#B73535',
  dangerBackground: '#FCEAEA',
  warning: '#A96B00',
  warningBackground: '#FFF3DF',
  conflict: '#5A4AA3',
  conflictBackground: '#F0ECFF',
} as const;

export const dashboardTokens = {
  colors: dashboardColors,
  // Numeric keys keep the full scale explicit without changing legacy spacing names.
  spacing: { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32 },
  typography: {
    ...parentTokens.typography,
    header: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
    metric: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
    section: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
    cardTitle: parentTokens.typography.section,
  },
  layout: { screenPadding: 16, sectionGap: 24, titleGap: 12 },
  shadow: {
    shadowColor: dashboardColors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.025,
    shadowRadius: 2,
    elevation: 1,
  },
  radius: { large: 20, normal: 18, pill: 999 },
  border: {
    card: { borderWidth: 1, borderColor: dashboardColors.border },
    divider: { borderBottomWidth: 1, borderBottomColor: dashboardColors.divider },
  },
  icon: {
    size: { small: 16, normal: 20, large: 24 },
    strokeWidth: 2,
    color: dashboardColors.textSecondary,
    touchMin: 48,
    circlePadding: 12,
  },
} as const;
