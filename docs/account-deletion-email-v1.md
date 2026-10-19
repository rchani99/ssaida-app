# 계정 삭제 v1 — 이메일 인증 서버 및 Resend 연동 (2·3단계)

2026-10-19. 로컬 구현이며 **운영 DB·함수·예약을 변경하거나 운영 메일을 발송하지 않았다**. 앱 UI와 웹페이지도 변경하지 않았다. 1단계 삭제 원장/실행기와 14일 유예는 그대로 사용한다. 이 문서의 이메일 API가 1단계 보고서의 임시 proof 발급/확정 계약을 대체한다.

작업 보존 및 재개 기준은 [개발 상태](account-deletion-status.md)를 참고한다. **즉시 삭제는 다음 작업에서 구현할 예정이며 현재 미구현이다.** 이번 정리·커밋에서는 14일 유예와 기능 코드를 변경하지 않는다. 공급자 어댑터 구현 완료와 실제 Resend 운영 연결 미완료를 구분한다.

## 변경 파일

| 파일                                                                                        | 내용                                                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/202610190001_account_deletion_email.sql`                               | 코드 challenge·발송 상태·요청 제한, 원자적 코드 소비/증명 발급/확정, 이메일 변경 무효화, 기존 발급 우회 차단 |
| `supabase/functions/account-actions/email.ts`                                               | 앱/웹 공통 request·verify·confirm handler                                                                    |
| `supabase/functions/account-actions/email-crypto.ts`                                        | 8자리 난수, 용도 분리 HMAC, AES-GCM 발송 봉투                                                                |
| `supabase/functions/account-actions/email-mailer.ts`                                        | 발송 인터페이스, mock, 안전한 재시도 dispatcher                                                              |
| `supabase/functions/account-actions/index.ts`                                               | 새 경로·JWT 검사·로컬 mock 설정 연결, 구형 확정 경로 분리                                                    |
| `supabase/functions/account-actions/purge.ts`                                               | 기존 일정 비밀 비교 함수를 메일 worker에서도 재사용                                                          |
| `supabase/functions/account-actions/.env.example`                                           | 서버 전용 키·mock·worker 설정                                                                                |
| `scripts/account-deletion-email-regression.mjs`                                             | HTTP 계약·암호화·모의 발송 회귀                                                                              |
| `scripts/lib/account-deletion-email-db-cases.mjs`                                           | DB 인증·권한·동시성·발송 제한 회귀                                                                           |
| `scripts/account-actions-db-regression.mjs`, `scripts/lib/account-deletion-v1-db-cases.mjs` | 기존 단계의 회귀 이후 새 마이그레이션을 순서대로 검증                                                        |
| `docs/account-deletion-email-v1.md`, `docs/account-deletion-v1.md`                          | 이번 보고와 1단계 계약의 대체 안내                                                                           |

기존 마이그레이션 파일을 수정하지 않았다. `202610190001_account_deletion_email.sql`을 1단계 `202610180002_account_deletion_v1.sql` 다음에 적용한다. 원장 상태 전이, 공통 삭제 실행기, PIN 72시간 정책, `/status` 출력은 변경하지 않았다.

## API 계약

세 액션 모두 `POST /functions/v1/account-actions/email`, `Content-Type: application/json`이다. 쿼리 문자열이나 URL에 코드·토큰을 넣지 않는다. 모든 응답은 `Cache-Control: no-store`다. 앱은 `Authorization: Bearer <사용자 JWT>`가 필요하며, 웹은 Authorization 헤더를 보내지 않는다. 웹에서 잘못된 JWT를 익명 모드로 자동 전환하지 않는다.

### 1. request_deletion_email

앱 요청:

```json
{ "action": "request_deletion_email", "channel": "app" }
```

서버가 `getUser`로 JWT를 확인하고 등록 이메일을 결정한다. 앱 본문에 email을 넣으면 400으로 거부한다. 대상 UUID는 클라이언트가 전달하지 않는다.

웹 요청:

```json
{ "action": "request_deletion_email", "channel": "web", "email": "user@example.com" }
```

이메일은 trim/lowercase로 정규화한다. 임의 Gmail 점/별칭 변환은 하지 않는다. 대상은 서버가 현재 확인된 등록 이메일로 찾아 결정한다. 신규 Auth 사용자나 로그인 세션을 만들지 않는다.

문법상 유효한 이메일의 공통 응답은 HTTP 202:

```json
{
  "status": "accepted",
  "requestId": "<uuid>",
  "flowToken": "<64자리 hex>",
  "expiresIn": 600,
  "retryAfter": 60
}
```

존재하는 계정, 없는 계정, 접근 차단 계정, 재발송 대기, 발송 제한 모두 같은 응답 구조다. 계정 존재 여부, 마스킹 이메일, 실제 발송 여부를 반환하지 않는다. 제한된 요청의 ID는 실제 검증 가능한 challenge가 아닐 수 있다. 발송은 별도 worker에서 진행해 공급자 지연/실패가 계정 조회 응답에 반영되지 않는다. DB 작업의 미세한 시간 차이까지 완전한 상수 시간으로 보장하는 API는 아니다.

flowToken은 해당 브라우저 탭/앱 흐름의 고엔트로피 비밀이다. 이후 검증·확정에서 계속 필요하다. 새로고침·화면 전환에도 필요하다면 안전하게 보관하되 분석 로그나 URL에 넣지 않는다. UI는 retryAfter를 지키고 중복 탭/요청을 막아야 한다. 너무 이른 재발송 응답으로 기존 검증 흐름을 덮어쓰지 않는다.

### 2. verify_deletion_email

```json
{
  "action": "verify_deletion_email",
  "channel": "web",
  "requestId": "<requestId>",
  "flowToken": "<flowToken>",
  "code": "01234567"
}
```

앱은 channel을 app으로 바꾸고 같은 계정의 JWT를 보낸다. 코드는 선행 0을 포함할 수 있으므로 숫자로 변환하지 않는다. 발급 후 10분, 최대 실패 5회, 한 번만 사용 가능하다. 잘못된 코드 형식도 정상 challenge/flow에 대한 시도라면 실패 횟수에 포함된다. 원자적으로 코드를 소비하고 5분짜리 삭제 전용 증명을 발급한다.

HTTP 200 응답:

```json
{
  "proofId": "<uuid>",
  "proofToken": "<64자리 hex>",
  "intentId": "<예정 또는 기존 삭제 원장 UUID>",
  "operationId": "<proofId와 같은 UUID>",
  "expiresAt": "<증명 만료 ISO 시각>"
}
```

계정 UUID나 이메일은 반환하지 않는다. 잘못된/만료된/소비된/잠긴/없는 요청은 동일한 HTTP 400 `VERIFICATION_UNAVAILABLE`이다. IP/global 제한은 429 `RATE_LIMITED`다. 검증 응답이 유실되면 코드를 재사용하지 않고 60초 재발송 규칙에 따라 새 흐름을 시작한다.

### 3. confirm_deletion

클라이언트는 **별도의** CSPRNG 32바이트 receipt를 lowercase 64 hex로 만들고, 검증 응답의 operationId와 함께 **확정 API 호출 전에** 기존 복구 저장소에 저장한다. proofToken/flowToken을 receipt로 재사용하면 거부된다.

```json
{
  "action": "confirm_deletion",
  "channel": "web",
  "proofId": "<proofId>",
  "proofToken": "<proofToken>",
  "flowToken": "<flowToken>",
  "receipt": "<별도 64자리 hex>",
  "consent": true
}
```

앱은 JWT를 추가한다. 최종 동의 화면에서 사용자가 명시적으로 확정한 뒤 consent=true를 보낸다. 코드 검증 성공 자체로 자동 확정하면 안 된다. `userId`, `emailVerified` 같은 추가 인수는 거부한다.

성공 응답은 `requestId`, 호환 challenge `id`, `state: GRACE`, `policyVersion: email-grace-v1`, `availableAt`, `operationId`, `receiptExpiresAt`다. 신규 원장은 확정 시각부터 정확히 14일 유예다. 기존 GRACE 요청에 연결된 증명은 해당 요청의 유예를 연장하지 않는다. 증명은 특정 계정·channel·flow·삭제 intent·목적·버전에 묶이며 확정 시 한 번만 소비한다. 다른 활성 요청이 생겼거나 해당 intent가 취소된 경우 새로운 요청으로 바꾸지 않고 거부한다.

증명 만료·사용됨·불일치는 HTTP 409 `CONFIRMATION_UNAVAILABLE`. 응답 유실 후에는 승인 증명을 재사용하지 않고 저장해 둔 operationId/receipt로 기존 `POST /account-actions/status`를 조회한다. 원장 확정·증명 소비·receipt 생성은 같은 트랜잭션이다. status는 기존 `pending/deleted/failed/expired`만 반환하며, 조회 capability로 인증/확정을 할 수 없다. 아직 확정이 커밋되지 않은 순간의 expired를 곧바로 삭제 실패로 단정하지 않는다.

## 앱과 웹의 권한 차이

| 경계             | 앱                                         | 웹                                              |
| ---------------- | ------------------------------------------ | ----------------------------------------------- |
| 대상 선택        | 검증된 JWT의 등록 이메일                   | 서버가 입력 이메일로 대상 조회                  |
| 검증/확정        | 동일 JWT 계정 + channel + flow + 코드/증명 | web channel + flow + 코드/증명, 사용자 JWT 없음 |
| 계정 존재 정보   | 본인 Auth 정보만 이용                      | request 공통 응답, 대상 UUID 미반환             |
| 기존 데이터 권한 | 기존 서비스 JWT 권한                       | 증명으로 개인 데이터·PIN·로그인 접근 불가       |

앱 증명을 web으로, web 증명을 app으로 바꿀 수 없다. flowToken이나 proofToken 하나만 탈취해서는 확정할 수 없다. **web capability 묶음 전체가 탈취되면 정당한 보유자와 구분할 수 없으므로** HTTPS, 짧은 수명, 일회 소비, 안전한 클라이언트 보관이 필요하다. Origin/CORS는 브라우저 정책일 뿐 인증이나 curl 등 서버 요청의 제한을 대신하지 않는다. 실제 서버 요청은 DB의 원자적 횟수 제한으로 제어한다.

이메일을 바꾸거나 확인 상태를 바꾸면 Auth trigger가 이전 코드와 증명을 무효화한다. 이메일을 원래 값으로 되돌려도 되살아나지 않는다. 재발송은 이전 코드/증명을 무효화한다. 기존 1단계 service-only 임시 proof 발급 RPC와 최종 확인 RPC도 이제 거부하므로 새 코드 검증/최종 동의를 우회할 수 없다.

## 저장·제한·발송

- 코드: 편향 없는 CSPRNG 8자리. `requestId + code`에 목적/버전을 구분한 HMAC-SHA256 적용. HMAC 키 없이 DB만으로 8자리 코드를 오프라인 대입할 수 없도록 한다.
- 발송 대기 내용: 별도 키로 AES-256-GCM 암호화하며 requestId를 AAD로 묶는다. 코드 HMAC 키와 암호화 키는 각각 다른 32바이트 서버 비밀이다. flow/proof/receipt는 원문 대신 SHA-256 해시로 저장한다.
- 이메일과 연결 IP는 목적별 HMAC으로 횟수 제한 키를 만든다. 원문 이메일은 발송 봉투 안에만, 코드 원문은 봉투와 모의 발송 메모리에만 존재한다. 코드·토큰·이메일을 자체 로그로 출력하지 않는다.
- 요청 제한: 고정 1시간 창에서 전체 100회, 연결 IP 20회, 이메일 5회. 이메일별 최소 재발송 간격 60초는 별도로 적용한다. 검증은 10분 창 IP 60회/전체 1,000회, 확정은 IP 30회/전체 300회. 경계에서 고정 창의 burst가 가능하므로 운영 트래픽으로 수치를 검토한다.
- IP는 현재 Deno 연결 주소를 사용한다. 임의 `X-Forwarded-For`를 신뢰하지 않는다. 호스팅 프록시 뒤에서 실제 고객 IP를 안전하게 얻는 방법은 운영 전에 검증해야 하며, 확인되지 않은 헤더를 임의로 사용하지 않는다.
- challenge는 만료 10분 후부터 기존 cleanup에서 제거한다. 인증 증명은 5분 만료 후 기존 cleanup에서 제거한다. 제한 HMAC 기록은 2일 후 제거 대상이다. 실제 제거는 기존 cleanup 실행 간격만큼 늦어질 수 있다. 확인된 원장/receipt는 1단계 정책으로 보존한다.

메일은 `DeletionEmailSender.send()`로 분리했다. 3단계에서 **Resend HTTP 어댑터**를 추가했다. `ACCOUNT_DELETION_EMAIL_MODE=mock`은 로컬 Supabase URL에서만 허용한다. `resend` 모드는 API 키와 발신 주소가 필요하며, 누락/잘못된 설정이면 mock으로 전환하지 않고 EMAIL_NOT_CONFIGURED로 차단한다. 두 암호 키, 별도 worker 비밀, 삭제 활성화 조건도 충족해야 한다. 비밀값은 `.env.example`의 서버 전용 변수로 설정하고 EXPO_PUBLIC로 노출하지 않는다.

`POST /account-actions/email/send`는 별도 고엔트로피 worker bearer가 필요한 내부 경로다. 앱 JWT나 조회 receipt로 실행할 수 없다. 한 호출에서 최대 10개를 점유하며 재시도 오류를 만나면 현재 호출을 종료한다. 각 발송은 lease UUID로 보호된다. 3단계의 오류 분류와 재시도 규칙은 아래에 정리했다. worker 중단 또는 DB 완료 기록 유실로 lease가 만료되면 여전히 UNKNOWN으로 두고 자동 재발송하지 않는다. 만료된 lease의 늦은 완료 쓰기도 거부된다.

mock은 테스트 메모리의 inbox를 사용하며 로그나 공개 HTTP endpoint로 코드를 노출하지 않는다. 테스트 외 실제 메일 전송은 하지 않는다. 운영 worker 예약도 생성하지 않았다.

## 기존 메일 설정 확인 결과

2026-10-19 읽기 전용 확인:

- 로컬 `supabase/config.toml`에 local SMTP 테스트 설정은 있으나 외부 `auth.email.smtp` 블록은 주석 처리된 예시다. 예시의 공급자를 실제 사업자로 간주하지 않았다.
- 로컬 환경 파일에는 앱 Auth 설정만 있고 메일 자격증명이 없다. 값은 출력하지 않고 이름만 확인했다.
- 운영 프로젝트 `thinmctzgynmtuihirng`의 Edge Function 비밀값 이름 목록에는 기존 계정 작업 플래그/예약 비밀과 Supabase 기본값만 있으며 메일 공급자 자격증명이 없다.
- **Supabase Auth 원격 SMTP 설정은 확인하지 못했다.** Edge 비밀값 목록에 없다는 이유로 원격 SMTP도 없다고 단정하지 않는다. 기존 SMTP를 삭제/변경하거나 임의 사업자를 선택하지 않았다. 기본 Auth OTP를 삭제 인증용으로 호출하지 않는다.

3단계에서는 사용자 지정에 따라 Resend 어댑터를 구현했다. 기존 Auth SMTP는 변경하지 않는다. Resend 계정·도메인·키·할당량·실제 수신은 아직 검증하지 않았으므로 운영 실발송 준비가 완료된 상태는 아니다.

## 2단계 회귀 결과 (3단계 결과는 아래 참조)

- `pnpm test`: **47개 통과, 0개 실패**. runner에서 제외하는 DB 전용 9개 전체를 실행한 것은 아니다.
- `node scripts/account-actions-db-regression.mjs`: 별도 임시 PostgreSQL/Auth에서 기존 배포 스키마 → 1단계 → 2단계까지 순서대로 검증하여 통과.
- `pnpm typecheck`, `pnpm lint`, `deno check supabase/functions/account-actions/index.ts`, 변경 대상 `git diff --check`: 통과.

| 요청한 검증          | 확인 내용                                                                       |
| -------------------- | ------------------------------------------------------------------------------- |
| 정상 인증            | 앱/웹 코드 소비·5분 증명·확정, Auth 세션 생성 없음                              |
| 코드 만료            | 10분 만료 뒤 거부                                                               |
| 인증 실패 5회 초과   | 실패 5회 후 올바른 코드도 거부, 횟수 5에서 고정                                 |
| 코드 재사용          | 두 번째 사용 거부                                                               |
| 인증 동시 요청       | 코드 동시 검증은 한 건만 성공, 동시 발급은 cooldown 안에서 한 건                |
| 이메일 변경          | 코드 및 발급된 증명 무효화, 원래 이메일로 복원해도 거부                         |
| 존재하지 않는 이메일 | 공통 HTTP 접수 응답, 발송하지 않음, 증명 발급 불가                              |
| 발송 제한/중복       | 60초·IP·이메일·전체 제한, 단일 lease, 최대 3회 안전 재시도, UNKNOWN 재발송 금지 |
| 앱 JWT 불일치        | 코드/증명 대상 불일치와 channel 변경 거부                                       |
| 웹 삭제 확정         | JWT 없이 web proof+flow+consent로 GRACE, 정확한 14일 유지                       |
| 증명 재사용          | 재확정 거부, 별도 receipt로 응답 유실 복구, 증명 만료 거부                      |
| PIN/receipt 회귀     | 기존 72시간·PIN 회귀 유지, 기존 및 새 receipt pending/failed/deleted 복구       |

HTTP handler는 주입된 RPC 어댑터로 계약을, DB 상태/잠금/권한은 실제 격리 PostgreSQL로 검증했다. 실제 SMTP/외부 공급자, hosted gateway/PostgREST 통합은 이번 테스트 범위가 아니다. 공급자 연결 후 이 경계는 별도로 검증해야 한다.

## 향후 UI 연결 및 운영 전 확인

1. 앱에 이메일 요청→8자리 문자열 입력→최종 동의 순서를 연결한다. 60초 재발송/10분 코드/5분 증명 시간을 안내하고, 실제 계정 존재나 발송 결과를 추정하는 문구를 웹에 표시하지 않는다.
2. 인증 성공으로 로그인 세션을 변경하지 않는다. 코드/승인 토큰을 analytics·크래시 로그·URL·전역 query cache에 넣지 않는다. 확정 전 별도 receipt를 생성하고 기존 복구 marker에 저장하는 순서가 필요하다.
3. 웹에서는 로그인 없이 proof/flow로 확정하고 receipt로 상태를 확인한다. 유예 취소는 현재 로그인된 기존 cancel API를 이용한다. **비로그인 웹 취소 UI까지 제공하려면 별도의 취소 인증 계약이 필요하며 이번 확정용 증명을 취소 권한으로 재사용하지 않는다.**
4. Resend 도메인/발신자·비밀 관리와 회전, worker 실행 간격/인증, cleanup 실행을 확인한다. 키 회전 전에는 대기 challenge/봉투 처리와 제한 카운터 영향도 정해야 한다.
5. 운영의 정확한 CORS origin과 신뢰 가능한 프록시 IP 전달을 검증한다. 서버 측 제한 수치, gateway 요청 제한, 필요한 추가 남용 방지를 운영 규모에 맞춰 확인한다. CORS만으로 요청 남용이 막힌다고 간주하지 않는다.
6. 1단계 DB→함수 배포 절차와 함께 새 마이그레이션을 적용하고, 전용 검증 계정으로 PostgREST/실제 공급자 통합을 별도 확인한다. 이번 검증은 임시 DB/Auth 및 mock이며 운영 발송이나 실제 사용자 삭제를 검증한 것이 아니다.

## 3단계 변경 파일

| 파일                                                           | 변경                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `supabase/functions/account-actions/email-resend.ts`           | Resend HTTP 어댑터, 한국어 HTML/text 템플릿, 멱등 키, 8초 제한, 4KB 응답 제한, 오류 정규화 |
| `supabase/functions/account-actions/email-provider.ts`         | 명시적 mock/resend 선택과 설정 누락 차단                                                   |
| `supabase/functions/account-actions/email-mailer.ts`           | RETRY/FAILED/UNKNOWN 구분, 공급자 재시도 대기 전달                                         |
| `supabase/functions/account-actions/index.ts`                  | 공급자 환경변수와 발송 완료 RPC 연결                                                       |
| `supabase/functions/account-actions/.env.example`              | Resend 키·발신 주소 및 모드 안내                                                           |
| `supabase/migrations/202610190002_account_deletion_resend.sql` | 완료 RPC에 대기 시간과 FAILED 추가, 만료를 넘는 재시도 중단                                |
| `scripts/account-deletion-resend-regression.mjs`               | 네트워크 없이 Resend 응답·중복·응답 유실·타임아웃 검증                                     |
| `scripts/account-deletion-email-regression.mjs`                | 기존 mock 및 발송 결과·로그 회귀 확장                                                      |
| `scripts/lib/account-deletion-email-db-cases.mjs`              | DB backoff·코드 교체 경합·만료·권한 회귀 확장                                              |
| `docs/account-deletion-email-v1.md`                            | 3단계 보고와 배포 준비 절차                                                                |

기존 마이그레이션은 수정하지 않았다. 새 `202610190002`를 2단계 마이그레이션 뒤, 새 Edge Function 배포 전에 적용해야 한다. 완료 RPC는 네 번째 인자 `p_retry_after_seconds integer default 15`를 추가하고 기존 3인자 호출을 보존한다. 별도 overload는 두지 않는다. 실행 권한은 service_role에만 있다. 이번 작업에서는 로컬 회귀용 임시 DB에만 적용했다.

## 3단계 발송·재시도 계약

- 고정 HTTPS endpoint로만 전송하며 redirect를 따라가지 않는다. SDK나 로그인 OTP는 사용하지 않는다.
- `Idempotency-Key=account-deletion/<requestId>`를 사용한다. 자동 재시도는 수신자·코드·본문·발신 주소와 키를 그대로 유지한다. Resend의 멱등 보존 기간은 24시간으로 코드 수명 10분보다 길다. [Resend 멱등 키 문서](https://resend.com/docs/dashboard/emails/idempotency-keys)
- 2xx와 유효한 응답 id를 받으면 SENT로 기록한다. 여기서 SENT는 **공급자 접수 확인**이며 실제 받은편지함 도착을 뜻하지 않는다. 반송 webhook/수신 추적은 이번 범위 밖이다.
- 429(rate limit), 5xx, 같은 키의 동시 처리 409, 네트워크 오류·8초 타임아웃은 RETRY다. 공급자가 이미 수락했지만 응답이 유실됐어도 같은 멱등 키로 재시도한다. 다른 공급자를 추가할 때 이 안전성을 자동 가정하면 안 된다.
- `Retry-After`의 초 또는 HTTP-date를 반영하며 기본/최소 대기는 15초다. DB는 총 3회 시도까지만 허용한다. 다음 시도 시각이 코드 만료 이후이거나 대기가 600초를 넘으면 FAILED로 끝내고 암호화 발송 내용을 지운다. 코드 유효기간은 연장하지 않는다. [Resend 제한 헤더](https://resend.com/docs/api-reference/rate-limit)
- 잘못된 키·발신자·본문 등 4xx, 일/월 할당량 소진, 같은 멱등 키의 다른 본문 409는 FAILED다. 본문 충돌을 새 키로 우회하지 않는다. 2xx 응답이 손상되거나 id가 없으면 UNKNOWN이다. [Resend 오류 문서](https://resend.com/docs/api-reference/errors)
- worker 종료나 완료 RPC 응답 유실 시에는 기존 lease 만료→UNKNOWN 복구가 유지된다. 알려진 실패와 상태가 불확실한 작업 모두 사용자에게 계정 존재·발송 결과를 노출하지 않는다. 사용자는 기존 60초/시간당 제한 내에서 새 인증을 요청할 수 있다.
- 자동 재시도는 새 인증 요청을 만들지 않는다. 요청 제한 카운터를 환불하거나 증가시키지 않고 코드·만료 시각을 유지한다. 사용자가 재발송하면 새 requestId·코드·멱등 키를 만들고 이전 코드/증명을 무효화한다. 이전 메일이 늦게 도착할 수 있지만 이전 코드를 승인에 사용할 수 없다.
- 발송 결과와 무관하게 유효한 요청의 외부 응답은 기존 202 공통 구조다. 전역 설정 누락은 모든 계정에 동일한 503이다. 메일 본문에는 8자리 코드 외 이메일·계정 ID·증명·receipt를 넣지 않으며 제목에도 코드를 넣지 않는다. provider 응답/예외 원문과 비밀값을 자체 로그에 기록하지 않는다.

## Resend 대시보드와 발신 도메인 준비

1. 소유한 도메인에서 발송용 도메인/서브도메인을 결정한다. 예시 `mail.example.com`은 실제 설정값이 아니다. Resend → Domains → Add Domain에서 도메인과 발송 region을 선택한다.
2. Resend가 해당 도메인에 표시한 DKIM/SPF DNS 레코드(TXT/MX 또는 CNAME)를 DNS 관리자에 정확히 등록하고 Verified 상태를 확인한다. 기존 수신 MX나 SPF를 임의로 덮어쓰지 않는다. DMARC도 기존 정책과 맞춰 설정한다. [공식 도메인 등록 절차](https://resend.com/docs/add-a-domain)
3. 인증된 도메인의 발신 주소를 정해 `DELETION_EMAIL_FROM`에 설정한다. 예시 형식은 `쌓이다 <security@mail.example.com>`이다. 로그인한 사용자의 등록 이메일과 발신 주소는 별개이며, 인증된 발신 도메인에 속하는 주소를 사용한다. 인증 메일용 도메인의 open/click tracking은 끈다. [도메인·추적 설정](https://resend.com/docs/dashboard/domains/introduction)
4. API Keys에서 별도 삭제 메일용 **Sending access** 키를 만들고 해당 발신 도메인으로 제한한다. 키를 채팅·클라이언트·저장소에 넣지 않는다. [키 권한·도메인 제한](https://resend.com/docs/api-reference/api-keys/create-api-key)
5. 팀 발송 한도, 차단 수신자, 발송 승인 상태와 로그/메일 본문 보관·접근 정책을 점검한다. 애플리케이션의 무로그 정책이 공급자 측 보관까지 없애지는 않는다. 현재 대시보드 설정·DNS 소유권·키 권한·수신 가능 여부는 코드에서 확인하지 못했다.

## 필요한 Supabase Edge Function Secrets

| 변수                                    | 값/용도                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| `ACCOUNT_DELETION_EMAIL_MODE`           | 실발송은 `resend`, 로컬 mock은 `mock`                   |
| `RESEND_API_KEY`                        | 위에서 발급한 서버 전용 Sending access 키               |
| `DELETION_EMAIL_FROM`                   | 검증된 도메인의 단일 발신 주소 또는 `표시명 <주소>`     |
| `ACCOUNT_DELETION_EMAIL_HMAC_KEY`       | 기존 코드/제한용 32바이트 lowercase hex 키              |
| `ACCOUNT_DELETION_EMAIL_ENCRYPTION_KEY` | HMAC 키와 다른 32바이트 lowercase hex 암호화 키         |
| `ACCOUNT_DELETION_MAIL_WORKER_SECRET`   | 별도 32자 이상 고엔트로피 worker bearer                 |
| `ACCOUNT_ACTIONS_ENABLED`               | 기존 삭제 기능 활성화 플래그; 배포 검증 전 비활성 유지  |
| `ACCOUNT_ACTIONS_PURGE_SECRET`          | 기존 삭제 실행기 전용 비밀; worker/key와 재사용 금지    |
| `ACCOUNT_ACTIONS_ALLOWED_ORIGINS`       | 기존 웹 origin allowlist, native/server만이면 비어 있음 |

Supabase가 주입하는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`도 필요하다. 기존 `PIN_RECOVERY_ENABLED`는 유지한다. 기존 정상 암호 키를 배포 때마다 재생성하면 미처리 코드/발송 봉투를 사용할 수 없으므로 보존한다. Secret 값은 Supabase의 서버 비밀 저장소에 등록하며 이번 작업에서 등록·변경하지 않았다. Auth SMTP 설정을 Resend로 바꿀 필요는 없다.

