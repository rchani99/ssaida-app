# 쌓이다 (Ssaida)

초등학생의 공부 습관 관리를 위한 React Native/Expo 앱입니다. 부모 인증과 온보딩에 더해 학습
등록, 오늘 계획, 공부 시작·완료, 부모 확인, 컬렉션 성장의 핵심 흐름을 Supabase에 연결합니다.

## 개발 관리 기준

최신 확정 정책은 [제품 결정](docs/product-decisions.md), 과제·승인 범위·완료 기준은
[개발 백로그](docs/development-backlog.md), 현재 구현·배포 증거는 [개발 현황](docs/project-status.md)을
따릅니다. 에이전트 실행 지침은 [AGENTS.md](AGENTS.md)에 있습니다. 2026-10-22 후속 요청으로
DEV-02 초기 설정 개선의 구현·검증·독립 검수에 착수했습니다. DEV-01의 남은 검증은 유지하며 실제 배포·초대는 별도 승인 대상입니다.
과거 자동화 DEV-01/02와 신규 제품 번호는 구분합니다.

## 네이밍 표준

한글 이름은 **쌓이다**, 영문 브랜드는 **Ssaida**, 코드 및 신규 식별자의 기본 표기는
**`ssaida`**, Firebase 테스터 그룹 alias는 **`ssaida-beta`**를 사용합니다.
새 문서·표시 문구·설정 이름에 적용하며, 기존 배포·인증·DB 연결값은 일괄 치환하지 않습니다.

2026-10-19 저장소 전체의 `ssahida` / `ssaida` 표기를 대소문자 구분 없이 조사했습니다.
앱 소스·설정·스크립트·문서와 Git 제외 `sites/ssaida-pilot`의 소스를 확인했으며,
의존성·생성 빌드·캐시·로그·과거 산출물은 수정 대상에서 제외했습니다.

| 위치 | 확인 결과 및 처리 |
| --- | --- |
| `README.md`, `app.json`, `package.json` | 브랜드 `Ssaida`, 앱 이름 `쌓이다`, 코드 이름 `ssaida-app`은 표준에 부합. 개발 실행 안내의 표시명을 `쌓이다 (Ssaida)`로 정리 |
| `src/config`, `src/features/auth`, `src/features/notifications` | URI·저장 키·알림 ID는 이미 `ssaida` 사용. 기존 데이터 및 인증 호환성을 위해 유지 |
| `supabase`, `scripts` | 로컬 프로젝트·DB 컨테이너·cron 작업·검증 코드의 `ssaida` 유지. 개발 실행 스크립트는 안내 문구만 `Ssaida`로 정리 |
| `scripts/distribute-beta.ps1`, `docs/beta-distribution.md` | Firebase 그룹 alias는 이미 `ssaida-beta`로 일치. 실제 외부 그룹 생성·변경은 수행하지 않음 |
| `docs/build-environments.md`, `docs/production-db-deployment.md`, `docs/beta-distribution.md` | 기존 서비스 이름·빌드 URL을 기록한 `ssahida`는 유지 |
| `docs/marketing`, `sites/ssaida-pilot` | 2026-10-22 사용자 보고에 따라 문서의 Instagram 계정·링크는 `ssaida.app`으로 갱신. 기존 이메일·게시 사이트 URL과 `ssaida` 로컬 경로·산출물 이름은 유지. 사이트 소스·원격 반영은 별도 확인 필요 |

다음은 **현재 식별자·설정과 그 출처**입니다. Instagram은 2026-10-22 사용자가 `ssaida.app`으로
변경했다고 알려 문서에 반영했습니다. 나머지 `ssahida`가 남은 외부 이름은 표준의
예외이며, 변경하려면 별도 서비스 이전 및 호환성 검토가 필요합니다.
출처는 로컬 설정·소스와 문서 기록을 구분했습니다. 이번 조사에서 외부 콘솔의 현재 상태,
실제 환경변수 값, 이메일 수신 여부를 재확인한 것은 아닙니다. 줄 번호는 조사 시점 기준입니다.

