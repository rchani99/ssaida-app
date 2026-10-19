# 계정 삭제 v1 — 작업 보존 및 재개 상태

2026-10-19 기준. GitHub 저장은 구현 상태 보존이며 운영 출시를 뜻하지 않는다. 이번 정리는 문서만 변경한다. 운영 DB·Edge Function·예약을 변경하지 않고, 실제 메일 발송·실제 사용자 삭제·즉시 삭제 구현을 수행하지 않는다.

## 현재 완료한 코드

| 영역                      | 구현 상태                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| 서버 기반 1단계           | Auth와 독립된 삭제 요청 원장, 계정별 활성 요청 중복 방지, 정책 버전 호환                            |
| 상태 및 취소              | `GRACE → PROCESSING → DELETED`, 유예 중 `CANCELLED`; 취소/실행 시작의 원자적 경합 제어              |
| 접근 차단                 | 유예 중 정상 이용, 실행 점유 후 기존 JWT의 보호 대상 RLS·SECURITY DEFINER RPC·데이터 변경 경로 차단 |
| 공통 실행기               | 정리 후 Auth 삭제, 작업 점유·재시도·멱등 처리, 기존 receipt 상태 조회/응답 유실 복구                |
| 이메일 인증 2단계         | 삭제 전용 8자리 코드, HMAC·암호화 발송 봉투, 10분 만료·실패 5회·재발송 간격 60초, 원자적 코드 소비  |
| 인증 권한                 | 5분 삭제 전용 증명, 앱 JWT 대상 일치, 비로그인 웹 확정, 마지막 명시적 동의, 일반 로그인 세션과 분리 |
| Mock 및 회귀              | 발송 인터페이스와 로컬 Mock, 이메일 변경/재사용/동시 요청·PIN·receipt 회귀                          |
| 추가 구현된 Resend 어댑터 | HTTP API·한국어 템플릿·멱등 키·429/5xx/타임아웃·실패/재시도 처리 및 모의 응답 검증                  |

앞선 작업에서 이미 Resend 어댑터가 서버 진입점에 연결되었으므로 이번 보존에는 해당 코드와 의존 마이그레이션/테스트도 포함한다. 실제 키·도메인·worker 설정과 실발송 검증은 완료하지 않았다. 코드에서 공급자 설정이 없으면 발송을 차단한다.

상세 내용은 [1단계 보고서](account-deletion-v1.md)와 [이메일 인증·Resend 보고서](account-deletion-email-v1.md)를 참고한다. 1단계 보고서의 임시 증명 발급 계약은 현재 사용하지 않으며 2단계 코드 검증 계약이 대체한다. PIN 재설정은 기존 72시간 정책을 유지한다.

## 현재 미완료

- **실제 이메일 공급자 운영 연결:** Resend 어댑터는 구현했지만 도메인/DNS 인증, 발신 주소, API 키 권한·할당량, 서버 Secrets, 메일 worker 실행과 실제 수신 검증은 남아 있다.
- **앱 계정 삭제 UI 연결:** 새 이메일 요청→코드 입력→증명→최종 동의 API와 receipt 사전 저장을 기존 UI에 연결하지 않았다.
- **웹 계정 삭제 페이지:** 비로그인 API만 구현했으며 사용자 페이지는 없다.
- **웹 삭제 취소 인증:** 현재 로그인된 사용자의 기존 취소 API는 유지한다. 비로그인 웹 취소를 위한 별도 인증 계약과 UI는 없다. 조회 receipt나 확정 증명을 취소 권한으로 재사용하지 않는다.
- **운영 환경 통합 검증:** hosted gateway/PostgREST, 프록시 IP·요청 제한·CORS, 실제 메일 수신 및 플랫폼 로그 보관 검증이 남아 있다.
- **운영 DB 마이그레이션·Edge Function 배포:** 이번 v1 및 이메일/Resend 마이그레이션과 함수는 운영 미적용이다. 기존 운영 기능/예약이 없다는 뜻은 아니다.
- **운영 정책 확정:** 비식별 완료 원장 보존 기간과 플랫폼 개인정보 로그 보관을 확정해야 한다. Storage는 현재 빈 버킷/객체 전제의 차단 검사이며 파일 삭제 어댑터는 아직 없다.

## 다음 재개 시 정책 변경 예정 — 즉시 삭제

**현재 코드는 최종 동의 후 14일 유예를 유지한다. 즉시 삭제는 아직 구현하지 않았다.** 이번 커밋에서 시간을 0으로 바꾸거나 기존 상태 전이를 수정하지 않는다.

목표 흐름: **이메일 인증 → 최종 삭제 동의 → 삭제 실행 → 삭제 결과 확인**.

재개 시에는 다음 순서로 작업한다.

1. 신규 즉시 삭제 정책 버전과 기존 `legacy-delay-v0`/`email-grace-v1` 요청의 처리 방침을 확정한다. 이미 접수된 유예 요청의 날짜를 일괄 변경하지 않는다.
2. 최종 동의 후 원자적 실행 점유·접근 차단이 이어지도록 DB/API/실행기 계약을 설계한다. 응답 시간 제한과 실패 때문에 실제 완료가 지연될 수 있으므로, 즉시 실행 시작과 삭제 완료를 구분한다.
3. 멱등성, 작업 lease, 부분 실패 복구, receipt 기반 상태 조회를 유지한다. 앱 종료·네트워크 장애·Auth 응답 유실에도 서버가 안전하게 재시도하도록 한다. 진행 중 오류가 발생해도 임의로 접근 차단을 해제하지 않는다.
4. 즉시 삭제의 취소 가능 경계와 기존 유예 요청의 취소 계약을 별도로 정한다. 웹 취소 인증 필요성도 이 결정에 맞춰 검토한다.
5. 정책 전환·구버전 호환·중복 확정·동시 실행·Auth 실패·receipt 복구를 검증한 뒤 앱/웹 UI, 공급자 운영 연결, 배포 전 통합 검증을 진행한다.

