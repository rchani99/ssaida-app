# DEV-02 새 beta APK 빌드와 검증

> 후속 사용자 승인으로 2026-10-22 20:40 KST APK5를 기존 체험단 그룹 5명에게 배포했다.
> [배포 실행 결과](DEV-02-20261022-tester-update.md). 아래 배포 승인 대기·미업로드 표기는 이 빌드 검증 실행 종료 시점의 이력이다.

- 상태: REVIEW / 새 APK 생성·정적/독립 검수·기존 계정 업데이트 기본 동작 검증 PASS. 체험단 업데이트 배포 승인 대기, 아래 추가 검증은 미확인.
- 승인: 2026-10-22 사용자가 DEV-02 수정이 포함된 새 APK 빌드·검증을 명시 승인. 체험단 업데이트 배포는 결과 확인 후 별도 승인.
- 기준 커밋: `a45721a51e56ab04fbd1fa951af6b6b958558a98`, `codex/dev02-onboarding`.
- 경로: `C:/Users/rchani/.codex/worktrees/dev02-onboarding/ssaida-app`.
- 기존 소스·설정 변경 없음. AGENTS.md 미커밋 복사본은 보존한다.
- 기존 배포: 사용자 확인에 따라 `1.0.0 (4)` 체험단 배포 완료. 이번 결과는 다음 업데이트 후보이며 Firebase 업로드/배포/초대하지 않는다.
- 조정자: 현재 채팅 `/root`; 이전 예약 조정자 idle, 공용 activeTask null 확인 후 소유권 인계.
- 사전 검사 담당: `/root/dev02_build_preflight`; 빌드 실행 및 1차 APK 검사: `/root`; 결과 독립 검수는 별도 담당.

## 검증 범위

기존 공개 production 설정, EAS beta 프로필·서명·패키지·커밋/버전 확인,
업로드 아카이브의 DEV-02 파일 일치 및 비밀파일 제외, 새 APK 서명·ZIP·production endpoint·DEV/비밀키 패턴 검사를 수행한다.
기존 코드 회귀 결과는 앞선 구현 기록과 구분한다. 착수 시 ADB 연결 기기가 없어 무선 디버깅 연결을 요청했고 이후 복구했다.
실기기 검증이 불가능하거나 사용자 입력이 필요한 항목은 APK 정적 검사 통과로 대신하지 않는다.

## 사전 검사와 빌드 접수

