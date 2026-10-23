# DEV-01 — 기존 Firebase 릴리스 검증·배포 준비

실행 ID: `20261022-firebase-preflight`. 신규 제품 백로그 DEV-01이며 LEGACY-AUTO-01과 다르다.
2026-10-22 사용자 직접 요청: 기존 Firebase 배포 상태 확인·남은 검증/준비에 착수,
실제 배포·초대 등은 준비 후 별도 승인. 현재 상태는 BLOCKED(실기기·대상 정보 및 실행 승인 대기)다.

## 소유권과 범위

- 조정자: 이 채팅 `01a1617e-61ae-7913-83d7-87b6a7552a02`, `/root`.
- 기존 예약 채팅 `01a12eee-6360-7fe1-aa67-3f816397f27d`의 idle과 공용 activeTask null을 확인하고 인계.
- 기준 SHA `d5de87315adaff783bee21a8d504424e52f097ac`, 원본 경로 `C:/Users/rchani/workspace/ssaida-app`.
- 제품 소스 구현 변경이 필요하지 않아 새 worktree를 만들지 않았다. 신규 outputs 산출물만 담당별 분리하고 조정자만 공용 문서를 갱신했다.
- 기존 큐 전체를 `docs/automation/legacy-state-20261022.json`에 보존하고 schemaVersion 2의 제품 DEV-01 큐로 이관했다. 과거 결과/패치/worktree 보존.
- 역할: `dev01_apk` APK/로컬 회귀 검증, `dev01_prepare` DryRun·준비 검증, `dev01_review` 독립 검수. 동시 보조 최대 2명, 하위 위임 없음.

## 실행 결과와 증거

상세 대상·검증·기기 확인표·승인안은 [DEV-01 준비 결과](../../dev-01-release-readiness.md)를 따른다.

- APK (3)/(4) 정적 검증·해시·서명·versionCode 비교 PASS.
- 환경/알림/생명주기 로컬 회귀 3개 PASS. 앱 바이너리 동작 테스트는 아님.
- 업로드/그룹 DryRun 및 잘못된 ID 거부 PASS, 빌드 환경 fixture 정상/거부 검사 PASS.
- Firebase 앱 ACTIVE 및 기존 App ID/패키지 일치 확인. 기존 릴리스 (4)가 최신이며 노트 일치.
- 원격 APK 스트리밍 SHA-256·크기가 로컬 APK와 일치. 재빌드/재업로드 필요 근거 없음.
- 그룹 `ssaida-beta` 존재, 그룹 테스터 조회 0명. 개인 릴리스 수락/설치는 미확인.
- Android 연결 기기 0대. 실기기 설치·업데이트·OAuth·PIN·공부 흐름은 미실행.

### 실제 명령/도구

- `python scripts/verify-beta-apk.py ...` — 각 버전별 전체 인수와 exit 0은 `outputs/dev01-20261022/apk-local-verification.md`에 보존.
- `node scripts/environment-regression.mjs`, `node scripts/step6-notification-regression.mjs`, `node scripts/step6-lifecycle-regression.mjs` — 모두 exit 0.
- `scripts/distribute-beta.ps1 ... -DryRun` / `-Distribute -DryRun` — 상세 명령·결과는 `prep-review.md`, `prep-dry-run.json`.
- Firebase CLI 15.26.0 `appdistribution:groups:list --project ssaida-732f2 --json --non-interactive` 및 `apps:list ANDROID` — exit 0.
- `node outputs/dev01-20261022/firebase-readonly.cjs` — GET 릴리스/최신 릴리스/그룹/그룹 테스터 및 바이너리 해시, exit 0. 결과 `firebase-readonly.json`.
- Android SDK `adb.exe devices -l` — exit 0, 연결 목록 비어 있음.

초기 sandbox의 Firebase CLI 업데이트 캐시/ADB daemon 접근은 실패했다. 승인된 읽기 전용 범위의
실행 권한 검사를 거쳐 조회가 성공했다. 권한 설정 자체를 변경하거나 보호를 우회하지 않았다.
Firebase CLI 인증 갱신과 로컬 ADB 서버 시작 외에 운영/기기 데이터 변경을 수행하지 않았다.

## 검수·재개

독립 검수 담당 `dev01_review`가 APK/원격 해시·fixture·회귀 로그·실제 helper/배포 스크립트를
교차 확인했다. 인증 갱신 POST와 App Distribution GET 조회를 구분하도록 보고서 문구 1건을
수정했다. 기능·환경 설정 수정은 없다. 최종 검수 확인은 아래 상태에 기록한다.

최종 검수: **PASS**, `/root/dev01_review`, 필수 지적 0건, 문구 수정 1회 후 재확인.
필수 실기기 증거·대상자·실제 실행 승인이 없으므로 DEV-01 DONE은 아니다.
다음은 Android 기기/검증 범위 확보 → 동일 APK4 실기기 확인 → 정확한 대상의 접근/배포 승인 →
실제 수락·설치 결과 확인이다. 해당 조건 없이 다른 제품 과제를 자동 선택하지 않는다.

## 이번 실행의 변경 파일

- 신규 준비 보고서: `docs/dev-01-release-readiness.md`, 이 실행 기록.
- 상태 이관: `docs/automation/legacy-state-20261022.json`, `docs/automation/state.json`.
- 승인 범위/최신 증거 연결: `AGENTS.md`, `README.md`, `docs/product-decisions.md`,
  `docs/development-backlog.md`, `docs/project-status.md`, `docs/beta-distribution.md`,
  `docs/automation/development-workflow.md`, `docs/marketing/launch-paid-20-daily-plan.md`.
- 로컬 검증 산출물: `outputs/dev01-20261022/`(Git 제외). 읽기 전용 조회 helper와 비식별 결과/로그.
- 앱 기능·DB/API·Firebase 설정·의존성 변경 없음. Git commit/push, 새 업로드·배포·초대 미수행.
  기존 미커밋 문서·이미지·다른 작업 결과를 보존했다.