## 실제 발송 검증 전에 남은 작업

- 도메인 검증·발신 주소·키 권한·할당량·보관 정책과 Edge Function의 외부 HTTPS 연결을 확인한다.
- 마이그레이션 순서와 함수 배포를 준비한다. 웹용 gateway/JWT 설정은 기존 2단계 계약대로 확인한다. 수신자에게 실제 발송하기 전 별도 테스트 환경과 승인된 수신자를 정한다.
- 내부 `/account-actions/email/send` 호출 worker를 설정해야 메일이 처리된다. 예를 들어 15초~1분 주기를 정하되 공급자 전체 팀 한도와 처리량을 확인한다. 개별 메시지 backoff는 DB가 강제하지만 공급자 전체 팀에 대한 전역 속도 제한기는 추가하지 않았다. 여러 worker/다른 서비스가 같은 Resend 팀을 쓰는 경우 호출 동시성을 조정한다. 기존 삭제 purge 예약과 메일 worker 예약은 별개이며 이번에 어느 예약도 적용하지 않았다.
- 발신 주소·템플릿·Resend 팀을 변경할 때에는 worker와 신규 접수를 멈추고 기존 10분 challenge가 만료될 때까지 기다린 후 변경한다. 같은 requestId의 본문 변경 또는 다른 팀으로의 키 교체로 멱등 보장을 깨지 않는다.
- 승인된 검증 환경에서 실제 수신·스팸함·SPF/DKIM/DMARC·모바일 메일 표시와 재발송 후 구코드 거부를 점검한다. 계정 최종 삭제는 이 발송 검증에 필요하지 않다. 이번에는 외부 Resend API를 호출하거나 실제 메일을 보내지 않았다.

