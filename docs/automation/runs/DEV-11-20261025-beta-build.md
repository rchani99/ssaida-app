# DEV-11-FORM 새 APK 빌드·검증

- 상태: **REVIEW**. APK6 생성·정적/독립 검수·기기 업데이트·폼 정상 저장/취소/재열기 PASS. 실제 통신 실패 재현은 미완료이며 체험단 배포는 별도 승인 대기다.
- 승인: 2026-10-25 사용자가 문제집 등록·수정 개선 포함 새 APK 및 필요한 EAS 원격 빌드를 승인했다. 별도 테스트 계정의 새 검증용 문제집 생성·수정과 후속 일시적 프록시 변경/즉시 복구도 직접 승인했다. Firebase 업로드·체험단 배포는 검증 보고 후 별도 승인이다.
- 조정자: 현재 개발 채팅 `/root`. 독립 검수: `/root/workbook_apk_review`, 재위임 없음.
- 소스: `codex/workbook-form-actions`, `5d1a42f6b20deaf7c92c9772fbfe9dd0594026d4` (코드 `f85a4ab`). [Draft PR #4](https://github.com/rchani99/ssaida-app/pull/4).
- 격리 경로: `C:/Users/rchani/.codex/worktrees/workbook-form-actions/ssaida-app`. 빌드 전 clean 확인. 이 빌드 기록의 후속 문서 커밋은 APK 소스 SHA에 포함되지 않는다.
- 근거 파일: 원본 저장소 `outputs/dev11-build-20261025/` (Git 제외). 기기 화면·로그·APK·환경 파일은 공개하지 않는다.

## 빌드와 소스 확인

- 기존 EAS CLI 25.0.0 재사용. 공개 production 설정 4개 원격/로컬 일치, 값 미출력. 기존 versionCode 5 및 최근 빌드 완료 상태 확인 후 새 요청은 1회만 실행했다.
- `build-beta.mjs check`, `inspect` exit 0. 독립 검수: 아카이브 소스 566개 원본 SHA256 일치. 제외된 tracked 9개는 marketing 문서. 실제 env·서명·outputs·native·node_modules 파일 미포함. shallow Git 메타데이터와 빈 outputs 디렉터리는 구분했다.
- 기존 beta/production 프로필, 서명 자격정보, 패키지·OAuth·Supabase 연결 유지. EAS에서 versionCode 5→6 자동 증가.
- [EAS 빌드](https://expo.dev/accounts/ssahidas-team/projects/ssahida-app/builds/534629e9-23dd-4672-9550-c374b588ce6b): Android / beta / INTERNAL / SDK 57 / **1.0.0 (6)**, 소스 SHA 일치. 2026-10-25 21:12:51 KST FINISHED.
- APK: `ssaida-1.0.0-6.apk`, **119,709,108 bytes**.
- APK SHA-256: `588b5144a6d0ffbdc9c65337c357518ea159e0d1217d5265ce7a48230045bdad`.
- 인증서 SHA-256: `b4d9df4b3a54e5703f8309d96022199d9d3226d578b42606e73f86a86034d590`.

## APK 정적·독립 검수

`scripts/verify-beta-apk.py` exit 0. 스크립트의 최솟값 확인 외에도 EAS 소스·정확한 versionName 1.0.0·versionCode 6을 별도로 대조했다.

별도 검수자가 verifier를 재실행하고 실제 기존 APK5와 비교했다. 패키지 `com.ssaida.app`, 서명, 권한 28개, https/ssaida scheme, target SDK 36, production 환경 모두 동일하다. 내장 bundle은 변경됐으며 검수한 소스 아카이브와 EAS SHA 연결로 변경 포함을 확인했다. ZIP 무결성·release·내장 bundle·production endpoint·DEV endpoint 부재·지정 비밀패턴 검사 PASS. 이는 모든 비밀값의 보편적 부재나 실제 API 성공 증명이 아니다.

근거: `preflight.json`, `archive-verification.json`, `build-status.json`, `apk-verification-6.json`, `independent-apk-verification.json`, `independent-apk-comparison.json`.

## 실기기 결과

SM-S916N / Android 16에서 기존 APK5 위에 `adb install -r` Success. 무선 연결은 빌드 대기 중 끊겨 mDNS에 확인된 같은 기기로 재연결했다. 설치 package 버전 6, base.apk SHA-256이 검증 APK와 일치한다. 앱 삭제·데이터 초기화·서버 계정 삭제 없음. 사용자가 별도 테스트 계정 로그인과 PIN을 직접 입력했으며 PIN 값을 읽거나 저장하지 않았다.

| 검증 | 결과와 증거 |
| --- | --- |
| 업데이트 후 세션·표시 | PASS: 테스트 아이 홈, 목표 30분·0포인트·오늘 0개 유지. `device-before-child-home.png`, `device-parent-after-pin.png` (파일명과 달리 아이 홈) |
| 부모 진입 | PASS: 첫 완료 응답 때는 아이 홈이어서 성공으로 세지 않았고, PIN 창을 다시 열어 두 번째 응답 뒤 부모 대시보드 확인. `device-parent-confirmed.png` |
| 등록 버튼 | PASS: 상단 등록 닫기 없음, 하단 등록/취소 같은 행·잘림 없음. `form-create-open.png`, `form-create-actions.png` |
| 등록 취소·재열기 | PASS: 임시 이름 입력 후 취소하면 폼 닫힘·빈 목록, 재열기 기본값. `form-create-cancelled.png`, `form-create-reopened.xml` |
| 실제 등록 | PASS: 검증용 FormTest-1025 1개 표시·폼 닫힘. 월요일/20분/1쪽 시작/한 번에 5쪽/100쪽, 오늘 적용 꺼짐. `form-create-input.xml`, `form-create-ready.xml`, `form-create-saved.png` |
| 수정 취소·재열기 | PASS: -Cancel 임시 변경을 취소하면 원래 이름 유지·폼 닫힘·재열기 기존값. `form-edit-input.xml`, `form-edit-cancelled.png`, `form-edit-reopened.xml` |
| 수정 저장·재열기 | PASS: -Saved 이름으로 실제 저장 후 폼 닫힘·재열기 저장값. 저장/취소 같은 행·잘림 없음. `form-edit-ready.png`, `form-edit-saved.png`, `form-edit-saved-reopen.xml` |
| 최종 목록 | PASS: 테스트 항목은 최종 FormTest-1025-Saved-Retry 이름으로 1개 남아 있다. 기존 항목 삭제/수정이나 완료/포인트 지급은 실행하지 않았다. `form-final-list.png` |
| 완전 종료 후 실행 | PASS: COLD / Status ok / 838ms, 재로그인 없이 테스트 아이 홈과 동일 표시. `device-cold-restart.png` |

정상/취소/재열기 화면은 별도 담당이 PNG와 XML을 직접 확인해 PASS로 검수했다. 실제 앱 저장/목록 표시의 관찰이며 서버 DB 행을 직접 조회한 검증이나 모든 기기·간헐 증상의 재현 보장은 아니다. 검증용 항목은 테스트 계정에 유지한다.

## 실패 재현 시도와 남은 한계

- 처음 전역 프록시 변경은 자동 승인 검토가 다른 앱 통신 영향과 구체적 승인 부재를 이유로 거부했고 실행하지 않았다. 사용자의 별도 일시 차단·즉시 복구 승인을 받은 후 1회 시도했다.
- 임시 로컬 프록시 설정 중에도 수정 요청이 성공하여 이름이 -Retry로 저장되고 폼이 닫혔다. 통신 실패가 재현되지 않았으므로 **실제 실패 시 입력 보존/복구 PASS가 아니다**. 발생 원인을 연결 재사용 등으로 단정하지 않는다.
- `form-edit-network-failure.*`, `form-edit-failure-input.*`은 계획상 파일명일 뿐 실제 내용은 정상 저장 목록이다. 실패 근거로 사용하지 않는다.
- finally에서 프록시를 명시 해제하고 관련 5개 키 모두 원래 null로 복구했다. `network-before.json`, `network-after-edit.json`. 후속 목록 조회·아이 홈 복귀·재시작 정상.
- APK5 로그인 전환 후 남아 있던 브라우저 localhost 연결 오류 화면을 닫고 앱을 전면에 두자 테스트 홈이 확인됐다. 오류의 발생 원인은 미확정이며 자동 OAuth 복귀 전체 PASS로 기록하지 않는다.
- 이전 구현 단계의 격리 회귀/타입/린트 PASS는 [구현 기록](DEV-11-20261025-workbook-form.md)에 있다. 이번에 불필요한 전체 회귀를 반복하지 않았으며 로컬 실패 처리 테스트를 실제 통신 실패 검증으로 대체하지 않는다. 실기기 연속 탭·활동 공유 폼 전체 회귀도 이번 범위에는 없다.

## 배포 준비와 다음 단계

`distribute-beta.ps1 -Distribute -DryRun` exit 0: APK6·릴리스 노트(`release-notes-6.txt`)·기존 ssaida-beta 그룹 입력만 점검했다. 실제 Firebase 업로드·배포·초대·외부 메일 없음. 운영 DB migration/함수·API 계약·인증 정책 변경 없음. 테스트 계정 항목 작성은 위 사용자 승인 범위에서만 수행했다.

관련 검증 문서만 별도 커밋해 기존 Draft PR #4에 반영한다. master 병합·배포 태그 생성·실제 배포는 수행하지 않는다. DEV-11 전체 계획 알고리즘 개선이나 다른 피드백 착수로 확대하지 않는다.

남은 조건: 실제 통신 실패를 재현할 수 있는 격리/기기 검증 조건 확보, 이번 관찰 한계 검토, 사용자 배포 승인. DEV-11-FORM 및 전체 DEV-11은 REVIEW를 유지한다. 사용자가 결과와 한계를 확인한 후 체험단 업데이트를 승인하면, 정확한 APK6 해시·현재 대상 그룹을 다시 확인하고 배포한다.
