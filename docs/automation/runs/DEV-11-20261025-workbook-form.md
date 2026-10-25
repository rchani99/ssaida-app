# DEV-11-FORM — 문제집 등록·수정 폼

- 상태: REVIEW / 구현·로컬 검증·독립 코드 검수 통과. 새 APK/Android 실기기 확인과 배포는 미실행.
- 승인: 2026-10-25 사용자가 문제집 등록·수정 버튼 정리, 저장·취소 후 폼 닫기 개선의 구현·검증·독립 검수를 직접 요청했다. 체험단 피드백 10·11번만 해당한다.
- 범위: DEV-11 전체가 아닌 관리 UI 세부 범위. 수정의 오늘 적용, 계획/휴식일 정책, 통계, 사진, 별도 알림은 이번 변경에 포함하지 않는다.
- 기준: 원격 master를 fetch하여 `c881e368682989a57a11bc9695505a6e239691b2` 확인. 브랜치 `codex/workbook-form-actions`, 격리 경로 `C:/Users/rchani/.codex/worktrees/workbook-form-actions/ssaida-app`.
- 담당: 조정자 `/root`, 구현 `/root/workbook_form_implementation`, 독립 검수 `/root/workbook_form_review`. 하위 재위임 없음. 공용 상태는 원본 저장소에서만 관리.

## 문제와 변경 기준

등록/수정 성공 콜백에 닫기 코드는 있었지만, 수정 폼의 key가 `updated_at`이었다. 저장 후 재조회로 버전이 바뀌면 폼이 다시 마운트되어 호출별 mutation 성공 콜백이 사라질 수 있다. 생성/수정 hook도 목록 재조회 Promise를 반환해 저장 성공 이후까지 대기할 수 있었다. 이는 코드에서 확인한 경로이며 체험자의 동일 증상을 실기기에서 재현한 결과는 아니다.

- 등록 버튼은 ‘등록’, 수정 버튼은 ‘저장’으로 바꾸고 옆에 ‘취소’를 둔다. 등록 폼이 열려 있을 때 상단 ‘등록 닫기’를 제거한다.
- 성공/취소 시 폼을 닫는다. 등록 폼을 다시 열면 기본 입력으로 시작하고, 저장 실패 시 입력과 오류 안내를 남긴다.
- 수정 시작 시 항목 snapshot과 버전을 유지한다. 재조회로 폼이 교체되거나 최신 버전으로 충돌 검사를 우회하지 않는다.
- 생성/수정 성공 처리는 목록 재조회 완료를 기다리지 않는다. 재조회 실패를 저장 실패로 표시하지 않는다.
- 등록과 수정 모두 연속 제출을 막는다. 저장 요청 중 취소는 비활성화하여 전송된 저장을 취소했다고 오해하거나 성공 응답을 잃지 않도록 한다.
- 공유 폼의 활동(ACTIVITY) 등록과 기존 입력 검증·오늘 적용·문제집 진행 기록 보호를 유지한다.

## 검증과 적용 경계

운영 데이터는 테스트 fixture로 사용하지 않았다. 로컬 mock/UI 테스트는 실제 DB/API·Android 실기기 성공이 아니다.

| 이번 실행 | 결과 |
| --- | --- |
| `node scripts/parent-management-ui-regression.mjs` | PASS: 기존 관리 동작·활동 공유 폼, 성공/취소 닫기·실패 입력 보존·재열기·중복 제출·편집 snapshot |
| `node scripts/study-item-form-mutation-regression.mjs` | PASS: 실제 TanStack Query lifecycle, 생성/수정 × 느림/실패/즉시 재조회 6경우. API는 fixture |
| `node scripts/rest-day-regression.mjs --ui-only` | 독립 검수자 실행 PASS |
| `node scripts/today-plan-edit-gate-regression.mjs --ui-only` | 독립 검수자 실행 PASS |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS / exit 0 |
| `node node_modules/eslint/bin/eslint.js` (변경 TS/TSX·회귀 4파일 명시) | PASS / exit 0 |
| `git diff --check` | PASS; Windows 줄바꿈 경고는 기능 오류와 구분 |

독립 검수 `/root/workbook_form_review`: PASS, 필수 지적 없음. 실제 diff와 위 4개 집중 회귀를 별도로 확인했다. Android 화면 시각 확인·실기기·실제 서버 호출·APK 빌드는 수행하지 않았다. 기존 체험자의 간헐적 증상 재현 완료로 표시하지 않는다.

변경 파일: `src/features/learning/screens/study-management-screen.tsx`, `src/features/learning/hooks/use-learning.ts`, `scripts/parent-management-ui-regression.mjs`, `scripts/study-item-form-mutation-regression.mjs`, 이 기록, `AGENTS.md`, 제품 결정과 개발 백로그. 기존 원본 작업 폴더의 다른 변경은 포함하지 않는다.

환경 기록: 구현 중 `pnpm exec prettier` wrapper가 예상과 달리 `Packages -36` 정리를 출력했다. 원본과 격리의 package.json/lockfile Git 변경은 없고 필수 의존성 로딩과 이후 타입·린트·관련 회귀가 통과했다. 제거 목록은 확인되지 않았다. 임의 복원·재설치는 하지 않았으며 이후 설치된 Node CLI를 직접 사용했다. 출력이 불확실했던 최초 sandbox 검사 세션은 통과로 세지 않고 별도 실행의 exit 0만 사용했다.

DB migration/API 계약·운영 정책 변경 없음. 원격 빌드·APK 업로드·배포·초대·main/master 병합은 실행하지 않는다. 검수 완료 변경의 브랜치 push와 Draft PR은 2026-10-22 지속 승인 범위다. 기존 APK5 배포 태그를 이동하거나 미배포 코드에 새 배포 태그를 붙이지 않는다.

다음 조건: GitHub Draft PR에 검수된 변경을 반영하고, 실제 배포 전 새 APK의 화면·저장 성공/실패·취소·재열기 확인을 수행한다. 원격 빌드/업로드·실제 배포·master 병합은 각 실행의 유효한 승인을 확인한다. DEV-11 전체 계획 개선이나 다른 피드백을 자동 착수하지 않는다.

## 참고한 API 문서

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [React state 보존과 초기화](https://react.dev/learn/preserving-and-resetting-state)
- [TanStack Query v5 mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- [React Native 0.86 Pressable](https://reactnative.dev/docs/0.86/pressable)
