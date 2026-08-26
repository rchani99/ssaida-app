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
