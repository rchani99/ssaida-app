# DEV-02 / Firebase 소스 통합 검증 — 2026-10-23

## 승인 및 범위

사용자가 DEV-02 → Firebase → master 순서의 검증·병합을 명시 승인했다.
다른 작업 브랜치와 원본의 미커밋·미추적 변경, 배포 태그는 보존한다.
새 빌드·운영 배포·DB/Edge Function 변경·테스터 초대는 이번 실행에 포함하지 않는다.

## 검증한 Git 상태

- Firebase 기준: c86aa0355a93d8a663caec6091d5e67b071eae34.
- DEV-02 기준: 64c82f20c5412a6ab4b3fa46d32dff0b5e89c750.
- master 기준: fee251054946e5a976f60232d2eb1243801a915d.
- 격리 통합 tree: ad6dd718cc9186cecac63513bcfe5631c3de2a30. 충돌 없음.
- [PR #1](https://github.com/rchani99/ssaida-app/pull/1) merge commit: ffdf969cb90a94f0037b97b4c965315a63b800dd.
- 원격 PR #1 병합 tree와 검증 tree의 정확한 일치를 확인했다.
- master 통합의 최종 GitHub 상태와 merge SHA는 [PR #2](https://github.com/rchani99/ssaida-app/pull/2)를 따른다.
  이 기록은 해당 PR 병합 전 검증 기록이며 이후 추가된 문서는 실행 코드 검증 결과를 바꾸지 않는다.

## 이번 실행 결과

| 검사 | 결과 |
| --- | --- |
| TypeScript tsc --noEmit | PASS / exit 0 |
| 변경 JS/TS/TSX 파일 ESLint --max-warnings 0 | PASS / exit 0 |
| node scripts/run-regressions.mjs | 48 PASS / 0 FAIL / DB 전용 9 SKIP |
| 독립 검수자의 auth-session / profile-entry / onboarding / step6-notification 회귀 | 4개 모두 PASS / exit 0 |
| 소스 독립 검수 | 필수 병합 차단 지적 없음 |
| git diff --check | PASS |

검수 담당: review_commit_groups. 인증 요청 revision·로그아웃 후 stale 응답 차단,
프로필 실패 읽기 재시도, 초기 설정 중복 저장 잠금, 부모 알림 PIN 경계 및 beta 환경을 검토했다.
검증은 별도 worktree와 기존 설치 의존성을 사용했으며 새 의존성 설치는 하지 않았다.

## 변경과 검증 한계

이번 통합은 Firebase beta 도구와 로그아웃/알림 수정, DEV-02 프로필·온보딩 수정 및 관련 문서를 포함한다.
master 대비 DB 정의·RPC/API 계약·package.json/pnpm-lock.yaml 변경은 없다.
계정 삭제 v1과 후속 아이 홈 로딩 브랜치의 변경은 포함하지 않는다.

혼합 테스트의 DB 부분도 --ui-only로 제외했다. 실제 Google OAuth, RPC/RLS, 신규 계정 초기 설정,
실제 통신 실패 복구, 네이티브 알림·정상 PIN 목적지, 체험단별 설치는 이번 실행에서 검증하지 않았다.
과거 APK5 검증·배포 기록을 이번 테스트로 재확인한 것으로 표현하지 않는다.
DEV-01/02는 REVIEW를 유지하며 남은 승인된 기기·체험단 검증이 다음 과제다.

배포 태그 android-beta-v1.0.0-5는 a45721a51e56ab04fbd1fa951af6b6b958558a98에 고정한다.
Git 병합은 새 APK 배포가 아니다. 원본 작업 폴더의 로컬 실행 상태·로그·화면·이미지와 미커밋 문서는 보존한다.
