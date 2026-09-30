# 쌓이다 (Ssaida)

초등학생의 공부 습관 관리를 위한 React Native/Expo 앱입니다. 부모 인증과 온보딩에 더해 학습
등록, 오늘 계획, 공부 시작·완료, 부모 확인, 컬렉션 성장의 핵심 흐름을 Supabase에 연결합니다.

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
- Expo Go QR 대신 설치된 `ssaida-app` 사용. 준비 완료 후 화면이 갱신되지 않으면 앱을 다시 열기

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

## 후속 작업

### Migration 수정 규칙

Remote Supabase에 한 번 적용된 migration 파일은 수정하지 않습니다.
변경이 필요하면 반드시 새로운 migration 파일을 추가합니다.
원격 적용 여부는 migration 파일명의 버전으로 추적되므로 이미 적용된 파일을 수정하면
변경 내용이 원격에서 다시 실행되지 않아 로컬/원격 schema drift가 발생할 수 있습니다.
Step 4.1 선언 수정은 원격 적용 전이었기 때문에 허용한 예외이며, 이후 원격 적용된 파일에는
이 규칙을 적용합니다.

### BLOCKER BEFORE PRODUCTION

- Parent PIN recovery requires parent re-authentication before production release. The server contract below is implemented locally; the Google proof adapter and UI activation are still release blockers.

Google 재인증 등 부모 재인증을 포함한 복구가 필요합니다. 아이/부모가 같은 Auth 세션을
사용하므로 단순 authenticated `reset_parent_pin` RPC는 제공하지 않습니다.

- production collectible catalog data migration required
- all six themes require active catalog data
- without it select_collection_theme fails
  `supabase/seed.sql`은 local/dev 전용이며 remote `db push`로 적용되지 않습니다.
  DEV_* 항목을 production으로 옮기지 않고, 확정 콘텐츠로 별도 data migration을 준비합니다.

### Sensitive account actions: server contract (not deployed)

