# Ssaida 개발 현황과 증거

> 최신 사용자 확인 (2026-10-22): **1.0.0 (4) 체험단 배포 완료**. 아래 배포 전·그룹 0명 기록은 당시 이력이다.
> DEV-02 수정 `a45721a`는 해당 APK에 미포함. 다음 단계는 업데이트 준비이며 개별 설치·남은 실기기 검증은 별도로 확인한다.
> 후속 빌드: [APK 1.0.0 (5)](automation/runs/DEV-02-20261022-beta-build.md)에 DEV-02 반영. 정적·독립 검수와 지정 기기 업데이트/기존 세션/표시 기록/정상 PIN 확인 PASS. 체험단 업데이트 배포 승인 대기, 신규 계정·통신 실패 등의 기기 검증은 별도다.
> 최신 배포 (2026-10-22 20:40 KST): 사용자 승인 후 [APK5를 기존 체험단 그룹 5명에게 배포](automation/runs/DEV-02-20261022-tester-update.md)했다. Firebase 배포 성공, 개별 수신·설치는 미확인. 위 빌드 시점의 배포 승인 대기는 해소됐다.

> 후속 진행: 2026-10-22 DEV-02 초기 진입 개선 구현·검증·독립 검수 착수 승인.
> [DEV-02 실행 기록](automation/runs/DEV-02-20261022-onboarding-hardening.md)을 따른다. 아래는 문서 구축 시점의 조사이며,
> 최신 재검증 결과는 [DEV-01 준비 결과](dev-01-release-readiness.md)를 따른다. 실제 배포·초대는 별도 승인이다.

2026-10-22 문서 구축을 위한 읽기 전용 분석 결과. 앱 테스트, 원격 콘솔 조회, DB 변경,
실제 이메일 발송, Firebase 설정·배포는 이번 점검에서 수행하지 않았다.

## 저장소와 기존 작업

- 현재 브랜치 `codex/firebase-deployment`, HEAD `d5de87315adaff783bee21a8d504424e52f097ac`.
- 별도 계정 삭제 브랜치 `feature/account-deletion-v1`, HEAD `b5cbbc3`. checkout 없이 `git show`로 읽었다.
- 기존 AGENTS.md, README.md, 마케팅 문서의 미커밋 변경과 `assets/images/coin-growth-v1/`,
  `debug.log`, `docs/automation/`의 미추적 결과가 있었다. 삭제·리셋·일괄 스테이징하지 않는다.
- managed worktree `notification-lifecycle`에 과거 자동화 테스트 결과가 있다.
  `b73c` worktree도 존재하지만 이번 문서 작업에서 그 작업의 소유권·내용을 인수하지 않았다.
