# 부모 대시보드 디자인 D1

## 적용 범위

기존 공통 토큰은 `src/design-system/tokens.ts`의 `colors`, `spacing`,
`radius`, `sizing`, `tokens`와 부모 화면용 `parentTokens`다.
기존 화면을 유지하기 위해 이 export들의 값과 소비 코드는 변경하지 않는다.
D2부터 수정하는 화면에서 같은 파일의 `dashboardTokens`를 명시적으로 사용한다.
DB, RPC, 비즈니스 로직은 이 작업의 범위에 포함하지 않는다.

## D2 token API

```tsx
import { dashboardTokens as t } from '@/design-system/tokens';

const cardStyle = {
  backgroundColor: t.colors.card,
  padding: t.spacing[20],
  borderRadius: t.radius.large,
  ...t.border.card,
};
const titleStyle = { ...t.typography.header, color: t.colors.textPrimary };
const dividerStyle = { ...t.border.divider, marginVertical: t.spacing[16] };
```

- `colors`: primary, background, card, border, textPrimary, textSecondary, divider,
  danger, dangerBackground, warning, warningBackground, conflict, conflictBackground.
- `spacing`: `[4]`, `[8]`, `[12]`, `[16]`, `[20]`, `[24]`, `[32]`.
- `typography`: header, section, body, caption, chip, metric, button.
  기존 부모 화면의 글자 크기·행간·굵기 규칙을 재사용한다.
- `radius`: large(20), normal(18), pill(999).
- `border.card`: 테두리 1 + Border 색상. `border.divider`: 아래 경계선 1 + Divider 색상.
- `icon`: size.small(16), size.normal(20), size.large(24), strokeWidth(2),
  color(Text Secondary), touchMin(48).

## 아이콘 기준

`lucide-react-native`의 개별 아이콘을 named import로 사용한다.
새 대시보드에서는 이모지, CSS/View로 직접 그린 아이콘, 다른 아이콘 라이브러리를 혼용하지 않는다.
기존 화면의 아이콘 교체는 해당 화면을 수정하는 단계에서 진행한다.

```tsx
import { ChevronRight } from 'lucide-react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';

<ChevronRight {...dashboardIconProps} />;
<ChevronRight {...dashboardIconProps} size={t.icon.size.large} color={t.colors.primary} />;
```

- 기본 20, 보조 표시 16, 주요 액션·탭 24. 선 두께 2, 채우기 없음.
- 기본색은 Text Secondary, 강조 액션은 Primary, 상태는 해당 semantic color를 사용한다.
- 권장 의미: 이동 `ChevronRight`, 편집 `Pencil`, 추가 `Plus`, 완료 `CircleCheck`,
  시간 `Clock`, 주의 `TriangleAlert`, 충돌 `GitCompareArrows`.
- 텍스트와 함께 쓰는 아이콘은 장식으로 취급한다. `dashboardIconProps`는 스크린리더에서 숨긴다.
- 아이콘만 있는 버튼도 부모 `Pressable`에 `accessibilityRole="button"`과 동작을 설명하는
  `accessibilityLabel`을 지정한다. 터치 영역은 가로·세로 최소 `t.icon.touchMin`으로 잡는다.
- 상태는 색이나 아이콘만으로 전달하지 않고 텍스트 라벨을 함께 제공한다.

의존성 기준: [Expo SDK 57 SVG 문서](https://docs.expo.dev/versions/v57.0.0/sdk/svg/)의
권장 `react-native-svg` 15.15.4와 [Lucide React Native](https://lucide.dev/guide/react-native)를 사용한다.
커스텀 네이티브 개발 빌드는 새 SVG 의존성을 포함하도록 다시 빌드해야 한다.
