# DEV-02 — 체험단 환경 및 초기 설정 개선

- 상태: REVIEW / 로컬 구현·회귀 검증·독립 검수 PASS. 새 APK 및 실기기 검증 대기.
- 승인: 2026-10-22 사용자 요청으로 기존 구현 분석, 필요한 개선의 분담 구현·독립 검수. 실제 배포 등 외부 실행은 준비 후 별도 승인.
- 기준 SHA: `d5de87315adaff783bee21a8d504424e52f097ac` (`codex/firebase-deployment`).
- 작업 경로: `C:/Users/rchani/.codex/worktrees/dev02-onboarding/ssaida-app`.
- 결과 브랜치: `codex/dev02-onboarding`; 로컬 커밋 `a45721a51e56ab04fbd1fa951af6b6b958558a98` (소스·테스트 6파일). 원본 브랜치 병합·push 없음.
- 원본 소스 및 기존 미커밋 문서·이미지·다른 worktree는 보존. 기존 로컬 node_modules를 junction으로 재사용하며 의존성 설치·lockfile 변경 없음.
- 조정자: `/root`; 개발 담당: `/root/dev02_auth`, `/root/dev02_onboarding`; 독립 검수: `/root/dev02_independent_review`.
- Expo v57 문서를 확인한 뒤 코드 작업: https://docs.expo.dev/versions/v57.0.0/.

## 분석과 변경 범위

기존 Google OAuth, Supabase 세션, 자녀·목표시간·PIN 설정 RPC, 첫 테마 선택 및 학습 등록을 재사용한다.
LEGACY-AUTO-02 큐를 자동 재개한 것이 아니라 이번 DEV-02 승인 아래 현재 구현을 직접 분석했다.

| 확인된 문제 | 개선 | 담당 파일 |
| --- | --- | --- |
| 프로필 조회 실패로 profile=null이면 기존 계정도 신규 설정으로 진입 | 조회 오류에서는 보호된 화면을 열지 않고 읽기 재시도 화면 제공 | `src/app/_layout.tsx` |
| 조회 Promise 예외 시 loading이 해제되지 않음 | 예외/정상 오류 처리, 요청·세션 revision 보호 유지 | `src/features/auth/providers/auth-provider.tsx` |
| 같은 렌더에서 다음 연속 탭 시 목표시간 단계를 건너뜀 | 검증한 단계 기준으로 한 단계만 이동 | `src/features/onboarding/screens/onboarding-screen.tsx` |
| 재렌더 전 완료 연속 탭 시 저장 RPC 중복, 대기 중 PIN 변경 가능 | 동기 저장 잠금과 대기 중 입력 보호, 실패 시 입력 유지·재시도 | 위 온보딩 파일 |

프로필 실패와 실제 미완료/없는 프로필을 구별한다. 저장 성공 후 조회만 실패했으면 초기 설정을 다시 저장하지 않는다.
DB schema/RPC/API 계약·인증 정책·패키지·OAuth 식별자는 변경하지 않는다.
설치/첫 학습 안내는 기존 `docs/beta-distribution.md`와 FAQ를 통합 활용한다.

## 검증 계획과 완료 조건

- 실제 provider와 화면 handler를 실행하는 auth-session/profile-entry/onboarding 회귀.
- 정상/오류/예외/재시도, 로그아웃·계정 전환 후 오래된 요청 무시, 신규·기존 계정 진입 구별.
- 단계 연속 탭, 중복 저장, validation, 실패 입력 보존·재시도, 성공 후 refresh 1회.
- 기존 OAuth·첫 테마·알림 관련 로컬 회귀, 타입 검사와 변경 파일 lint.
- 별도 담당자가 실제 diff와 신규 테스트를 검수하고 필수 지적을 해소한다.
- 운영 DB/실제 이메일/실기기 데이터 변경은 수행하지 않는다. 새 APK의 설치·OAuth·신규/기존 계정 검증 전에는 DONE으로 처리하지 않는다.

## 배포 준비와 남은 단계

### 이번 실행 결과

개발 담당이 실제 화면 handler를 실행해 수정 전 프로필 오류 진입 회귀 FAIL,
온보딩 단계 건너뛰기·저장 2회·대기 중 편집의 3개 실패를 재현했다. 수정 후 모두 PASS.
아래는 이번 격리 worktree에서 실행한 결과이며 원격·실기기 통과를 뜻하지 않는다.

