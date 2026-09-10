# Step 5 검증 기록

## 변경 범위

기존 RPC를 UI/API/hook에 연결했습니다. migration, DB 타입/상태, 인증 및 PIN 정책은 변경하지 않았습니다.
서버 데이터는 TanStack Query, 입력/선택/확인창은 컴포넌트 상태로 관리합니다.

## 로컬 Supabase + Expo Web

2026-09-10, localhost Supabase와 실제 Expo Web export에서 일회용 인증 사용자를 이용했습니다.
Google OAuth 재로그인은 검증 범위가 아니며 테스트 세션만 주입했습니다. 운영 인증 코드는 수정하지 않았습니다.
테스트 종료 후 사용자 및 종속 데이터를 삭제하고 임시 fixture 서버/파일을 제거했습니다.

| 시나리오       | 실제 확인                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| A PARTIAL      | 웹에서 1~~5쪽을 3쪽까지 확인; DB PARTIAL/확정 진도 3; 다음 날짜 RPC 결과 4~~8쪽  |
| B RETRY        | 부모 RETRY → 아이 다시 하기 → reload 후 IN_PROGRESS 유지 → 완료 → 부모 정상 확인 |
| C 선택 확인    | 활동 3개 중 2개만 확인; 나머지 CHILD_COMPLETED 유지                              |
| D MANUAL       | 웹 ACTIVITY 추가 → 아이 실행/완료 → 부모 확인; 목표 초과 안내/그대로 하기 확인   |
| E 이월         | 어제 MANUAL을 오늘에 추가; 원본 PLANNED 보존, 오늘 후속 생성                     |
| F chain        | RPC로 A→B→C 준비; 웹에는 C만 노출; C를 오늘로 옮기면 이전 원본 모두 제외         |
| G 넘기기       | 진행 중 일회성 확인 안내 후 SKIPPED; 미완료 목록 제외, DB 기록 유지              |
| H AUTO 미시작  | 과거 PLANNED 유지; 수동 미완료 목록 제외; 다음 AUTO 생성                         |
| I 늦은 PARTIAL | 미래 6~~10쪽 IN_PROGRESS 보존; 이전 1~~5쪽을 3쪽까지 확인 후 진도 경고 표시      |

## 자동 회귀

`scripts/step5-integration.mjs`는 운영 API와 파생 함수를 읽어 실제 로컬 RPC/조회에 연결합니다.
PARTIAL 범위 검증, RETRY 재시작 필드, 선택적 batch, REST 수동 WORKBOOK,
이월 idempotency/chain/자연어 오류, superseded 직접 진입 보호, SKIPPED history,
AUTO 보존, late PARTIAL, 아이 정렬 및 3일 조건을 검증합니다.
로컬 환경에서만 실행되며 일회용 사용자를 finally에서 정리합니다.

실행에는 Supabase status의 로컬 값을 `STEP3_API_URL`, `STEP3_ANON_KEY`,
`STEP3_SERVICE_ROLE_KEY` 환경 변수로 전달합니다. 키를 출력하거나 저장소에 넣지 않습니다.
service role은 테스트 사용자 생성/정리에만 사용하며 앱에 전달하지 않습니다.

```powershell
node scripts/step5-integration.mjs
node scripts/step3-integration.mjs
node scripts/step4-1-integration.mjs
node scripts/step4-2-integration.mjs
node scripts/step4-1-ui-regression.mjs
node scripts/step4-2-ui-regression.mjs
node scripts/step4-2-1-reveal-regression.mjs
pnpm dlx supabase db lint --local
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec expo export --platform web
git diff --check
```

모든 위 회귀 스크립트 및 DB lint 통과. UI 회귀는 mock 기반이고 reveal guard는 실제 TanStack mutation을 사용합니다.
실기기 Android/iOS, 원격 Supabase, 실제 Google OAuth, 자정/AppState 전환은 이번 검증에 포함하지 않았습니다.
DB reset, migration 변경, remote push, Git commit/push는 수행하지 않았습니다.
