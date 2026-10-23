# DEV-01 Firebase 배포 준비 결과

검증일: 2026-10-22 한국시간. 대상: 기존 `1.0.0 (4)` Release APK.
후속 사용자 확인: **1.0.0 (4)를 체험단에 이미 배포했다.** 아래 그룹 0명·배포 준비 기록은 이전 시점의 이력이다.
현재 수신 인원·개별 설치 여부를 이번에 원격 재확인하지 않았다. 최초 배포를 다시 실행할 필요는 없으며,
이후 개발한 DEV-02 커밋 `a45721a`를 포함하는 업데이트 준비와 남은 검증을 진행한다.
사용자가 기존 Firebase 상태 확인·남은 검증·준비를 승인했다. 실제 업로드·배포·초대는 별도 승인 대상이다.
현재 상태: **REVIEW — 실기기 부분 검증 완료, 잘못된 PIN 차단 정상·알림 정상 PIN 목적지 이동 미확인**. DEV-01 전체 DONE은 아니다.
최신 결과는 [무선 실기기 실행 기록](automation/runs/DEV-01-20261022-wireless-device.md)을 우선한다. 아래 초기 사전 확인과 미실행 표는 해당 시점의 이력이다.

## 초기 사전 확인 상태 — 무선 연결 전

| 항목 | 결과 | 증거 / 한계 |
| --- | --- | --- |
| Firebase 앱 | `ssaida-732f2`, App ID `1:709799668495:android:dca06f464aa568cd826c7a`, 패키지 `com.ssaida.app`, ACTIVE | Firebase CLI 15.26.0 `apps:list ANDROID` 읽기 성공 |
| 기존 릴리스 | `190aubvqpqfv0`, 버전 `1.0.0 (4)`, 현재 최신 릴리스와 일치 | 12:41 KST REST GET 및 최신 릴리스 조회. 생성 시각 2026-10-19 15:12:25 KST |
| 원격 APK와 로컬 APK | SHA-256·크기 일치 | 원격 바이너리를 메모리로 스트리밍해 해시 계산. 서명 다운로드 URL은 저장/출력하지 않음 |
| 릴리스 노트 | 기존 `outputs/beta/release-notes-4.txt`와 일치 | 읽기 비교만 수행. 노트 변경 없음 |
| 그룹 | `ssaida-beta` 존재, 해당 그룹의 테스터 조회 결과 **0명** | 그룹 목록의 누락 count를 0으로 추측하지 않고 `listTesters(project, group)` 전체 페이지 결과를 확인 |
| 개별 릴리스 수신/설치 | 미확인 | 그룹 0명은 프로젝트 전체 테스터 0명이나 개인의 릴리스 접근권한 없음의 증거가 아님 |
| Android 기기 | `adb devices -l` 연결 목록 비어 있음 | 실제 설치·PIN·로그인·데이터 보존 확인 미실행 |

원격 재확인 결과: `outputs/dev01-20261022/firebase-readonly.json`.
App Distribution 리소스 조회에는 Firebase CLI의 기존 인증을 사용한 GET만 수행했다.
인증 토큰 갱신은 별도이며 앱·그룹·릴리스·테스터 리소스 변경은 수행하지 않았다.
자격증명·테스터 이메일·서명 URL을 결과에 기록하지 않았다.

## 고정된 배포 후보