## Git 보존 범위

정리 시작점은 `master`의 `fee2510` (`docs: update launch plan and guide video revision`)이며 추적 브랜치는 `origin/master`다. 원격은 `https://github.com/rchani99/ssaida-app.git`이다. 미완성 기능을 기본 브랜치와 분리하기 위해 `feature/account-deletion-v1`에 커밋·일반 push한다. 기본 브랜치에 자동 병합하지 않는다.

아래 23개 파일만 명시적으로 스테이징한다.

```text
docs/account-deletion-v1.md
docs/account-deletion-email-v1.md
docs/account-deletion-status.md
scripts/account-actions-db-regression.mjs
scripts/account-deletion-email-regression.mjs
scripts/account-deletion-executor-regression.mjs
scripts/account-deletion-resend-regression.mjs
scripts/lib/account-deletion-v1-db-cases.mjs
scripts/lib/account-deletion-email-db-cases.mjs
supabase/functions/account-actions/.env.example
supabase/functions/account-actions/core.ts
supabase/functions/account-actions/index.ts
supabase/functions/account-actions/purge.ts
supabase/functions/account-actions/cors.ts
supabase/functions/account-actions/email-crypto.ts
supabase/functions/account-actions/email-mailer.ts
supabase/functions/account-actions/email-provider.ts
supabase/functions/account-actions/email-resend.ts
supabase/functions/account-actions/email.ts
supabase/functions/account-actions/executor.ts
supabase/migrations/202610180002_account_deletion_v1.sql
supabase/migrations/202610190001_account_deletion_email.sql
supabase/migrations/202610190002_account_deletion_resend.sql
```

제외하고 그대로 보존하는 변경:

```text
docs/marketing/README.md
docs/marketing/community-research.md
docs/marketing/content-production.md
docs/marketing/launch-paid-20-daily-plan.md
docs/marketing/measurement.md
docs/marketing/recruitment-copy.md
assets/images/coin-growth-v1/
```

초기 Git 상태에 Firebase 관련 변경 파일은 없었다. `.env`는 ignore 대상이며 `.env.example`만 값 없이 포함한다. `.gitignore`는 변경하지 않는다. 실제 커밋 해시/원격 push 결과는 Git 기록 및 작업 완료 보고에서 확인한다.

## 검증 기록과 이번 정리의 경계

- 직전 구현 시 일반 회귀 스크립트 48개, 별도 임시 Docker DB/Auth의 계정 삭제 회귀, TypeScript·ESLint·Deno 검사가 통과했다. 상세 범위와 제외 항목은 이메일 보고서에 있다.
- 이번 정리는 기능 코드를 바꾸지 않으므로 전체 회귀를 다시 실행하지 않는다. 문서/구현 일치, 문법상 명백한 오류, whitespace, 명시적 파일 목록과 스테이징, 비밀/개인정보 포함 여부를 점검한다.
- 이번 정적 점검에서 대상 23개 파일의 실제 키/JWT/개인 이메일 의심 패턴, 값이 채워진 환경 예시, 서버의 console 로그는 발견하지 않았다. 테스트 JavaScript 구문 및 서버 TypeScript 파싱, `git diff --check`를 통과했다. 문서 외 20개 파일의 해시가 정리 시작 시점과 같아 기능 코드를 변경하지 않았음을 확인했다. 이 점검은 전체 보안 감사를 대체하지 않는다.
- 테스트의 계정/이메일은 격리 DB에서 생성한 UUID와 example 도메인의 fixture이고 자격증명은 테스트 시 생성한다. 모의 코드·증명은 운영 자격증명이 아니다. 실제 사용자 데이터와 운영 비밀값을 저장소에 추가하지 않는다.
- 자체 코드에 원문 이메일/인증 코드/증명을 로그로 남기지 않는 것과 Supabase·Resend의 플랫폼 로그 보관은 별개다. 후자는 운영 검증 항목으로 유지한다.

## 이후 Firebase 배포와 분리

- Firebase 배포 작업은 별도 브랜치/커밋에서 진행한다. 현재 남아 있는 마케팅/이미지 변경을 자동으로 함께 스테이징하거나 되돌리지 않는다. 브랜치 전환 전 미커밋 변경의 보존을 확인한다.
- 이 기능 브랜치 전체를 기본 브랜치에 병합하거나 Supabase를 함께 배포하지 않는다. Firebase 배포가 계정 삭제 DB 마이그레이션·Edge Function·메일 worker를 자동 배포하도록 연결하지 않는다.
- 앱/웹의 현재 UI는 새 삭제 인증 흐름에 연결되지 않았다. Firebase 배포 완료를 계정 삭제 기능 출시 완료로 안내하지 않는다.
- service role, Resend API 키, HMAC/암호화 키, worker 비밀은 Firebase 클라이언트 환경변수·정적 번들에 넣지 않는다. Supabase 서버용 예시 파일을 앱 환경 파일로 복사하지 않는다.
- 향후 Storage 업로드를 추가하면 현재 삭제 실행기의 빈 Storage 전제와 충돌한다. 파일 소유권·삭제·재시도 구현을 별도 검토하기 전 이 검사만 해제하지 않는다.
- 즉시 삭제 정책을 제품 문구에 반영하는 작업은 서버 전환 및 검증 이후에 진행한다. 이번 코드의 14일 유예와 실제 운영 상태를 구분한다.