## 3단계 검증 결과

- `pnpm test`: **48개 회귀 스크립트 통과, 0개 실패**. 일반 runner가 제외하는 DB 전용 9개 및 혼합 스크립트의 DB 부분 전체를 실행했다는 뜻은 아니다.
- `node scripts/account-actions-db-regression.mjs`: 별도 임시 Docker PostgreSQL/Auth에서 과거 스키마·1단계·2단계·3단계 마이그레이션과 회귀 모두 통과. Retry-After 대기, 코드/만료 유지, 발송 실패 후 재요청 간격, 발송 중 코드 교체, 늦은 성공 응답, 만료 이후 재시도 중단, service-only 권한을 추가 검증했다.
- Resend 응답 모의 테스트: 정상 응답, 429 및 일/월 할당량, 5xx, 동시/본문 충돌 409, 기타 4xx, 손상/과대 응답, 헤더/본문 타임아웃, 응답 유실 후 같은 키로 중복 방지, 로그에 민감 정보가 담긴 예외의 정규화 통과. 실제 키나 외부 호출을 사용하지 않았다.
- 기존 코드 만료·재사용·동시 검증·이메일 변경 무효화, 앱/웹 권한, receipt 복구, PIN 72시간, 삭제 14일 회귀 통과.
- `pnpm typecheck`, `pnpm lint`, `deno check supabase/functions/account-actions/index.ts` 통과. 실서비스 gateway/PostgREST 경유와 실제 메일 수신은 별도 배포 전 검증 대상으로 남아 있다.

7. Supabase 플랫폼의 Auth/DB/API 로그 보존과 매개변수 로깅 설정도 점검한다. 자체 코드가 로그를 남기지 않는다는 사실만으로 플랫폼 로그까지 개인정보가 없다고 단정하지 않는다.
