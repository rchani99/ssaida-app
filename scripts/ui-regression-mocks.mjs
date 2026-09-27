import { readFileSync } from 'node:fs';

import ts from 'typescript';
function load(path, imports = {}) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )(
    (id) => {
      if (!(id in imports)) throw new Error('Missing shared fixture: ' + id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const tokens = load('src/design-system/tokens.ts');
const styles = load('src/features/learning/components/parent-review-styles.ts', {
  'react-native': { StyleSheet: { create: (v) => v } },
  '@/design-system/tokens': tokens,
});
const iconNames = [
  'BookOpen',
  'BookOpenCheck',
  'CalendarDays',
  'ChevronRight',
  'CircleAlert',
  'CircleCheck',
  'ClipboardList',
  'Clock3',
  'GripVertical',
  'House',
  'Leaf',
  'Settings',
  'Sprout',
  'TriangleAlert',
];
export function uiMocks(overrides) {
  if (overrides['react-native']) overrides['react-native'].StyleSheet ??= { create: (v) => v };
  return {
    'lucide-react-native': Object.fromEntries(iconNames.map((name) => [name, name])),
    '@/design-system/icons': {
      dashboardIconProps: { accessible: false, size: 20, strokeWidth: 2 },
    },
    '@/features/learning/components/parent-review-styles': styles,
    '@/features/learning/components/parent-review-actions': {
      ParentReviewActions: 'Options',
      ParentReviewConfirm: 'Confirm',
    },
    '@/shared/components/segmented-tabs': { SegmentedTabs: 'Tabs' },
    ...overrides,
    '@/design-system/tokens': {
      ...tokens,
      ...overrides['@/design-system/tokens'],
      dashboardTokens: tokens.dashboardTokens,
      parentTokens: tokens.parentTokens,
    },
    react: { useRef: (v) => ({ current: v }), useEffect: () => {}, ...overrides.react },
    'react-native': overrides['react-native'] ?? { StyleSheet: { create: (v) => v } },
  };
}