| 명령 (설치된 Node 사용) | 결과 |
| --- | --- |
| `node scripts/auth-session-regression.mjs` | PASS / exit 0: 오류·예외·재시도 및 오래된 세션 응답 보호 |
| `node scripts/profile-entry-regression.mjs` (신규) | PASS / exit 0: 오류 진입 차단, 읽기 재시도, 정상 신규/기존 계정·부모 경계 |
| `node scripts/onboarding-regression.mjs` (신규) | PASS / exit 0: 4개 시나리오, 기존 validation·단계 연타·단일 저장·실패 보존/재시도 |
| `node scripts/sprint1-regression.mjs --ui-only` | PASS / exit 0: 기존 OAuth dedupe와 학습 계약 mock 회귀 |
| `node scripts/step6-lifecycle-regression.mjs` | PASS / exit 0: 기존 알림 lifecycle |
| `node scripts/step6-notification-regression.mjs` | PASS / exit 0: 기존 알림 회귀 |
| `node scripts/first-theme-regression.mjs` | PASS / exit 0: 기존 첫 테마·실패/재시도·진입 보호 |
| `node scripts/step6-dev-login-regression.mjs` | PASS / exit 0: 개발 로그인 release 차단 |
| `node scripts/environment-regression.mjs` | PASS / exit 0: 합성 환경값으로 실제 Expo config와 beta 환경 보호 |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS / exit 0 |
| 변경 소스·테스트 6파일 ESLint / Prettier | PASS / exit 0; 신규 테스트 import 빈줄 1건 수정 후 재검사 |
| `git diff --check` | PASS; CRLF 변환 경고는 기능 오류가 아님 |

독립 검수 담당은 실제 6파일과 저장 RPC를 읽고 auth-session/profile-entry/onboarding 3개를
재실행해 모두 exit 0을 확인했다. 필수 수정 지적 없음. 저장 성공 후 조회 오류의 읽기 재시도 연결,
세션/request revision, 연속 탭 보호를 별도로 확인했다. 독립 검수에 따른 수정 회수 0회.

프로필·온보딩 회귀의 React hooks/라우터/서비스는 제어 가능한 fixture다. 실제 React Native 배치·화면 렌더,
Google 브라우저 복귀, 서버 RPC·RLS·실제 저장 결과를 확인한 테스트는 아니다.

### 승인 후 실행할 단계

새 코드가 포함된 APK는 아직 없고 기존 Firebase APK (4)는 그대로다. 검수 후 소스 통합 판단,
기존 beta 프로필·서명으로 새 빌드, 정적 APK 검증, 승인된 계정·데이터의 실기기 검수,
Firebase 업로드/대상 그룹 배포·초대 순으로 진행한다. 각 외부 실행은 구체적인 대상을 정해 승인 후 수행한다.
현재 과제 승인은 main/master 병합·원격 push·EAS 업로드/빌드·Firebase 배포·초대 권한을 포함하지 않는다.

빌드 사전 확인에서 기존 루트의 `.env.beta.local` 파일은 없었다. 합성 설정 회귀는 PASS지만 실제 공개 beta
환경값 검사는 미실행이다. 다음 실행에서 기존 EAS production의 공개 설정을 값 노출 없이 준비하고
`scripts/build-beta.mjs <빌드용-env-파일> check`부터 수행해야 한다. 운영 비밀값 변경은 필요하지 않다.
빌드 대상은 위 결과 커밋이며 기존 서명·패키지·OAuth 식별자를 유지한다. 원격 versionCode는 다음 빌드 시 확인한다.
새 APK 생성 전에는 해시·버전·설치 결과를 기재하지 않는다.

릴리스 노트 초안 (새 버전 검증 후 사용):

> 프로필 확인이 일시적으로 실패할 때 초기 설정으로 이동하지 않고 다시 시도할 수 있게 개선했습니다.
> 초기 설정에서 버튼을 빠르게 여러 번 눌러도 단계가 건너뛰거나 저장 요청이 겹치지 않도록 개선했습니다.
> 저장 중 입력을 보호하고 실패 시 입력한 내용으로 다시 시도할 수 있습니다.

관리 문서는 원본 작업 공간에서 갱신했으며 기존 사용자 문서 변경과 함께 미커밋 상태로 보존했다.
격리 worktree의 AGENTS.md는 최신 지침 복사본으로 미커밋 보존하고 코드 커밋에는 넣지 않았다.