| 구분 | 확인한 값·사용 방식 | 출처 | 유지 이유 |
| --- | --- | --- | --- |
| Expo/EAS 연결 | slug `ssahida-app`, owner `ssahidas-team`, projectId `22da5823-40f1-488c-88a7-197639eaae9a` | 실제 설정: [app.json 4~8행](app.json#L4). 기존 빌드 URL 기록: [체험단 배포 문서 171행](docs/beta-distribution.md#L171) | 기존 계정·프로젝트의 빌드 연결과 이력 참조를 유지 |
| Android / iOS | package / bundleIdentifier `com.ssaida.app` | 실제 설정: [Android 29행](app.json#L29), [iOS 18행](app.json#L18) | 기존 앱 식별 및 배포·인증 연동을 유지. 서명·배포 설정도 변경하지 않음 |
| Supabase 프로젝트 | 운영 이름 `ssahida-prod`, 운영 ref `thinmctzgynmtuihirng`, DEV ref `ffnxodulitwzuqswlaga` | 운영 이름·ref는 [배포 기록 5행](docs/production-db-deployment.md#L5), DEV ref는 [환경 검증 코드 2행](src/config/environment-policy.js#L2) | 운영 배포 기록과 개발 환경 식별을 유지. 운영 이름은 문서에서 확인한 값이며 콘솔 재확인 결과가 아님 |
| Supabase URL | 개발·운영 URL을 각각 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_PRODUCTION_SUPABASE_URL`에서 읽음 | 실제 주입 코드: [app.config.js 16~18행](app.config.js#L16) | 기존 DB 연결 대상과 환경 분리를 유지. 실제 주입된 URL 값을 이번에 확인하거나 변경하지 않음 |
| OAuth | scheme `ssaida`, redirect URI `ssaida://auth/callback`; Supabase `/auth/v1/callback` 및 OAuth 클라이언트 설정 절차 | 실제 설정: [app.json 14행](app.json#L14), [환경 검증 코드 3행](src/config/environment-policy.js#L3). 설정 절차: 아래 [Google Cloud 설정](#google-cloud-설정) | 앱 복귀 경로와 인증 연동을 유지. 외부 콘솔의 실제 callback·클라이언트 값은 재확인하지 않음 |
| 로컬 DB | 프로젝트 `ssaida-app`, 컨테이너 `supabase_db_ssaida-app` | 실제 설정: [config.toml 5행](supabase/config.toml#L5). 컨테이너 사용: [DB 검증 스크립트](scripts/step4-2-integration.mjs) | 기존 로컬 DB와 검증 스크립트의 연결을 유지 |
| DB 작업 / 로컬 저장 | `ssaida-account-deletion-purge`, `ssaida-account-action-cleanup`, 기존 `ssaida` 저장 키·알림 ID | 작업 정의: [삭제 cron 19행](supabase/snippets/account-deletion-schedule.sql#L19), [정리 cron 28행](supabase/snippets/account-deletion-schedule.sql#L28). 저장·알림 코드: [계정 복구](src/features/auth/services/account-recovery.ts), [알림 저장](src/features/notifications/storage.ts), [알림 ID](src/features/notifications/planner.ts) | 기존 작업 이름과 저장 데이터·알림의 연속성을 유지 |
| Firebase App ID / 프로젝트 ID | `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`를 검증해 CLI에 전달. 후속 배포 기록의 프로젝트는 `ssaida-732f2` | 실제 주입: [배포 스크립트](scripts/distribute-beta.ps1). 앱/그룹 조회 및 업로드: [후속 배포 기록](docs/beta-distribution.md#후속-실기기-검수-및-pin-수정) | 최초 `adu-app-f039d` 조회와 후속 확인을 구분. 이번 문서 점검은 원격 App ID 재조회가 아니며 기존 연결값을 변경하지 않음 |
| Firebase 테스터 그룹 | `-Distribute` 지정 시 `--groups ssaida-beta` 전달 | 실제 코드: [배포 스크립트 33행](scripts/distribute-beta.ps1#L33) | 이미 표준에 부합. 외부 그룹의 존재 확인·생성·변경은 수행하지 않음 |
| Instagram | `@ssaida.app`, `https://www.instagram.com/ssaida.app/` | 2026-10-22 사용자 변경 완료 보고. 현재 안내: [마케팅 README](docs/marketing/README.md), [모집 원고](docs/marketing/recruitment-copy.md) | 사용자가 변경한 현재 계정으로 문의 안내를 갱신. 사이트 소스·원격 배포·기존 이미지/영상의 반영 여부는 이번 문서 수정으로 확인되지 않음 |
| 문의 이메일 | `ssahida.app@gmail.com` | 실제 로컬 초안: [삭제 안내 소스 9행](sites/ssaida-pilot/app/account-deletion/page.tsx#L9). 사용자 제공 주소 기록: [운영 계획 87행](docs/marketing/launch-paid-20-daily-plan.md#L87) | 기존 문의·삭제 요청 연락처를 보존. 실제 수신 여부와 초안의 원격 반영 여부는 확인하지 않음 |
| 기존 게시 사이트 | `https://ssahida-pilot.famous-orbit-7383.chatgpt.site` | 비공개 배포 주소 기록: [마케팅 README 23행](docs/marketing/README.md#L23) | 기존 게시 주소와 참조 링크를 보존 |

`sites/ssaida-pilot` 출처는 Git 제외 로컬 소스이므로 저장소 웹 화면이나 다른 체크아웃에서는
링크 대상이 없을 수 있습니다. 해당 소스 확인을 원격 사이트 반영 확인으로 해석하지 않습니다.

## 요구 환경

- Node.js LTS
- pnpm
- Android Studio 및 Android SDK
- USB 디버깅이 활성화된 Android 실제 기기 또는 Android 에뮬레이터
- Supabase 프로젝트

OAuth는 custom scheme이 필요하므로 Expo Go에서는 테스트할 수 없습니다. Android development
build를 사용해야 합니다.

## 로컬 Supabase로 실행

Docker Desktop을 실행한 뒤 프로젝트 루트에서 로컬 DB를 시작하고 migration/seed를 적용합니다.

```bash
supabase start
supabase db reset
supabase status
```

`supabase status`에 표시되는 API URL과 publishable key를 `.env`에 넣습니다. 실행 대상에 따라
URL의 호스트만 다음처럼 바꿉니다.

- Web/iOS Simulator: `http://127.0.0.1:54321`
- Android Emulator: `http://10.0.2.2:54321`
- Android 실제 기기: `http://<개발 PC의 LAN IP>:54321`

실제 기기는 PC와 같은 네트워크에 있어야 하고 Windows 방화벽에서 로컬 Supabase API 포트 접근을
허용해야 합니다. 로컬 Google 로그인을 시험하려면 `supabase/config.toml`의 Google provider를
별도로 설정해야 하며 client secret은 환경 변수로만 주입합니다. 로컬 Auth provider 설정 없이도
`scripts/step3-integration.mjs`는 자체 테스트 계정으로 DB/RLS/RPC 회귀 검증을 수행합니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase status의 publishable key>
EXPO_PUBLIC_AUTH_REDIRECT_URI=ssaida://auth/callback
```

`.env`는 Git에서 제외되어 있습니다. 앱에는 publishable key만 사용하고 secret/service role key는
넣지 않습니다.

## 원격 Supabase 프로젝트와 DB 준비

1. Supabase Dashboard에서 프로젝트를 생성합니다.
2. Project Settings → API 또는 Connect 화면에서 Project URL과 Publishable key를 확인합니다.
3. Supabase CLI로 프로젝트를 연결하고 migration을 적용합니다.

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
```

CLI를 사용하지 않는 경우
`supabase/migrations/202608250001_step_1_parent_auth_onboarding.sql` 내용을 Dashboard의 SQL
Editor에서 한 번 실행합니다.

## Google Cloud 설정

1. Google Cloud Console의 Google Auth Platform에서 프로젝트와 OAuth 동의 화면을 설정합니다.
2. Clients → Create client에서 애플리케이션 유형을 **Web application**으로 선택합니다.
3. Authorized redirect URIs에 아래 Supabase callback URL을 추가합니다.

```text
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

4. 생성된 Web Client ID와 Client Secret을 복사합니다. 이 Secret은 앱 `.env`에 넣지 않습니다.

## Supabase Auth 설정

1. Authentication → Sign In / Providers → Google을 활성화합니다.
2. Google Cloud에서 발급받은 Web Client ID와 Client Secret을 입력합니다.
3. Authentication → URL Configuration → Redirect URLs에 아래 URI를 추가합니다.

```text
ssaida://auth/callback
```

Supabase Dashboard의 Google provider 화면에 표시되는 callback URL이 Google Cloud에 등록한 URL과
정확히 같은지 다시 확인합니다.

## 앱 환경 변수

DEV/production 변수와 차단 규칙은 [빌드 환경 문서](docs/build-environments.md)를 따릅니다.
아래 기존 변수는 development 전용입니다. production은 `EXPO_PUBLIC_APP_ENV=production`과
별도 `EXPO_PUBLIC_PRODUCTION_SUPABASE_*` 변수가 필요하며 DEV 값으로 fallback하지 않습니다.

```powershell
Copy-Item .env.example .env
```

`.env`를 실제 값으로 수정합니다.

```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN=false
EXPO_PUBLIC_SUPABASE_URL=https://<DEV_PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
EXPO_PUBLIC_AUTH_REDIRECT_URI=ssaida://auth/callback
```

`EXPO_PUBLIC_` 값은 앱 번들에서 볼 수 있습니다. Publishable key만 사용하며 Google Client Secret,
Supabase secret key, service role key는 앱 코드나 `.env`에 절대 넣지 않습니다.

## Android 실제 기기 실행

Windows에서 일상적인 원격 DEV 테스트 준비는 다음 한 줄로 실행할 수 있습니다.
휴대폰의 무선 디버깅을 켜고 PC와 같은 Wi-Fi에 연결한 뒤 실행하세요.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-android-test.ps1
```

스크립트는 Node/ADB를 찾고, 온라인 기기를 선택하고, 8081 reverse를 연결한 뒤 설치된 앱과
Metro를 실행합니다. pnpm 명령의 PATH 등록은 필요 없습니다. 기기가 없으면 연결 주소를 묻고,
여러 개면 선택 목록을 표시합니다. 최초 무선 페어링과 debug APK 설치는 별도로 필요합니다.

- 캐시 초기화: 명령 끝에 `-ClearCache` 추가
- 연결 주소 지정: `-ConnectTo 192.168.0.10:12345` 추가 (휴대폰에 표시된 현재 연결 포트 사용)
- 이미 Metro가 켜져 있으면 해당 터미널에서 `Ctrl+C`로 종료 후 실행
- 현재 `.env`를 그대로 사용하며 DB, OAuth 설정, APK 빌드/설치를 변경하지 않음
- Expo Go QR 대신 설치된 쌓이다 (Ssaida) 앱 사용. 준비 완료 후 화면이 갱신되지 않으면 앱을 다시 열기

`ExecutionPolicy Bypass`는 이 실행 프로세스에만 적용되며 시스템 실행 정책을 변경하지 않습니다.
환경 준비 스크립트는 Google OAuth callback의 `Unmatched Route` 같은 앱 오류를 수정하지 않습니다.

```bash
pnpm install
pnpm android
```

`pnpm android`는 `expo run:android`를 실행해 custom scheme이 포함된 native development build를
설치합니다. 실제 기기는 USB로 연결하고 `adb devices`에서 인식되는지 먼저 확인합니다.

이미 development build가 설치되어 있다면 이후에는 다음 명령으로 Metro만 실행할 수 있습니다.

```bash
pnpm start
```

## 라우팅 및 인증 흐름

```text
앱 시작
  → 저장된 Supabase session 확인
  → 비로그인: 로그인
  → 로그인 + profile 없음/미완료: 온보딩
  → 로그인 + 온보딩 완료: /child/today
```

- 로그인: `(auth)/login`
- 온보딩: `(onboarding)/onboarding`
- 아이 모드: `/child/today`, `/child/garden`
- 부모 모드: `/parent/home`, `/parent/records`, `/parent/settings`
- 공부 진행: `/study/[taskId]`

인증 상태는 AuthProvider, child/parent UI 모드는 Zustand store에서 별도로 관리합니다.
서버 데이터는 TanStack Query로 조회·무효화하며, 계획과 task 상태 변경은 공개 RPC를 사용합니다.

## 컬렉션 이미지와 개발 카탈로그 추가

테마별 수집 가능 개수는 DB의 활성 카탈로그에서 계산합니다. 3개나 6개로 제한하지 않으며,
추가된 수집물도 기존 수집 기록을 유지한 채 도감과 테마 완료 여부에 반영합니다.
완료했던 현재 테마에 새 아이템이 생기면 정원의 `다음 친구 키우기`로 이어서 시작합니다.

정원 상단의 `테마 · 도감` 하나에서 수집물을 보고 성장 중에도 다른 테마를 선택할 수 있습니다.
작은 테마 탭을 고르면 도감 하나만 표시되고, `이 테마 키우기`를 눌러 테마를 변경합니다.
정원의 기본 화면은 현재 키우는 친구를 보여주며 수집물 목록은 도감에서만 표시합니다.
테마마다 키우던 아이템과 성장 포인트를 보존하며, 돌아오면 이어서 키웁니다.
공개를 기다리는 완성 아이템도 보존합니다. 모아 둔 포인트는 선택한 테마에 한 번만 적용하고,
공부 완료 시 기록한 보상 테마는 이후 정원 테마를 바꾸어도 유지합니다.
서버 변경은 `202610090001_free_collection_theme_switching.sql`, 트랜잭션 검증은
`supabase/tests/collection_theme_switching.sql`에 있습니다.

원본 `assets/collection` 폴더에 아이템별 완성 PNG 1장과 성장 PNG 5장을 준비합니다.
예를 들어 일곱 번째 동전은 `coin/coin_07/complete/coin_07.png`와
`coin/coin_07/growth/growth_coin_07_01.png`부터 `_05.png`까지입니다.
번호는 7 이상도 지원하며 테마별 아이템 개수가 서로 달라도 됩니다.

Python과 Pillow가 있는 환경에서 아래 명령을 실행합니다.

```powershell
python scripts/prepare-collection-assets.py 'C:\Users\rchani\Downloads\ssaida_collection_assets\assets\collection'
./scripts/sync-dev-collection-catalog.ps1
```

첫 명령은 폴더를 탐색해 앱용 WebP, 정적 이미지 목록, 로컬 `supabase/seed.sql`을 생성합니다.
이미지가 누락된 아이템이 있으면 파일을 덮어쓰기 전에 중단합니다.
두 번째 명령은 연결된 개발 프로젝트를 확인하고 새 DEV 항목만 등록합니다.
기존 카탈로그 값, 성장 포인트, 완료·공개 기록은 덮어쓰지 않습니다.
신규 DEV 항목의 성장 목표는 24포인트입니다. 새 이미지는 앱 빌드/업데이트에도 포함해야 합니다.
정식 이름·목표 포인트를 가진 production 콘텐츠는 별도 data migration으로 준비합니다.

## 후속 작업

### Migration 수정 규칙

Remote Supabase에 한 번 적용된 migration 파일은 수정하지 않습니다.
변경이 필요하면 반드시 새로운 migration 파일을 추가합니다.
원격 적용 여부는 migration 파일명의 버전으로 추적되므로 이미 적용된 파일을 수정하면
변경 내용이 원격에서 다시 실행되지 않아 로컬/원격 schema drift가 발생할 수 있습니다.
Step 4.1 선언 수정은 원격 적용 전이었기 때문에 허용한 예외이며, 이후 원격 적용된 파일에는
이 규칙을 적용합니다.

### BLOCKER BEFORE PRODUCTION

- Account deletion and PIN recovery use a server-recorded waiting period. The production DB, Edge Function and hourly deletion/cleanup schedules were deployed on 2026-10-18. Native-device Google sign-in/deletion validation and the public privacy/web deletion request resources remain store-release checks; see the policy below.

부모와 아이가 같은 Auth 세션을 공유하므로, 기기에서 수행 가능한 재인증은 아이도 수행할 수
있습니다. 따라서 신원 재증명 대신 지연(삭제 14일 / PIN 72시간) + 앱 전체 배너 + 취소로
보호합니다. 대기 중 현재 PIN으로 부모 모드에 들어가면 PIN 재설정 요청이 자동 취소됩니다.
대기 기간이 끝난 삭제는 사용자가 돌아오지 않아도 예약 작업이 완료합니다. 예약 작업은
매시간 실행되며 장애가 있어도 요청은 취소 또는 완료될 때까지 유지합니다.

- production collectible catalog data migration required
- all six themes require active catalog data
- without it select_collection_theme fails
  `supabase/seed.sql`은 local/dev 전용이며 remote `db push`로 적용되지 않습니다.
  DEV_* 항목을 production으로 옮기지 않고, 확정 콘텐츠로 별도 data migration을 준비합니다.

### Sensitive account actions: server contract

계정 삭제는 서버 접수 후 14일 대기, 처리 시작 전 취소, 이후 자동 삭제 정책입니다.
삭제 요청은 자동 만료되지 않으며 장애 후에도 재시도합니다. PIN 재설정은 72시간 대기와
이후 7일 실행 기한을 유지하고, 현재 PIN 확인·변경 시 대기 중인 재설정 요청을 취소합니다.

위 14일 설명은 기존 구현 상태입니다. 최신 목표는 [제품 결정](docs/product-decisions.md)의
이메일 인증·최종 동의 후 즉시 실행이며 DEV-03은 미완료입니다. 기존 데이터 보관·서버 계약·운영 이력은
[계정 삭제 정책](docs/account-deletion-policy.md)에 보존합니다.
2026-10-18 운영 DB·Edge Function·매시간 자동 삭제 및 정리 예약을 적용했습니다.
검증 범위와 출시 전 별도 확인 사항은 [운영 배포 기록](docs/production-db-deployment.md)에 있습니다.

### PIN 및 후속 UI

- 서버가 credential row를 잠가 실패 횟수를 직렬화합니다. 연속 5회 실패 시 5분 잠금,
  만료 후 새 시도 묶음을 시작하며 성공 시 카운터와 잠금을 초기화합니다.
- `verify_parent_pin` 반환 계약: `true` 성공, `false` 실패, `null` 잠금.
  5번째 실패도 예외 없이 잠금을 저장한 뒤 `null`을 반환합니다(예외에 의한 rollback 방지).
- 아이 헤더 → 부모님 메뉴의 로그아웃은 PIN 없이 가능합니다. 로그아웃은 PIN 재설정이 아닙니다.

- 부모 PIN은 같은 로그인 세션의 UI 모드 전환 확인입니다. Supabase Auth/RLS 권한을 대체하지 않습니다.
- 아이 헤더의 부모님 → PIN 확인 → 부모 홈, 아이 화면으로 복귀한 뒤에는 다시 PIN이 필요합니다.
- 로컬 seed.sql의 DEV 수집물은 개발/통합 테스트 전용입니다. 출시 전 실제 catalog를 별도 data migration으로 준비해야 합니다.
- Step 5: 부모 PARTIAL/RETRY·선택적 확인, 아이 다시 하기, 오늘 수동 숙제 추가,
  지난 일회성 공부의 leaf 조회·이월·넘기기를 기존 RPC에 연결했습니다.
- 늦은 PARTIAL 진도 충돌과 3일 확인 대기는 기존 데이터로 표시만 합니다.
- 목표시간 초과 시 안내와 그대로 하기를 제공하며, 공부량 줄이기 상세 편집은 후속 TODO입니다.
- Step 5 검증 범위와 실행 방법은 [검증 기록](docs/step5-validation.md)을 참고하세요.
- 자정/AppState 날짜 전환은 Step 6에서 연결했습니다. 실제 기기의 lifecycle·성장 gauge 검증은 후속으로 남깁니다.

## Step 6 로컬 알림

부모 설정에서 알림을 켜고 확인/미완료 안내 시간을 지정할 수 있습니다. 기본은 비활성입니다.
알림은 같은 Android/iOS 기기에만 표시되며, parent 알림 탭은 기존 PIN gate를 유지합니다.
패키지 추가 후 네이티브 앱을 다시 빌드해야 합니다. Web은 알림 미지원 안내만 표시합니다.
앱 종료 중 원격 상태 변경 감지와 정확한 정시 전달은 보장하지 않습니다.
구조·중복 방지·실기기 체크리스트는 [Step 6 알림 문서](docs/step6-notifications.md)를 참고하세요.
Windows 네이티브 빌드 환경과 재현 명령은 [Step 6.1 빌드 문서](docs/step6-1-android-build.md)를 참고하세요.

## 품질 검사 명령

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

`pnpm test`는 UI·로직 회귀 스크립트를 모두 실행하고 하나라도 실패하면 실패 코드로 종료합니다.
DB 전용 스크립트 5개와 혼합 스크립트의 DB 부분은 명시적으로 제외합니다. DB 회귀는 로컬
Docker/Supabase가 준비된 환경에서 해당 스크립트를 `--ui-only` 없이 별도로 실행해야 합니다.
패키지 매니저 없이도 `node scripts/run-regressions.mjs`로 같은 검사를 실행할 수 있습니다.