- 기존 EAS CLI 25.0.0 재사용. production 원격 공개 설정 4개와 기존 로컬 설정 모두 일치(값 출력·저장 없음).
- 원격 Android versionCode 4 확인 후 빌드에서 5로 증가. 패키지·OAuth·Supabase 설정 변경 없음.
- 기존 `Build Credentials v-aD_1Ra4t (default)` 선택 확인. 최종 APK 인증서도 별도로 대조한다.
- `build-beta.mjs ... check` PASS, `inspect` PASS. 아카이브의 DEV-02 6파일이 승인 커밋과 일치하고 환경·서명·native·출력 파일 제외. EAS 기본 shallow Git 메타데이터는 구분하여 검사.
- 별도 `/root/dev02_apk_review`의 아카이브 독립 검수 PASS.
- 빌드 ID: `0076ec7b-da23-4b53-8741-56d43224c945`.
- [EAS 빌드](https://expo.dev/accounts/ssahidas-team/projects/ssahida-app/builds/0076ec7b-da23-4b53-8741-56d43224c945).
- EAS 조회: Android / beta / INTERNAL / `1.0.0 (5)` / 커밋 `a45721a51e56ab04fbd1fa951af6b6b958558a98`.
- 근거: `outputs/dev02-build-20261022/preflight.json`, `archive-verification.json`, `build-status.json`, `build.log` (Git 제외).

## 실기기 준비

사용자가 무선 디버깅을 켜 연결을 복구했고 아이 홈을 직접 열었다. 설치 버전 `1.0.0 (4)` 확인.
업데이트 전 화면에는 성장 3/24포인트, 오늘 공부 모두 완료, 오늘 1개·약 20분·목표 50분이 표시된다.
근거 `outputs/dev02-build-20261022/device-before-child-home.png`. 이름·계정 주소·기기 식별자는 보고서에 옮기지 않는다.
새 APK 검증 후 기존 앱을 삭제하거나 데이터를 지우지 않고 업데이트하여 표시 상태와 세션 유지 여부를 비교한다.

## APK 생성 및 독립 정적 검수

- EAS FINISHED: 2026-10-22 20:22:31 KST. `1.0.0 (5)`, beta / INTERNAL / Android / SDK 57.
- APK: `outputs/dev02-build-20261022/ssaida-1.0.0-5.apk`, 119,704,600 bytes.
- SHA-256: `df37fb69e8d6cc5b5e50954e44f65eb0f977b345b7defbac2e427684a423276f`.
- 패키지 `com.ssaida.app`, versionName `1.0.0`, versionCode `5`가 EAS 기록과 정확히 일치.
- 인증서 SHA-256 `b4d9df4b3a54e5703f8309d96022199d9d3226d578b42606e73f86a86034d590` (기존 APK4와 동일).
- `scripts/verify-beta-apk.py` exit 0: release·ZIP·서명·내장 JS·production endpoint 확인, DEV endpoint 및 검사 대상 서버 키 패턴 없음.
- 독립 검수 담당이 검사를 재실행하고 APK4와 비교: 권한 28개, scheme, target SDK 36, 패키지·서명 불변. 필수 정적 지적 없음.
- DEV-02 포함 근거: 사전 확인한 아카이브 6파일과 EAS의 정확한 커밋·빌드 산출물 연결. 일반 번들 문구만으로 포함을 추측하지 않음.
- 결과: `apk-verification-5.json`, `independent-apk-verification.json`, `independent-apk-comparison.json` (같은 outputs 폴더).
- 자격정보 검사는 지정 파일/패턴의 정적 검사이며 보편적인 모든 비밀값 부재나 운영 API 성공의 증명은 아니다.

## 실기기 업데이트 결과

SM-S916N / Android 16에서 기존 APK4 위에 `adb install -r` 업데이트 성공. 앱 삭제·데이터 초기화 없음.
첫 설치 시도는 연결 기기 없음으로 종료됐으며 재연결 후 설치 성공했다. 설치된 base.apk의 SHA-256이
검증한 APK5와 일치한다 (`installed-apk-verification.json`).

| 확인 항목 | 결과 / 근거 |
| --- | --- |
| 실제 설치 버전 | versionCode 5 / versionName 1.0.0, 검증 파일과 설치 해시 일치 |
| 기존 세션 진입 | 재로그인·신규 초기 설정 없이 아이 홈 표시 |
| 업데이트 전후 표시 | 성장 3/24포인트, 오늘 공부 완료, 1개·약 20분·목표 50분 동일 |
| 완전 종료 후 재실행 | COLD / Status ok / TotalTime 625ms, 같은 아이 홈과 표시 유지 |
| 일반 부모 모드 | PIN 입력창 표시. 사용자가 기기에서 정상 PIN 입력 후 부모 대시보드 진입 |
| 기존 확인 기록 | 지정한 수학 문제집 12~13쪽 확인 완료 표시. 별도 확인 필요 1개가 남아 있음 |
| 최종 화면 | 아이 홈으로 복귀, 성장 3/24와 완료 표시 유지 |

증거: `device-evidence.json`, `device-before-child-home.png`, `device-after-child-home.png`,
`device-after-restart.png`, `device-pin-gate.png`, `device-parent-after-pin.png`, `device-final-child-home.png`.
독립 검수 담당이 전후·재시작·PIN·부모 대시보드 이미지를 직접 읽어 위 범위 PASS를 확인했다.
PIN은 사용자만 입력했고 저장하지 않았다. 이번에는 학습 완료/부모 확인/초기 설정 저장/삭제를 실행하지 않았다.
화면에 보이는 기록 유지가 모든 DB 행의 불변을 보장하는 것은 아니다.

## 미검증 범위와 다음 승인

- 신규 계정 초기 설정의 실제 기기 연속 탭·저장 실패, 실제 프로필 통신 오류→재시도, 새 Google OAuth는 이번 기기에서 미실행.
  관련 소스의 격리 회귀 PASS는 [구현 기록](DEV-02-20261022-onboarding-hardening.md)에 있으며 실제 서버·기기 검증과 구분한다.
- 이번 APK5의 잘못된 PIN·알림 경로, 전체 Family Link 환경은 미검증. APK4의 결과를 APK5 전체 통과로 전이하지 않는다.
- 위 잔여 조건 때문에 제품 DEV-02는 REVIEW를 유지한다. 이번 빌드/정적 검사/기존 계정 업데이트 검증 범위는 완료했다.
- Firebase 프로젝트 `ssaida-732f2`, 앱 `1:709799668495:android:dca06f464aa568cd826c7a` 대상으로
  `scripts/distribute-beta.ps1 -DryRun`의 APK·릴리스 노트 입력 확인 PASS. 이는 실제 업로드가 아니다.
- 준비한 릴리스 노트: `outputs/dev02-build-20261022/release-notes-5.txt`.
- **Firebase 업로드·그룹 배포·초대·이메일 발송 없음.** 다음에는 사용자 승인 후 실제 기존 체험단 대상을 확인하고 이 검증 APK를 업데이트한다.
  과거 그룹 0명 기록으로 현재 대상 그룹/인원을 추측하지 않는다.
- 기능 코드·DB/API·인증 정책 변경, main/master 병합, 원격 Git push 없음. 원격 EAS 빌드 소스 업로드와 versionCode 증가만 승인 범위에서 수행했다.