- 프로젝트 / 앱: `ssaida-732f2` / `1:709799668495:android:dca06f464aa568cd826c7a`.
- 릴리스: `projects/709799668495/apps/1:709799668495:android:dca06f464aa568cd826c7a/releases/190aubvqpqfv0`.
- 패키지 / 버전: `com.ssaida.app` / `1.0.0 (4)`.
- 로컬 파일: `outputs/beta/ssaida-1.0.0-4.apk`, 119,707,284 bytes.
- SHA-256: `2ad5b01a6659217d3abe9e64c5cb678aca8f574379ad81d4998750b9319175e7`.
- 서명 SHA-256: `b4d9df4b3a54e5703f8309d96022199d9d3226d578b42606e73f86a86034d590`.
- [Firebase 릴리스 콘솔](https://console.firebase.google.com/project/ssaida-732f2/appdistribution/app/android:com.ssaida.app/releases/190aubvqpqfv0).
- [기존 접근 권한이 있는 테스터용 링크](https://appdistribution.firebase.google.com/testerapps/1:709799668495:android:dca06f464aa568cd826c7a/releases/190aubvqpqfv0).
  이 링크를 여는 것만으로 새 접근권한을 부여하거나 초대하지 않는다.

최초 사전 확인 시에는 이 릴리스를 재사용하는 계획이었다. 이후 DEV-02 수정이 완료되어
수정 반영에는 새 APK가 필요하다. 새 빌드·업데이트 배포의 검증·승인 범위는 별도로 준비한다.

## 로컬 검증 결과

| 검증 | 결과 | 담당 / 한계 |
| --- | --- | --- |
| 기존 verifier로 APK (3)/(4) 검사 | PASS | `dev01_apk`. ZIP·번들·운영 환경·패키지·버전·릴리스 모드·서명·지정 비밀값 패턴 |
| (3)→(4) 비교 | PASS | 동일 패키지·서명, versionCode 증가. 실제 업데이트/데이터 보존은 미검증 |
| 환경 회귀 | PASS, exit 0 | 현재 소스 `node scripts/environment-regression.mjs` |
| 알림 회귀 | PASS, exit 0 | 현재 소스 `node scripts/step6-notification-regression.mjs` |
| 생명주기 회귀 | PASS, exit 0 | 현재 소스 `node scripts/step6-lifecycle-regression.mjs` |
| 업로드 전용·그룹 배포 DryRun | PASS | `dev01_prepare`. 실제 APK/기존 노트, 존재하지 않는 CLI 경로로 미호출 확인 |
| 잘못된 App/프로젝트 ID 거부 | PASS | 로컬 구문 검증. 권한·대상 일치 보증은 원격 읽기 결과와 별도 |
| 빌드 환경 fixture | 정상 1건·거부 5건 PASS | 실제 재빌드 설정 검증은 아님. `.env.beta.local` 없음 |

APK 정적 검증은 실기기 동작이나 전체 보안 감사를 대체하지 않는다. 현재 소스 테스트는 APK를
실행하지 않으며 소스와 바이너리의 완전한 일치를 보증하지 않는다. 기존 APK의 저장소/오버레이
권한 목록도 그대로 기록했으며 이번에 권한 정책을 변경하지 않았다.

상세 로그: `outputs/dev01-20261022/apk-local-verification.md`, `apk-verification-3.json`,
`apk-verification-4.json`, `apk-comparison.json`, `apk-*-regression.log`,
`prep-dry-run.json`, `prep-env-checks.json`, `prep-review.md`.
이 outputs 폴더는 Git 제외이며 공유 체크아웃에 자동 포함되지 않는다. 핵심 결과는 이 문서에 보존한다.

## 초기 실기기 검증표 — 후속 결과는 최신 실행 기록 참조

Android 기기 연결 및 해당 기기의 검증용 계정/데이터 범위를 정한 후 진행한다. 기존 앱을 삭제하거나
실사용자 데이터를 초기화하지 않는다. 운영 데이터에 쓰기가 필요한 학습 흐름은 지정된 검증 대상만 사용한다.

| 확인 | 기대 결과 | 상태 |
| --- | --- | --- |
| 설치 버전/업데이트 | 패키지·서명 일치, (4)로 업데이트, 기존 데이터 보존 | 미실행 |
| Metro 없이 실행·재시작 | 독립 실행·기존 세션/데이터 유지 | 미실행 |
| Google 로그인·취소·재시도 | 올바른 계정과 앱 callback 복귀 | 미실행 |
| 부모/아이 모드에서 부모 알림 진입 | 아이 모드로 잠근 뒤 PIN 요구 | 미실행 |
| 틀린 PIN·취소 | 부모 화면 접근 차단, 취소 시 아이 화면 유지 | 미실행 |
| 정상 PIN·앱 종료 후 알림 | 인증 후 부모 확인 이동, 종료 상태에서도 동일 경계 | 미실행 |
| 알림 권한 거부·반복 탭 | 안전한 처리, 중복 우회 없음 | 미실행 |
| 지정 검증 데이터의 계획→공부 완료→부모 확인 | 저장·표시 일치, 중복 완료/보상 없음 | 미실행 |

각 결과에는 기기/Android 버전, APK 버전, 검증 시각, 기대/실제 결과, 비식별 증거를 남긴다.
PIN·로그인 토큰·자녀 개인정보는 기록하지 않는다. APK (3)의 과거 결과를 (4)의 PASS로 복사하지 않는다.

## 승인 단계별 준비안

### 1. 개인 실기기 검증

초기에는 연결할 Android 기기와 검증 계정/데이터 범위가 필요했다. 후속 무선 연결과 지정 항목 검증은 최신 실행 기록에 반영했다. 이미 위 릴리스 접근권한이
있다면 기존 링크를 사용한다. 접근권한이 없다면 **사용자가 지정한 정확한 개인 테스터 이메일**에
기존 릴리스 (4)의 접근권한을 부여하는 안을 준비한다. Firebase 알림/초대 메일이 발생할 수 있음을
포함해 승인받는다. 아직 수신자가 지정되지 않았으므로 지금은 접근권한 부여·초대를 실행하지 않는다.

### 2. 체험단 배포

조건: 위 동일 APK 실기기 검증 통과, 확정된 대상 목록·동의·그룹 구성원 확인, 사용자 실행 승인.
현재 `ssaida-beta`는 0명이므로 **대상자 목록 없이 그룹 배포부터 실행하지 않는다.**
사용자가 제공한 대상에 한해 그룹 등록/초대와 기존 릴리스 배포를 구체적으로 구분해 승인받는다.
그룹 구성원이 바뀌면 실행 전에 목록을 다시 확인한다. 개별 수락/다운로드/설치 확인이 남으면 DEV-01 DONE 금지.

### 실행 방법의 경계

기존 `scripts/distribute-beta.ps1`은 `-DryRun`이 없으면 업로드한다. `-Distribute`는 그룹 배포도 추가한다.
이 스크립트를 기존 릴리스 상태 조회나 접근권한 확인 용도로 실행하지 않는다. 기존 릴리스만 배포할 때는
[공식 releases.distribute API](https://firebase.google.com/docs/reference/app-distribution/rest/v1/projects.apps.releases/distribute)를
통한 기존 릴리스 배포를 승인된 대상에 한해 사용한다. 이 문서는 해당 POST의 실행 승인이 아니다.

## 재개와 완료

DEV-01만 진행한다. 연결 기기·필수 계정/대상 정보 또는 실행 승인이 없으면 `BLOCKED`로 남기고
다른 기능을 자동 개발하지 않는다. 독립 검수 결과와 재개 조건은
[실행 기록](automation/runs/DEV-01-20261022-firebase-preflight.md)에 남긴다.
운영 DB/Edge Function·계정 삭제·실결제·Firebase 설정·업로드/배포/초대·실메일·Git push는 이번에 수행하지 않았다.

공식 확인 근거: [Expo v57](https://docs.expo.dev/versions/v57.0.0/),
[Firebase CLI 배포](https://firebase.google.com/docs/app-distribution/android/distribute-cli),
[릴리스 읽기 API](https://firebase.google.com/docs/reference/app-distribution/rest/v1/projects.apps.releases/get).

## 무선 연결 후속 확인 — 2026-10-22

사용자는 USB 대신 무선 디버깅과 검증용 계정 사용을 지정했다. 계정 주소는 대화에서만 참조하며 저장소에 복사하지 않는다.
후속 `adb devices -l` 및 `adb mdns services` 조회는 성공했으나 연결/검색 결과가 모두 비어 있다.
다음 입력은 기기의 무선 디버깅 IP:연결 포트이며, 최초 페어링이 필요하면 페어링 IP:포트와 일회성 코드다.
페어링 정보는 영구 문서에 기록하지 않는다. 학습 데이터 변경 범위는 아직 미정이며, 계정 지정은 Firebase 초대/배포 승인이 아니다.
기존 앱/데이터를 보존하며 연결 후 설치 버전과 실행 상태 확인부터 재개한다.

## 실기기 연결·부분 검증 — 2026-10-22 후속

앞의 기기 0대/무선 검색 실패는 이전 시점의 이력이다. 현재는 무선 ADB 페어링과 연결에 성공했다.
- 기기: SM-S916N, Android 16. 설치 앱 com.ssaida.app, 1.0.0 (4).
- 설치 APK의 SHA-256이 위 로컬/Firebase 릴리스와 일치한다. 재설치/업데이트/데이터 초기화 없음.
- `am start -W` 결과 COLD, Status ok, TotalTime 2535ms. 실제 아이 홈 표시 확인.
- 일반 부모님 모드 버튼의 PIN 요구 및 취소 후 아이 홈 유지 확인. 알림을 통한 진입 검증과는 별개다.
- 로그인된 계정 신원·정상/잘못된 PIN·OAuth 재로그인·업데이트 데이터 보존·실제 알림·학습 데이터 변경은 아직 미검증.
- 사용자에게 PIN은 휴대폰에서 직접 입력하도록 요청했다. PIN·페어링 코드·계정 주소는 문서에 저장하지 않는다.
- 비식별 결과: `outputs/dev01-20261022/device-evidence.json`. 화면 증거는 같은 Git 제외 폴더에만 보관한다.
- 이 절은 첫 부분 검증 이력이며 후속 결과가 아래에 이어진다. 이전 사전 검수 PASS를 새 실기기 전체 검증 PASS로 전이하지 않는다.

## 실기기 후속 최종 판정 — REVIEW

[무선 실기기 실행 기록](automation/runs/DEV-01-20261022-wireless-device.md)에 최신 결과를 통합했다.
일반 부모 PIN의 오류/성공/취소, 사용자 지정 항목의 아이 완료→부모 확인, 포인트 2→3 및 재시작 후 3 유지,
실제 완료 알림 도착과 부모 모드에서 탭 시 PIN 요구를 확인했다. 알림 설정은 초기 OFF/하위OFF/시간공란으로 복구했다.
사용자가 아이 홈에 머문 것은 일부러 틀린 PIN을 넣었을 때라고 정정했다. 이는 정상 차단(PASS)이며 정상 PIN 이동 실패로 기록한 해석은 철회한다.
알림 정상 PIN 후 목적지 이동은 별도 미확인이다. OAuth·업데이트 보존·종료 상태 알림 등도 남아 배포 준비 완료가 아니다.
검증용 단일 항목의 완료/부모 확인과 포인트가 실제 저장됐다. 스키마/함수 변경이나 다른 항목의 확인은 하지 않았다.
