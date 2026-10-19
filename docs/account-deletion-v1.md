# 계정 삭제 v1 — 서버 기반 1단계

2026-10-18 작성. **로컬 구현이며 운영 미적용**이다. 이메일 발송·이메일 소유 확인·UI는 이번 단계에 포함하지 않는다. 기존 운영 정책은 `account-deletion-policy.md`에 기록되어 있으며, 이 문서로 운영 배포가 완료되었다고 해석하지 않는다.

2026-10-19 보완: 이메일 서버 2단계를 추가했다. 아래 임시 proof 발급/확정 계약은 `account-deletion-email-v1.md`의 코드 검증·명시적 동의 계약으로 대체된다. 1단계의 원장과 실행 정책은 유지한다.

2026-10-19 작업 보존: 최신 완료/미완료 및 재개 순서는 [개발 상태](account-deletion-status.md)를 기준으로 한다. Resend 어댑터까지 코드로 구현했지만 운영 연결·배포는 미완료다. **현재 코드는 14일 유예이며, 다음 작업의 즉시 삭제 전환은 아직 구현하지 않았다.** 아래 이메일 API와 검증 결과는 1단계 당시 기록이며, 현재 이메일 계약/검증은 [2·3단계 보고서](account-deletion-email-v1.md)를 따른다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `supabase/migrations/202610180002_account_deletion_v1.sql` | 신규 원장·이메일 증명, 정책 이관, 접근 차단, lease/정리/완료 RPC와 Auth trigger |
| `supabase/functions/account-actions/core.ts` | 최종 이메일 증명 확인 액션과 PIN 인증 경계 |
| `supabase/functions/account-actions/index.ts` | DB 기반 인증 검사 및 수동/예약 공통 실행기 연결 |
| `supabase/functions/account-actions/executor.ts` | 신규 공통 삭제·장애·응답 유실 복구 실행기 |
| `supabase/functions/account-actions/purge.ts` | 기존 예약 handler에 lease 작업 전달 |
| `supabase/functions/account-actions/cors.ts` | 정확한 origin allowlist 기반 웹 호출 |
| `supabase/functions/account-actions/.env.example` | 새 인증 정책과 웹 origin 설정 설명 |
| `scripts/account-actions-db-regression.mjs` | 과거 스키마 회귀 후 v1 업그레이드 검증, 격리 HTTP 클라이언트 보완 |
| `scripts/lib/account-deletion-v1-db-cases.mjs` | 신규 DB/Auth·중복·경합·권한·재시도 회귀 |
| `scripts/account-deletion-executor-regression.mjs` | 실행기 장애/응답 유실, 인증 입력 및 CORS 회귀 |
| `docs/account-deletion-v1.md` | 구현·API 계약·검증·배포 보고 |

기존 배포 마이그레이션, 앱 UI, receipt 클라이언트/로컬 복구 저장소는 변경하지 않았다.

## 정책과 상태

| 정책 | 신규 접수 | 유예 | 취소 |
| --- | --- | --- | --- |
| `legacy-delay-v0` | 마이그레이션 당시 pending/consumed 요청만 이관 | 기존 시각 보존 | 기존 계약대로 실행 점유 전까지 |
| `email-grace-v1` | 등록 이메일 확인 후 삭제 전용 증명 소비 | 최종 확인 시각부터 정확히 14일 | 유예 종료 전까지 |

신규 요청은 `GRACE → PROCESSING → DELETED`, 또는 `GRACE → CANCELLED`로 전환한다. 이메일 증명을 발급받는 행위 자체는 삭제 요청이 아니며 유예를 시작하지 않는다. 별도의 FAILED 최종 상태는 없다. 실행 실패는 PROCESSING을 유지하여 접근 차단을 풀지 않고 재시도한다.

`account_deletion_requests`는 Auth FK가 없는 영속 원장이다. 계정당 활성 요청은 partial unique index로 하나만 허용한다. 취소/완료 시 user_id와 challenge_id를 제거한다. 원장에는 이메일, 이름, PIN, 원문 토큰, SDK 오류를 저장하지 않는다. 비식별 완료 원장의 보존 기간은 운영 배포 전에 정해야 한다. 기존 receipt의 user UUID/해시는 기존 TTL까지 유지하며 Auth 삭제 시 사용자·challenge 연결은 같은 트랜잭션에서 제거된다.

