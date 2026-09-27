import { dashboardTokens } from './tokens';

import type { LucideProps } from 'lucide-react-native';

// Import individual Lucide icons by name at the call site; avoid a dynamic icon registry.
export const dashboardIconProps = {
  size: dashboardTokens.icon.size.normal,
  strokeWidth: dashboardTokens.icon.strokeWidth,
  color: dashboardTokens.icon.color,
  fill: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const satisfies LucideProps;