- `supabase/functions/account-actions` is the only Admin boundary. It is disabled unless `ACCOUNT_ACTIONS_ENABLED=true` and `ACCOUNT_ACTIONS_GOOGLE_CLIENT_ID` is set. Supabase supplies its server-only URL/Admin key; never put these credentials in the app. `verify_jwt=false` delegates verification to the handler, which calls Auth `getUser(bearer)` for every account action. The only session-free route is the read-only `POST /account-actions/status` capability check described below.
- `begin { purpose }` accepts `delete_account` or `reset_parent_pin`, derives the user and Google identity from Auth, and returns `{ id, nonce, expiresAt, audience }`. Issuance is serialized per user, limited to once per 30 seconds, and cancels earlier unconsumed challenges. Challenges expire after five minutes.
- `verify { id, idToken }` requires a Google RS256 ID token with the configured audience, issuer, matching linked Google `sub`, nonce, and fresh `auth_time`. The signature is checked against Google's fixed JWKS endpoint. Request the essential `auth_time` claim in a dedicated provider reauthentication flow. Missing/stale claims fail closed; `iat`, refresh, consent or account selection alone do not prove reauthentication. Existing `google-oauth.ts` produces a Supabase session and is **not** a proof adapter. Google accounts without a linked identity and DEV email-only users cannot use this contract.
- `cancel { id }` invalidates a pending/verified challenge. Wait for its acknowledgement before reporting cancellation. An operation already claimed for execution cannot be cancelled. A lost cancellation response requires retry or waiting for expiry.
- `prepare_delete { id }` requires a verified, unexpired deletion proof and returns `{ operationId, receipt, expiresAt }`. The server generates a random operation UUID and independent 256-bit receipt, stores only SHA-256(receipt), and permits one operation per proof. Lost preparation responses do not execute deletion; the caller must obtain a new proof to prepare again.
- `delete { id, operationId }` atomically claims the operation and consumes the existing one-time proof, then calls the server Admin hard-delete API on the authenticated user. The receipt cannot authorize deletion or PIN reset. Claim and Auth deletion remain separate transactions; an ambiguous Admin failure stays pending and must never automatically resend deletion. No raw SQL deletion of Auth users is exposed by the app.
- Migration `202609300003_account_deletion_receipts.sql` adds an RLS-enabled, service-RPC-only operation table with no cascading FK to Auth/proofs. An `AFTER DELETE ON auth.users` trigger writes `DELETED` in the **same transaction** as the Admin hard deletion and clears user/proof UUIDs. There is no post-deletion status-write crash window; trigger failure rolls back Auth deletion. Before deletion the UUIDs bind the operation to its authenticated owner/proof; after deletion only opaque identifiers, receipt hash and timestamps remain. Existing migrations are unchanged.
- `POST /functions/v1/account-actions/status` accepts only `{ operationId, receipt }` in a JSON body, with a public app API key and no Auth session requirement. It returns only `{ status: pending | deleted | failed | expired }`. Unknown ID, wrong/missing receipt and expired receipt share `expired`; no email, user UUID or proof is returned. `failed` means an unclaimed operation passed its execution deadline. Once claimed, an ambiguous Admin request remains `pending` until a deletion commit or receipt expiry, never inferred failure from token invalidation or a timeout. Queries are repeatable and do not consume/extend receipts or trigger deletion.
- `reset_pin { id, newPin }` atomically consumes only a PIN-recovery challenge, stores bcrypt cost 12, and resets failed attempts/lockout. The existing current-PIN change RPC is unchanged. New proof functions and the challenge table are unavailable to `anon`, `authenticated` and PUBLIC; only the Edge service role can access them. No PIN/provider token is persisted or logged by this implementation. Configure production gateway/database logs so request bodies and RPC parameters are not captured.
- Deletion cascades through profile, PIN credential, child, study items, plans/tasks, collectibles and growth events; the shared catalog remains. Access/refresh checks at Auth reject deleted users. Previously minted JWTs can remain cryptographically valid until expiry; existing owner RLS loses the deleted profile, but shared catalog reads are not immediate JWT revocation. Do not claim all issued tokens are instantly invalidated. Storage objects, backups and operational log retention need a separate release review.
- `createAccountActions`/`createSensitiveActionFlow` keep reauthentication proofs in memory and remain disconnected from settings/PIN dialogs. Before sending deletion, persist `ssaida.account_cleanup_pending.v1` with version, `unconfirmed` phase, account UUID and the operation's ID/receipt/expiry. The UUID selects account-scoped storage and prevents cleanup from signing out another account; no PIN/Auth token/Google credential/reauthentication proof is persisted. The receipt is a separate read-only capability; never log it or put it in a URL. A confirmed delete response or receipt status changes the phase to `cleanup` before local removal. Successful cleanup removes the receipt with the marker.
- `AccountRecoveryGate` mounts before Auth/Notification providers. A confirmed marker resumes cleanup at startup/foreground or through its retry button, without reauthentication: fence/drain notification writers, cancel/dismiss notices, remove account preferences, cancel/clear query cache, reset mode and sign out locally. Steps are repeatable; the marker is removed last. Providers then mount and the existing auth guard shows login. Every partial failure retains the marker.
- Response loss, ambiguous server failure, or failure to persist confirmation retains `unconfirmed`. On restart/foreground/manual retry the gate queries the receipt endpoint using direct fetch without session refresh; `deleted` resumes proof-free cleanup. `pending`, network errors, expiry and `failed` keep data intact and show a retry/confirmation message. The client never resends deletion or infers deletion from an expired/missing session. A known pre-Admin rejection removes the marker. Legacy unconfirmed markers without receipts cannot be retrospectively given a trusted receipt and still require support reconciliation.
- Receipt lookup is protected against guessing by 256 bits of cryptographic entropy, indexed operation lookup, uniform invalid-capability responses and the same 16KB streaming request bound. No failure counter can invalidate another device's valid receipt. This is capability security, not a distributed request-rate limiter; configure gateway throttling for resource-abuse protection before exposing the public endpoint, without recording request bodies. Preparation remains bounded by one operation per proof and the existing proof issuance rate limit.
- Receipts are valid for 7 days from preparation; successful queries do not shorten or extend that window. Service-only `select public.cleanup_account_deletion_operations();` removes up to 1,000 records per call only 24 hours after expiry, using `SKIP LOCKED`. Schedule it hourly alongside proof cleanup on a trusted server, repeat bounded batches as needed, and document the 7-day recovery/8-day retention policy. No production scheduler was registered.
- Still required: verified Google native/browser proof acquisition with nonce and fresh authentication, final confirmation UI, the child PIN recovery entry, migration/function deployment and scheduler/gateway configuration, support policy for expired/missing receipts or indefinitely pending claims, policy/support links and real provider/device end-to-end checks. Current settings remain informational; this change does not make deletion/recovery release-ready. No external settings or deployment were performed.
- Proof expiry is enforced on every use. Migration `202609300002_account_action_cleanup.sql` adds service-only `select public.cleanup_sensitive_action_challenges();`: deletes at most 1,000 rows per call, of any status, only 24 hours after expiry; skips locked rows. Recent consumed/cancelled proofs and active transactions remain intact. Schedule hourly on a trusted server, repeating bounded batches as needed, and document retention. No production cron is installed. Existing per-user issuance cleanup remains in place.
- Edge requests require JSON and at most 16,000 UTF-8 bytes. Declared oversized bodies are rejected before authentication; a streaming byte limit also rejects absent/false Content-Length, and length mismatches/unsupported encodings are rejected without executing actions.
- Local verification: `node scripts/account-actions-regression.mjs`; `node scripts/account-recovery-regression.mjs`; `node scripts/deletion-receipt-regression.mjs`; `node scripts/account-actions-db-regression.mjs` creates/removes dedicated Docker PostgreSQL/Auth resources and never reads `.env`; Deno `check index.ts` and `test google-proof_test.ts` from the function directory. Receipt tests cover missing responses, restart without Auth, repeat queries after cleanup, invalid/foreign/expired receipts, deletion commit/rollback races and real Admin deletion/cascade survival. App TypeScript excludes Deno functions, so both checks are required. The normal regression runner skips the isolated DB test.

References: [Supabase Admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Google ID token / auth_time contract](https://developers.google.com/identity/openid-connect/reference), [Supabase deletion/session behavior](https://supabase.com/docs/guides/auth/managing-user-data).

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