## 인증과 접근 경계

- 클라이언트는 기존 publishable key와 자신의 JWT만 사용한다. service role, 예약 실행 비밀은 서버 전용이다.
- 일반 삭제 API는 Supabase `getUser`로 세션을 확인하고 DB 접근 상태를 검사한다. 삭제에 Google 재인증을 사용하지 않는다. PIN의 Google identity 검사, 72시간 대기, PIN bcrypt/실패 횟수/잠금 규칙은 보존한다.
- 유예 중 모든 기존 데이터 기능을 이용할 수 있다. claim 커밋부터 PROCESSING이며 개인 데이터 RLS의 restrictive 정책, 21개 SECURITY DEFINER RPC의 진입 검사, 직접 쓰기 statement trigger로 접근을 거부한다. Auth 삭제 뒤에는 Auth 존재 여부 검사로 잔존 JWT를 거부한다. 공용 collectible catalog는 공개 카탈로그로 유지한다.
- 기존 함수의 OID·서명·기본 인수·권한과 본문을 보존하면서 명시된 RPC 목록에 진입 검사를 넣는다. 이후 CREATE OR REPLACE 마이그레이션은 해당 검사를 유지해야 하며 전체 authenticated definer 목록 회귀가 이를 검사한다.
- 사용자 쓰기와 claim은 같은 사용자 advisory transaction lock을 사용한다. 이미 실행 중인 쓰기는 먼저 완료되거나 claim 이후 차단된다. RLS 읽기는 PostgreSQL의 트랜잭션 스냅샷 규칙을 따른다. 이미 반환된 데이터나 시작된 읽기를 소급 회수하지는 않는다.
- `/status`는 기존 session-free receipt capability 계약을 유지한다. 출력은 `pending | deleted | failed | expired`뿐이다. receipt로 삭제 승인이나 데이터 접근을 할 수 없다.
- 브라우저 호출은 `ACCOUNT_ACTIONS_ALLOWED_ORIGINS`의 정확한 origin 목록이 필요하다. 기본값은 빈 목록이다. native/server 요청은 기존 인증을 계속 사용한다.

## 실행기와 복구

수동 account-actions와 `/purge`는 같은 `executor.ts`를 사용한다. `claim_account_deletion`은 원장을 원자적으로 점유하고 5분 lease와 새 lease UUID를 발급한다. 동시에 하나만 성공하며 취소와 동일 계정 잠금을 공유한다. 에러 기록은 해당 lease만 할 수 있다. 명시적 실패는 1시간 뒤, 프로세스 중단은 lease 만료 뒤 다음 예약 실행에서 재시도한다.

1. 점유/접근 차단 및 기존 challenge consumed·receipt started 표시.
2. Storage 버킷·객체가 모두 0인지 확인. 하나라도 있으면 중단하며 앱 데이터 삭제를 시작하지 않는다.
3. profiles 삭제와 검증. 현재 사용자 데이터는 profiles → children/PIN/pilot → 학습·수집 데이터 FK CASCADE 아래 있다. PIN challenge와 이메일 증명도 정리한다. 원장의 Storage 검사·앱 정리·Auth 준비 시각을 기록한다. 이 단계는 한 트랜잭션이므로 중단 시 모두 롤백된다.
4. Admin hard-delete. Auth BEFORE DELETE trigger가 준비 상태, profiles 잔존 여부, Storage를 다시 검사한다. 이후 AFTER DELETE trigger가 원장과 모든 기존 receipt를 함께 완료 처리한다.
5. 응답 유실 시 원장 완료를 조회하여 성공 여부를 복구한다. 임의의 Auth 404를 완료로 간주하지 않는다. 반복 실행은 완료 원장을 확인하고 종료한다.

