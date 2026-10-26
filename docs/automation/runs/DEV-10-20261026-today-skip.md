# DEV-10-SKIP — 오늘 공부 편집의 오늘은 건너뛰기

- 상태: REVIEW (로컬 검증·독립 검수 통과, 실기기 검증은 사용자 요청으로 일괄 진행).
- 승인: 2026-10-26 사용자 직접 요청. 기존 허용 범위·기록·포인트 유지, 구현과 독립 검수, 배포 보류.
- 기준 SHA: 7db3f6aa769c4262f893cfdc65d92dc13c091642. 기존 격리 worktree를 재사용해 codex/today-skip-action 브랜치에서 진행했다.

## 변경

오늘 공부 편집 화면에는 이미 TaskExclusionPanel이 연결돼 있었다. 새 제외 동작을 만들지 않고 editStyle 경로의 ‘오늘만 제외’를 ‘오늘은 건너뛰기’로 변경했다. 확인 문구·취소/건너뛰기 버튼과 성공 안내를 맞추고 등록한 공부·기록·다음 일정은 유지됨을 설명한다. 편집 화면에도 시작 전 자동 공부에만 적용된다는 안내를 추가했다. 기존 일반 패널의 문구는 유지한다.

변경 파일: src/features/learning/components/task-exclusion-panel.tsx, src/features/learning/screens/today-plan-edit-screen.tsx, scripts/sprint2-exclusion-ui-regression.mjs.

기존 AUTO/PLANNED/미시작/진도충돌 없음 조건, 이미 제외된 항목의 표시, 부모 편집 진입 보호, 제외 RPC와 updated_at 충돌·자정·중복 제출·재조회 보호를 유지한다. DB/API/기록·포인트·상태 전이 규칙 변경 없음. ‘건너뛰기’는 기존 오늘 제외 동작의 UI 표현이며 SKIPPED 상태로 전환하는 새 기능이 아니다.

## 검증 범위

관련 로컬 회귀와 타입·파일 린트를 실행하고 구현 담당 today_skip_implementation과 별도 today_skip_review가 실제 diff를 검수한다. 아래 최종 결과로 통과 여부를 기록한다. 단순 문구·안내 변경에 불필요한 전체 회귀는 반복하지 않는다.

실기기·실제 DB/API 검증과 네이티브 글자 확대/줄바꿈 확인은 미실행이다. 다른 변경과 모아서 검증하고 그 전까지 REVIEW를 유지한다. 새 APK/EAS 빌드, Firebase 업로드·배포·초대, master/main 병합 및 자동화 설정 변경은 하지 않는다. 기존 배포 APK에는 이번 변경이 반영되지 않았다.
## 최종 결과

- 소스 커밋: 3b11ef7. 소스 2파일·관련 회귀 1파일.
- 구현 및 독립 검수 PASS. today_skip_review가 최종 diff와 관련 회귀를 직접 확인했으며 필수 지적 없음.
- 다음 실행 모두 종료 코드 0: `node scripts/sprint2-exclusion-ui-regression.mjs`, `node scripts/sprint2-ux-regression.mjs`, `node node_modules/typescript/bin/tsc --noEmit`, 변경 3파일 ESLint 및 Prettier --check, `git diff --check`.
- 편집 경로 editStyle/renderContent의 허용·비허용 항목, 확인·취소·중복 제출·pending·동일 payload·성공 안내를 확인했다. 기존 제외 회귀의 오류·충돌·자정·기록/집계 경계도 통과했다. 로컬 fixture 결과이며 운영 성공 증거가 아니다.
- 상태: REVIEW. 소스 구현·관련 로컬 검증·독립 검수는 완료, 실기기 검증만 다른 변경과 일괄 진행한다. 배포 보류 유지.