- 이번 새 제품 과제 ID와 과거 자동화 ID가 겹친다. [백로그의 역사 매핑](development-backlog.md#과거-자동화-번호와의-구분)을 적용한다.

## Firebase — DEV-01

| 확인 수준 | 확인한 상태 | 근거 |
| --- | --- | --- |
| 현재 코드 읽기 | beta 프로필, 빌드 검증 wrapper, Firebase 업로드 스크립트 존재. 새로 만들기보다 남은 검증을 마무리 | `eas.json`, `scripts/build-beta.mjs`, `scripts/distribute-beta.ps1` |
| 과거 실행 기록 | APK 1.0.0 (4) 빌드/Firebase 업로드 완료. 테스터·그룹 미지정으로 초대/그룹 배포 미실행 | [후속 실기기 검수 및 PIN 수정](beta-distribution.md#후속-실기기-검수-및-pin-수정) |
| 로컬 산출물 확인 | `outputs/beta/ssaida-1.0.0-4.apk` 존재, 119,707,284 bytes. `verification-4.json`의 서명·ZIP true, deviceLoginVerified/deviceSmokeTestVerified false | Git 제외 로컬 산출물. 이번에 APK 검증 자체를 재실행하지 않음 |
| 남은 검증 | APK (4)의 부모/아이 모드 알림 진입 PIN, 틀린 PIN, 취소, 정상 PIN, 앱 종료 후 진입 및 핵심 흐름의 실기기 증거 | 동일 배포 문서. APK (3)의 사용자 확인을 (4)로 전이하지 않음 |
| 외부 현황 | 후속 기록상 프로젝트/앱/그룹 조회와 업로드 이력 있음. 현재 원격 상태·체험단 수신/설치는 직접 재확인하지 않음 | 문서의 최초 실행 기록과 후속 기록을 날짜·버전별로 구분 |

위 표는 문서 구축 시점의 이력이다. 이후 DEV-01 착수 승인을 받아 로컬 검사·소스 회귀·원격 릴리스/해시를
재확인했다. 현재 **REVIEW**: 무선 실기기와 지정 항목 완료/포인트 검증은 진행했고, 잘못된 PIN 차단은 정상으로 정정했으며 알림 정상 PIN 목적지 이동 확인·나머지 기기 검증·배포 승인이 남았다.
최신 증거와 재개 조건은 [DEV-01 준비 결과](dev-01-release-readiness.md)를 따른다.

## 계정 삭제 — DEV-03~06

| 영역 | 현재 구현 / 남은 차이 | 근거 |
| --- | --- | --- |
| 현재 앱 | 14일 대기 문구·기존 취소/receipt UI | `src/features/auth/screens/settings-screen.tsx`, `src/features/auth/components/sensitive-account-panel.tsx` |
| 현재 DB 정의 | 삭제 지연 14일, 내구성 있는 요청/정기 삭제 기반 | `supabase/migrations/202610010001_delayed_account_recovery.sql`, `202610180001_durable_account_deletion.sql` |
| 별도 브랜치 | 독립 원장·작업 lease·멱등 실행·receipt·삭제 전용 이메일 코드/증명·Resend 어댑터 기반 있음 | `feature/account-deletion-v1:supabase/functions/account-actions/` 및 아래 보고서 |
| 즉시 삭제 차이 | 기능 브랜치 `202610190001_account_deletion_email.sql`의 최종 동의 처리도 14일 GRACE 생성. DEV-03은 미완료 | 해당 브랜치 SQL의 `available_at`, `interval '14 days'` |
| 실메일·UI | 공급자 운영 연결·실제 수신, 새 앱 삭제 UI·웹 사용자 페이지·운영 통합 미완료라고 보존 보고서에 명시 | `feature/account-deletion-v1:docs/account-deletion-status.md` |
| 운영 적용 | 기존 14일 운영 배포 기록과 신규 v1 미배포 기록은 별개. 이번 운영 DB 직접 확인 없음 | [기존 운영 배포 기록](production-db-deployment.md), 별도 브랜치 상태 보고서 |

별도 브랜치의 보고서는 현재 체크아웃에 없으므로 아래와 같이 읽는다. 이를 현재 브랜치
파일이나 운영 배포 완료로 오인하지 않는다.

```powershell
git show feature/account-deletion-v1:docs/account-deletion-status.md
git show feature/account-deletion-v1:docs/account-deletion-v1.md
git show feature/account-deletion-v1:docs/account-deletion-email-v1.md
```

기능 브랜치의 로컬 회귀 통과는 과거 보고 기록이다. 이번에는 재실행하지 않았다.
DEV-03~06은 DEV-01 뒤 재개하며, 이메일 인증 기반을 다시 만드는 대신 기존 구현과
즉시 실행 정책의 차이를 설계한다. 기존 요청 전환·보관 기간은 [미결정 사항](product-decisions.md#미결정-사항과-결정-전-경계)을 따른다.

## 기존 기능을 재사용할 영역

| 영역 / 관련 과제 | 이번 읽기에서 확인한 기반 | 완료 판정의 한계 |
| --- | --- | --- |
| 초기 설정 DEV-02 | `onboarding-screen.tsx`, `complete-onboarding.ts`의 자녀·목표시간·부모 PIN 입력 및 RPC | 체험 환경 개선 완료나 모든 Family Link 기기 지원의 증거는 아님 |
| 정책 링크 DEV-07 | `service-info-panel.tsx`에 개인정보처리방침·이용약관 항목이 있으나 “정책 문서 준비 중” 표시 | 실제 공개 페이지 연결/내용 검증 필요 |
| 모니터링 DEV-08 | Auth/알림 오류 처리와 기존 회귀 있음. package.json에서 전용 Sentry/Crashlytics 의존성 확인되지 않음 | 다른 외부 모니터링의 존재까지 부정하지 않으며, 원격 수집 동작 미확인 |
| 대시보드 DEV-10 | `parent-home-screen.tsx`에서 오늘 계획 요약·부모 확인·편집 진입 | 신규 개선 요구사항과 사용자 피드백은 별도 정의 |
| 계획 DEV-11 | `learning-api.ts`, 계획 관련 SQL 및 Sprint 1/2 회귀 파일 | 알고리즘 품질 개선/현재 회귀 통과를 이번에 판정하지 않음 |
| 숙제·미완료 DEV-12/13 | `manual-tasks-panel.tsx`, `unresolved-manual-screen.tsx`에 추가·이월·넘기기 흐름 | 신규 화면 재개발보다 구체적 불편·회귀 공백을 먼저 확인 |
| 성장·도감 DEV-14/23 | `collection-album.tsx`, `collection-panel.tsx`, 성장/테마/도감 유틸·회귀 | 현실 보상 시스템 구현과 다름 |
| 성능 DEV-15 | 기능별 쿼리·회귀 기반 존재 | 현재 성능 측정값·병목을 이번에 측정하지 않음 |
| 피드백 DEV-16 | [파일럿 측정 운영안](marketing/measurement.md), 모집·설문 문서 | 실제 응답·분석 완료 또는 앱 내 피드백 수집 구현의 증거 아님 |
| 다자녀 DEV-18 | 부모당 자녀 UNIQUE, `maybeSingle()` 단일 조회, `on conflict (parent_id)` 온보딩 | DB와 클라이언트 모두 단일 자녀 전제. 운영 DB 직접 조회 아님 |
| 리포트·통계 DEV-21/22 | `records.ts`의 주간 비교·월간 달력/집계, records 화면·회귀 | 별도 주간 리포트 상품이나 신규 통계 요구사항이 완료됐다는 뜻 아님 |
| 신규 P2/P3 | 현실 보상·유료 권한·구독·AI·학원 완성 증거는 이번 소스/의존성/문서 범위에서 확인 못 함 | 미확인을 미구현 확정이나 DONE으로 바꾸지 않음. 승인 후 과제별 상세 분석 |

## 기존 문서 통합 방식

- 제품의 목표 정책은 `product-decisions.md`, 실행 과제는 `development-backlog.md`를 기준으로 한다.
- 배포·삭제·검증 상세 보고서는 복제하지 않고 링크한다. 14일 정책 문서는 기존 구현/운영 이력으로 보존한다.
- 마케팅 계획의 과거 개발 큐와 자동화 `state.json`은 LEGACY-AUTO 기록으로 읽는다.
  이번 문서 작업에서 예약 설정·운영 JSON·기존 실행 산출물을 변경하지 않는다.
- 실행 지침의 자동 공백 탐색·새 기능 추가·마케팅 대체는 승인된 Sprint 범위로 제한한다.
  이번 문서 정비가 끝났다는 이유만으로 다음 기능 구현을 시작하지 않는다.

## 이번 작업의 완료 기준

27개 원본 과제 제목·우선순위 등록, 필수 필드·의존성·승인 경계 명시, 제품 결정과 구현 차이 기록,
과거 번호 충돌·오래된 정책 안내 정리, 링크/상태 정합성 및 별도 문서 검수다.
기능 코드·DB·Firebase·이메일·원격 push는 이 문서 작업의 범위에 포함되지 않는다.