lease가 만료된 네트워크 요청을 외부 Auth API에서 취소할 수는 없다. 그래서 외부 호출 횟수의 exactly-once를 주장하지 않는다. PROCESSING의 취소 불가, 정리 단계의 멱등성, 최종 Auth 트랜잭션 재검사와 원자적 receipt 완료가 중복 호출의 안전성을 보장한다. 단계 실패 후 정상 서비스 접근으로 되돌리지 않는다.

Storage 검사는 확장 지점이다. 앞으로 파일 기능을 추가할 때는 소유권/경로 규약, service-role 업로드 소유권, 삭제 목록 및 Storage API remove 재시도까지 구현한 후 이 제한을 교체해야 한다. SQL로 Storage 메타데이터만 삭제해서는 안 된다. [Supabase Storage schema 지침](https://supabase.com/docs/guides/storage/schema/design)을 따른다.

## 다음 단계 이메일 API 계약

이 릴리스에는 증명 발급용 HTTP 경로나 이메일 발송기가 **없다**. 따라서 이메일 확인 없이 새 삭제 요청을 만들 수 없다. 기존 `begin/delete_account`는 이미 확정된 요청 재조회만 가능하며 신규 요청은 거부된다. 구형 `start_account_deletion`과 `claim_due_account_deletion`은 fail-closed여서 구형 서버가 직접 Auth 삭제 권한을 새로 얻을 수 없다.

향후 이메일 확인 서비스의 신뢰 경계:

1. 서버가 등록 이메일과 사용자 UUID를 조회한다. 이메일 존재 유무가 드러나지 않는 응답, 발송/검증 시도 제한, 만료, 재전송 및 무차별 대입 방지를 구현한다. Supabase 로그인 OTP를 대신 사용하지 않는다.
2. **실제 등록 이메일 소유 확인에 성공한 서버만** `register_account_deletion_email_proof(p_user_id, p_verified_email, p_token_hash)`를 호출한다. 이 service-only RPC는 이메일 발송/코드 검증을 수행하지 않으며, 등록 이메일이 있다는 사실만으로 호출하면 안 된다.
3. 서버에서 암호학적 난수 32바이트를 만들고 64자리 lowercase hex token으로 전달한다. RPC에는 그 문자열의 SHA-256 hex만 전달한다. 발급 시 현재 확인된 등록 이메일과 일치하는지 검사하고, 이메일 SHA-256에 bcrypt를 적용한 단기 binding을 저장한다. 확인 전에 이메일이 바뀌면 증명을 거부한다. 발급은 계정당 30초 간격이며 증명은 10분 유효하다. 실제 이메일 코드 검증의 시도 제한은 다음 단계에서 별도로 필요하다.
4. 로그인된 앱/웹의 최종 확인: `POST /functions/v1/account-actions`, `Authorization: Bearer <user JWT>`, JSON `{ "action": "confirm_deletion", "proofId": "<uuid>", "token": "<64 hex>" }`. 본문 userId, emailVerified 같은 우회 인수는 거부한다. 응답은 `{ requestId, id, state, policyVersion, availableAt }`이며 id는 호환 challenge ID다. 14일은 이 요청의 성공 시점부터 계산한다.
5. 확정 후 기존 `watch_delete`로 receipt를 발급받아 기존 복구 저장소에 저장한다. 증명 유효 기간 내 재확인은 원래 요청을 반환하며 시간을 변경하지 않는다. 취소된 증명을 재사용해도 CANCELLED를 반환한다. 만료 뒤 응답 복구는 로그인 후 기존 resume/watch 경로를 사용한다.
6. 취소는 기존 `{ action: "cancel", id }`. 세션 없는 receipt 상태 확인은 기존 `/status`. 실행은 서버 예약이 담당한다.

앱을 지운 사용자가 웹에서 **로그인 없이 이메일만으로** 삭제하는 흐름은 아직 공개하지 않는다. 다음 단계에서 삭제 전용 제한 capability로 대상 UUID를 서버가 도출하고 확정·취소를 허용하는 경로가 필요하다. 위 HTTP 확정 API는 현재 사용자 JWT가 필요하다. 이메일 입력만으로 사용자 UUID를 반환하거나 임의 사용자 ID를 신뢰해서는 안 된다. 이메일 변경·계정 재가입에 걸친 증명 재사용도 금지한다.

## 검증과 배포

최종 실행 결과: `pnpm test` **46개 통과**, `pnpm typecheck`, `pnpm lint`, `deno check supabase/functions/account-actions/index.ts` 통과. 일반 테스트 runner가 제외하는 9개 DB 전용 스크립트 전체를 실행한 것은 아니다. 이번 변경 대상인 `node scripts/account-actions-db-regression.mjs`는 별도 실행하여 통과했다.

DB/Auth 회귀에서 중복 확정, 14일 고정, 유예 중 정상 온보딩·학습 생성과 취소, 취소한 증명 재사용, 이메일 변경·만료, 취소/claim 경합, 중복 worker, 진행 중 사용자 쓰기 잠금, 유효한 기존 JWT의 RLS·RPC 차단, 구형 실행 RPC 차단, Storage 추가 시 중단, 정리 전 실제 Auth Admin 거부, 앱 데이터 cascade, 정리 멱등성, retry backoff/오래된 lease 거부, 실제 Auth 삭제, 기존 receipt 복구 및 원장 식별자 제거를 확인했다. 실행기 단위 회귀는 Auth 장애·성공 응답 유실·완료 기록 누락·실패 기록 자체의 장애를 포함한다.

`node scripts/account-actions-db-regression.mjs`는 .env/기존 DB에 접속하지 않고 매번 임시 Docker DB/Auth를 만든다. 과거 회귀는 배포된 이전 스키마에서 실행한 뒤 v1 마이그레이션과 새 회귀를 실행한다. Storage는 실제 서비스가 아닌 빈 메타데이터 fixture이며 파일 제거 API를 검증했다고 주장하지 않는다. 실제 Auth로 발급한 JWT의 subject를 PostgreSQL authenticated role에 설정해 RLS/RPC를 검증한다. PostgREST HTTP와 실제 이메일 공급자 통합은 별도 배포 전 검사 대상이다.

배포 전 순서:

1. 현재 서버와 마이그레이션 버전, 중복 legacy 활성 요청, FK 구조/개인 데이터 신규 테이블, Storage 0개 상태 및 함수 owner의 Storage SELECT/LOCK 권한을 읽기 전용으로 확인한다. 충돌하면 원장을 임의 병합하지 말고 중단한다.
2. 예약 purge를 잠시 중지하고 진행 중 요청을 drain한 뒤 **DB 마이그레이션 먼저**, 새 Edge Function 다음 순서로 배포한다. 구형 서버와 새 DB 사이에서는 실행 API가 거부되는 안전한 중단 구간이 생긴다. 새 코드만 먼저 배포하면 v1 RPC가 없어 실패하므로 피한다.
3. 기능 플래그·기존 예약 비밀·CORS origin을 점검하고 예약을 재개한다. `/purge` URL 및 기존 시간당 예약은 그대로 재사용한다. 이번 작업은 운영 DB, Edge Function, 예약을 변경하지 않았다.
4. 실제 계정이 아닌 전용 검증 계정으로 새 경계와 receipt 복구를 확인한다. due 수, attempts, last_error, 장기 PROCESSING을 점검한다. 자체 코드에서 원문 이메일/토큰/SDK 오류를 로그에 남기지 않는다. Supabase Auth 자체 감사 로그는 별도다. [GoTrue Admin 삭제 구현](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go)은 삭제 감사 기록에 이메일 등 정보를 기록하므로 플랫폼 로그 설정과 보존 정책도 배포 전에 검토해야 한다. 이번 앱 데이터 정리가 플랫폼 로그까지 삭제했다고 간주하지 않는다.
5. 이메일 단계 전에는 새 계정 삭제 접수가 차단됨을 출시 판단에 반영한다. 구형 앱의 안내/UI 갱신, 이메일 공급자와 코드 수명·시도 정책, 비식별 원장 보존 기간, 비로그인 웹 흐름을 다음 단계에서 확정한다. 진행 중 삭제의 접근 차단을 해제하는 롤백은 하지 않는다.
