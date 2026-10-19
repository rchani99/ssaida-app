# 쌓이다 Android 체험단 배포 — Firebase App Distribution

2026-10-19 기준. 작업 브랜치는 `codex/firebase-deployment`이며 `master`의 `fee2510`에서 분리했다. `feature/account-deletion-v1`의 신규 삭제 원장·이메일 인증·Resend 변경은 포함하지 않는다. 마케팅 문서와 무관한 코인 이미지 변경은 Git 커밋과 EAS 업로드에서 제외한다.

## 현재 프로젝트와 빌드 방식

| 항목               | 확인 내용                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| 런타임             | Expo `~57.0.16`, React Native `0.86.2`, TypeScript `~6.0.3`                                                |
| Android 패키지     | `com.ssaida.app` 유지; `app.json`에 선언하고 `app.config.js`가 유지                                        |
| 앱 버전            | `1.0.0`; 로컬 versionCode `1`은 초기값이며 실제 EAS 빌드는 원격 값 사용                                    |
| 기존 EAS 프로필    | `development`: Debug/Metro, `production`: 운영 AAB                                                         |
| 신규 `beta` 프로필 | `production` 상속, `distribution: internal`, `android.buildType: apk`, `developmentClient: false`          |
| 데이터 환경        | 운영 Supabase 전용 설정; DEV URL fallback 금지, DEV 로그인 false                                           |
| 서명               | EAS 원격 `Build Credentials v-aD_1Ra4t (default)` 재사용. 로컬 `android/`의 debug 서명은 업로드 제외       |
| 버전 증가          | 원격 appVersionSource + 상속된 autoIncrement=true. 이번 APK는 `2 → 3` 증가                                 |
| OAuth              | Supabase Google OAuth + 브라우저 PKCE, 앱 callback `ssaida://auth/callback`; Firebase Auth로 교체하지 않음 |

Release APK는 JS 번들을 포함하며 Expo 개발 서버 없이 실행하도록 빌드한다. 로그인·학습 데이터 동기화에는 기존 운영 Supabase 인터넷 연결이 필요하다. Firebase는 APK 배포만 담당한다. App Distribution만 사용할 때는 Firebase 프로젝트/Android 앱 등록으로 시작할 수 있으며 Firebase SDK, Analytics, `google-services.json`을 앱에 추가하지 않았다. [Firebase APK 배포 문서](https://firebase.google.com/docs/app-distribution/android/distribute-cli), [Expo APK 빌드 문서](https://docs.expo.dev/build-reference/apk/)

## 1. 사용자가 진행할 Firebase 설정

현재 CLI 로그인으로 `adu-app-f039d` 프로젝트 하나가 조회되었고 Android 앱 목록은 비어 있었다. 이 프로젝트가 쌓이다용인지 확정하지 않았으며 앱 생성·프로젝트 생성·인증 변경은 수행하지 않았다.

1. Firebase 콘솔에서 쌓이다에 사용할 프로젝트를 선택하거나 생성한다. 기존 프로젝트의 소유·용도가 다르면 임의 재사용하지 않는다.
2. 프로젝트 설정 → 앱 추가 → Android에서 패키지명을 정확히 **`com.ssaida.app`**으로 등록한다. App Distribution만을 위해 기존 Expo/Supabase 인증 설정을 변경하지 않는다.
3. 발급된 Firebase Android **App ID** (`1:<번호>:android:<값>`)와 프로젝트 ID를 보관한다. 패키지명이나 Expo projectId를 App ID 대신 사용하지 않는다.
4. App Distribution에서 해당 Android 앱을 선택하고 시작한다. Testers & Groups에서 그룹을 만들고 **alias `ssaida-beta`**를 확인한다.
5. 배포 담당자 PC에서 Firebase CLI에 로그인한다. 저장된 다른 계정이라면 사용자 본인이 올바른 계정으로 전환하고 프로젝트 권한을 확인한다. 서비스 계정 JSON이나 refresh token을 저장소에 넣지 않는다.

```powershell
npm install -g firebase-tools
firebase login
firebase projects:list
firebase apps:list ANDROID --project <Firebase프로젝트ID>
```

위 프로젝트 생성·앱 등록·로그인은 사용자 계정 설정 단계다. 이 단계가 완료되기 전에는 업로드/초대를 실행하지 않는다. CI, GitHub Actions, 자동 배포는 구성하지 않는다.

## 2. 환경변수

빌드 전용 `.env.beta.local`을 저장소 루트에 만들며 Git/EAS 업로드에서 제외한다. 기존 개발 `.env`를 덮어쓰지 않는다. 기존 EAS production 환경의 정확한 공개 값을 사용한다.

```dotenv
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_PRODUCTION_SUPABASE_URL=https://<운영프로젝트ref>.supabase.co
EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY=<운영publishable또는anon키>
EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF=<운영프로젝트ref>
EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN=false
EXPO_PUBLIC_AUTH_REDIRECT_URI=ssaida://auth/callback
```

위 6개 변수 외 항목이 들어간 빌드 env 파일은 wrapper가 거부한다. 기존 터미널의 EXPO_PUBLIC 변수와 개발 `.env`를 빌드에 섞지 않는다. 운영 URL/ref 일치, DEV 프로젝트·localhost 차단, service-role 키 거부, DEV 로그인 false 검사를 유지한다. EAS production에 등록된 공개 변수도 같은 프로젝트인지 확인해야 한다. 공개 anon/publishable 키가 번들에 포함되는 것은 정상이며 관리자/service-role 키와 구분한다.

Firebase 업로드용 변수는 **빌드 공개 변수와 별개**로 배포 터미널에만 설정한다.

```powershell
$env:FIREBASE_PROJECT_ID = '<선택한Firebase프로젝트ID>'
$env:FIREBASE_APP_ID = '1:<프로젝트번호>:android:<앱ID>'
```

`FIREBASE_APP_ID`는 식별자이고 로그인 토큰이 아니다. `EXPO_PUBLIC_` 접두사를 붙이지 않는다. API 서비스 키·서명 keystore·비밀번호는 APK/Git/릴리스 노트에 넣지 않는다. CLI 진단 로그와 `.firebase/`도 Git/EAS 제외 대상이다.

## 3. APK 생성

Node.js 22.19 이상, pnpm, 기존 Expo 팀 접근과 EAS 로그인 상태를 준비한다. wrapper는 EAS CLI 25.0.0을 사용하며, 이미 설치한 CLI는 선택적으로 `EAS_CLI_PATH`에 해당 `bin/run` 파일 경로를 지정해 재사용할 수 있다.

```powershell
# 값은 출력하지 않고 환경 구성 검사
node scripts/build-beta.mjs .env.beta.local check

# 업로드할 파일을 outputs/beta/archive에 검사 (기존 출력이 있으면 별도 보존 후 실행)
node scripts/build-beta.mjs .env.beta.local inspect

# 관리된 기존 서명키로 beta Release APK 접수, 완료를 기다리지 않고 build URL 반환
node scripts/build-beta.mjs .env.beta.local build
```

실제 빌드 명령은 `eas build --platform android --profile beta --non-interactive --no-wait`다. wrapper를 통해 초기 config 해석에도 운영 환경을 제공한다. 비대화식 빌드는 기존 서명 자격증명이 없으면 중단하며 임의 debug 키로 대체하지 않는다.

반환된 EAS 페이지에서 FINISHED를 확인한 뒤 APK를 `outputs/beta/`에 다운로드한다. 빌드 실패·중단은 원격 versionCode를 소비할 수 있으므로 다음 번호가 연속이라고 가정하지 않는다. `.easignore`는 `.gitignore`의 비밀/native/출력 제외 규칙을 보존하고 마케팅 문서와 미커밋 코인 이미지도 제외한다. 로컬 디렉터리 검사에 빈 폴더가 남더라도 업로드 대상 파일 유무를 기준으로 판정한다.

## 4. APK 정적 검증

Android SDK build-tools와 Java를 준비하고 실제 APK에 대해 실행한다. `--expected-cert-sha256`은 아래 EAS 서명 인증서와 대조하며 임의로 다른 값으로 바꾸어 검사를 통과시키지 않는다.

```powershell
python scripts/verify-beta-apk.py outputs/beta/ssaida-1.0.0-3.apk `
  --build-tools "$env:LOCALAPPDATA/Android/Sdk/build-tools/36.0.0" `
  --production-ref thinmctzgynmtuihirng `
  --expected-cert-sha256 B4:D9:DF:4B:3A:54:E5:70:3F:83:09:D9:60:22:19:9D:9D:32:26:D5:78:B4:26:06:E7:3F:86:A8:60:34:D5:90 `
  --minimum-version-code 3 `
  --report outputs/beta/verification.json
```

검증기는 패키지·버전·debuggable·APK 서명·ZIP 무결성·production Expo 설정·내장 JS·운영 endpoint·DEV Supabase URL 부재와 관리자 키/개인 키 패턴을 검사한다. 공개 인증서 fingerprint는 비밀키가 아니다. 정적 검사만으로 Google 로그인·RLS·알림 성공이나 모든 비밀정보 부재를 완전히 증명하지는 않는다. 라이브러리/방어 코드의 localhost·DEV 식별자 문자열과 실제 선택된 연결 URL은 구분한다.

## 5. 수동 Firebase 업로드

검증한 APK와 UTF-8 릴리스 노트 파일을 준비한다. 릴리스 노트에는 앱 버전·주요 변경·검증 범위·알려진 제약만 적고 이메일/토큰을 넣지 않는다. 예를 들어 `outputs/beta/release-notes.txt`에 저장한다.

```powershell
# 실제 업로드 없이 입력 및 대상 확인
powershell -File scripts/distribute-beta.ps1 `
  -Apk outputs/beta/ssaida-1.0.0-3.apk `
  -ReleaseNotesFile outputs/beta/release-notes.txt -DryRun

# 사용자 Firebase 설정 완료 후: APK 업로드만 실행, 그룹 초대/알림 없음
powershell -File scripts/distribute-beta.ps1 `
  -Apk outputs/beta/ssaida-1.0.0-3.apk `
  -ReleaseNotesFile outputs/beta/release-notes.txt

# 실기기 검수 완료 후: ssaida-beta 그룹으로 수동 배포
powershell -File scripts/distribute-beta.ps1 `
  -Apk outputs/beta/ssaida-1.0.0-3.apk `
  -ReleaseNotesFile outputs/beta/release-notes.txt -Distribute
```

스크립트는 Firebase App ID/프로젝트 ID, APK와 노트 파일을 확인하고 Firebase CLI의 `appdistribution:distribute`를 호출한다. `-Distribute`에서만 `--groups ssaida-beta`를 전달한다. 기본 실행은 업로드만 한다. 설치된 `firebase` 명령을 사용하며 선택적으로 `FIREBASE_CLI_PATH`에 기존 firebase-tools의 `lib/bin/firebase.js` 경로를 지정할 수 있다. 이 경로는 자격증명 파일이 아니다. [Firebase CLI 배포 옵션](https://firebase.google.com/docs/app-distribution/android/distribute-cli)

## 6. 테스터 10명 초대 및 업데이트

Firebase App Distribution → 해당 앱 → Invite links에서 링크를 생성하고 `ssaida-beta` 그룹과 연결한다. 초대 링크는 승인한 체험자에게만 전달하며 필요하면 이메일 제한을 설정한다. Firebase 초대 링크와 Google OAuth 테스트 사용자 허용은 별개다. 10명의 참여 수락·설치 상태를 확인하고 설치 성공을 앱 내부 로그인/사용 성공으로 간주하지 않는다. 이번 작업에서는 링크 생성이나 외부 초대를 수행하지 않았다. [공식 초대 링크 안내](https://firebase.google.com/docs/app-distribution/create-invite-links)

업데이트는 같은 패키지와 서명키로 `beta`를 다시 빌드해 더 큰 원격 versionCode를 받고, 새 APK 검증→릴리스 노트→업로드→실기기 검수→그룹 배포 순서로 진행한다. 사용자 표시 버전을 바꿀 때만 `app.json`의 version을 조정한다. production AAB도 같은 원격 Android 버전 계열을 사용하므로 이미 사용한 versionCode를 재사용하지 않는다.

## 7. 서명키 및 Google 로그인

- EAS 원격 서명키를 유지한다. 이번 빌드가 보고한 credential 구성은 `v-aD_1Ra4t`이고 인증서 SHA-256은 `B4:D9:DF:4B:3A:54:E5:70:3F:83:09:D9:60:22:19:9D:9D:32:26:D5:78:B4:26:06:E7:3F:86:A8:60:34:D5:90`다. 이번 APK의 실제 서명 검증에서 이전 AAB 인증서와 일치했다. APK 인증서 SHA-1은 `0F:50:D5:9E:E4:AE:FC:7D:3A:14:7A:E9:4B:04:53:F8:C4:61:B9:B7`이다.
- EAS credentials 화면에서 권한 있는 담당자가 keystore·alias·비밀번호를 암호화 보관소에 백업하고 복구 담당자를 지정한다. Git이나 앱 assets에 보관하지 않는다. 분실 시 임의 새 키로 교체하면 기존 설치 업데이트가 실패한다. [Expo 자격증명 관리](https://docs.expo.dev/app-signing/app-credentials/)
- **Play의 upload key와 실제 사용자 앱 signing key는 다를 수 있다.** Play App Signing 인증서와 Firebase APK 서명 일치를 별도 확인한다. 같은 패키지에 다른 서명인 앱은 덮어쓰기 설치할 수 없으며 기존 앱 삭제는 로컬 데이터 손실을 일으킬 수 있다. 자동으로 uninstall하지 않는다.
- 현재 로그인은 네이티브 Google Sign-In SDK가 아닌 Supabase 브라우저 PKCE다. Supabase allowlist의 `ssaida://auth/callback`과 Google Web OAuth 클라이언트의 운영 Supabase `/auth/v1/callback`을 확인한다. Google OAuth audience가 테스트 모드이면 체험자 계정을 별도로 허용해야 한다. [Supabase Google 설정](https://supabase.com/docs/guides/auth/social-login/auth-google)
- Firebase/Google 콘솔의 실제 Android 인증서 등록 상태는 확인하지 않았다. Android OAuth 클라이언트를 별도로 사용한다면 `com.ssaida.app`과 실제 beta APK의 SHA-1을 대조하고, Play App Signing 인증서도 구분한다. SHA 등록만으로 현재 브라우저 로그인 흐름 검증이 완료되지는 않는다. 정상 설정을 임의 변경하지 않는다.

## 8. 실기기 배포 전 검수

현재 연결된 adb 기기는 없다. 아래 항목은 APK 생성/정적 검사와 별도로 기기에서 검수해야 하며 미검증 상태다.

| 항목                | 확인 방법                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| 단독 실행           | Metro를 끈 상태로 APK 설치·실행; 개발 서버 요구가 없어야 함                                        |
| Google 로그인       | 승인된 테스트 계정으로 브라우저→앱 복귀→세션 생성, 취소/재시도 확인                                |
| 부모/아이 화면      | PIN 경계와 전환, 다른 가족 정보 미노출                                                             |
| 공부 계획           | 검증용 계정으로 계획 생성·조회, 운영 프로젝트에 정상 반영                                          |
| 공부 완료·부모 확인 | 아이 완료 후 부모 확인 및 중복 조작 방지                                                           |
| 재시작              | 앱 종료/재실행 시 로그인·데이터·화면 복원                                                          |
| 알림                | Android 권한 허용/거절, 로컬 알림·탭 이동·이미 완료된 항목 취소                                    |
| 운영 DB             | 정상 세션의 읽기/쓰기와 RLS 경계를 검증용 계정으로 확인                                            |
| 계정 삭제           | 현재 기본 브랜치의 기존 14일 삭제 안내/취소/receipt와 운영 상태를 검토; 실제 사용자 삭제 없이 점검 |

새 이메일 인증 삭제 v1 및 즉시 삭제는 이 APK에 포함하지 않는다. 웹 삭제 페이지·새 삭제 인증 UI·즉시 삭제 정책은 별도 브랜치의 미완료 작업이다. 기존 삭제 기능의 실제 운영 상태와 체험자 안내가 일치하는지 확인 전에는 해당 흐름을 검증 완료로 표시하지 않는다. 로그인이나 삭제 보안 문제가 발견되면 우회하지 않고 배포를 보류한다.

## 9. 오류 대응

| 오류                               | 조치                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| environment / fallback is disabled | 올바른 운영 env 파일과 EAS production 변수 확인; 개발 URL로 대체하지 않음         |
| Unsupported EAS profile            | 이 브랜치의 beta 지원 app.config/eas.json을 사용하고 철자 확인                    |
| EAS 인증/서명 없음                 | 사용자가 올바른 Expo 팀 로그인/기존 credentials 접근을 복구; 새 키 임의 생성 금지 |
| Firebase 401/403                   | 사용자가 CLI 로그인 계정과 프로젝트/App Distribution 권한 확인                    |
| Firebase app not found             | App ID와 프로젝트 ID, Android 패키지 등록 일치 확인                               |
| 그룹 없음                          | 콘솔에서 alias `ssaida-beta` 확인; 표시 이름과 구분                               |
| APK 설치 서명/버전 오류            | 기존 앱의 인증서·versionCode와 비교; 임의 uninstall 또는 키 교체 금지             |
| Google redirect/audience 오류      | Supabase callback allowlist·Google Web client/audience 검토; auth 검사 완화 금지  |
| APK 실행 시 네트워크 실패          | 운영 endpoint/공개 키/기기 인터넷 확인; Metro나 DEV DB로 바꾸지 않음              |
| apksigner 실행 실패                | Android SDK build-tools 및 JAVA_HOME 확인; 서명 검사 생략 금지                    |

## 실행 기록

### 후속 실기기 검수 및 PIN 수정

- PIN 수정 APK `1.0.0 (4)` 빌드 및 Firebase 업로드 완료. EAS 빌드 ID `8d9d4cda-fad4-4a35-9343-f723e2dbd844`, 완료 시각 2026-10-19 15:11:03 KST. Firebase 릴리스 ID `190aubvqpqfv0`. 테스터/그룹 미지정으로 배포·초대를 실행하지 않았다.
- 파일 `outputs/beta/ssaida-1.0.0-4.apk` (119,707,284 bytes), SHA-256 `2ad5b01a6659217d3abe9e64c5cb678aca8f574379ad81d4998750b9319175e7`. 기존 APK (3)와 서명 일치, versionCode 4, Release/production 설정, 번들·ZIP 무결성, DEV endpoint 부재 및 비밀키 패턴 검사 통과. 보고서 `outputs/beta/verification-4.json`.
- 알림 회귀 테스트 재통과. APK (4)의 실기기 검증은 미완료: 본인 계정에만 릴리스 접근 권한 부여 후 기존 앱을 삭제하지 않고 업데이트한다. 부모/아이 모드 각각의 알림 진입 PIN, 틀린 PIN 차단, 취소 후 아이 화면 유지, 올바른 PIN 후 부모 확인 이동, 앱 종료 후 알림 진입을 확인해야 한다. 아래 APK (3) 실기기 결과를 APK (4)의 검증 결과로 간주하지 않는다.

- Firebase 프로젝트 `ssaida-732f2`, Android App ID `1:709799668495:android:dca06f464aa568cd826c7a`, 그룹 alias `ssaida-beta`를 조회 확인했다.
- APK `1.0.0 (3)` 업로드 및 릴리스 노트 등록 완료: 릴리스 ID `404dogafrg8d8`. CLI 업로드에 테스터/그룹을 지정하지 않았으며 체험단 배포는 보류한다.
- 사용자 실기기 확인: 설치·Google 로그인·부모/아이 화면·기존 PIN 전환·계획 생성·공부 완료/부모 확인·재실행·알림 수신/터치 이동 정상. 자동화된 기기 검증 결과와 구분한다.
- 추가 발견: 부모 모드에서 알림을 누르면 부모 확인으로 PIN 없이 이동했다. 알림 진입은 현재 모드와 관계없이 아이 모드로 잠근 뒤 기존 PIN 인증을 요청하도록 수정했다. 인증 성공 후 부모 확인으로 이동하고 취소하면 아이 화면에 남는다.
- 알림 라우팅 회귀 테스트에서 부모/아이 모드 모두 잠금 후 PIN 요청 순서를 확인했다. 이 수정은 기존 Firebase APK (3)에 포함되지 않았고 새 APK (4)에 반영했으며 실기기 재검증이 필요하다. 아래 최초 실행 기록의 미완료 항목 중 Firebase 등록·업로드 및 사용자 실기기 확인 상태는 이 후속 기록을 기준으로 한다.

- beta 환경 검사와 기존 개발/운영 환경 회귀 통과. 배포 아카이브의 실제 파일에서 로컬 비밀값·native debug 폴더·마케팅 문서·미커밋 코인 이미지·계정 삭제 v1 마이그레이션 제외 확인.
- EAS 빌드 ID `eaa7e58a-f9b1-43c9-9d7f-25402d988a40`, version `1.0.0`, versionCode `3`. [빌드 페이지](https://expo.dev/accounts/ssahidas-team/projects/ssahida-app/builds/eaa7e58a-f9b1-43c9-9d7f-25402d988a40). 2026-10-19 13:39:44 KST에 FINISHED 확인.
- APK 확보: `outputs/beta/ssaida-1.0.0-3.apk`, 119,707,448 bytes. 파일 SHA-256: `6dc315c8daeac8577357781677b2dd73b302b76b040d16041436039dbda9e959`.
- 실제 APK 정적 검증 통과: `com.ssaida.app`, versionCode 3, debuggable=false, 유효한 기존 인증서 서명, ZIP 무결성, 내장 JS 번들, production 설정 및 운영 endpoint 확인. DEV Supabase endpoint와 검사 대상 비밀키 패턴 미발견. 결과는 Git 제외 파일 `outputs/beta/verification.json`에 기록했다. Metro 없이 실행하도록 구성된 산출물이나 실제 기기 실행은 아직 미검증이다.
- APK 권한 목록에는 기존 저장소/오버레이 권한도 포함된다. 이번 배포 설정 작업에서 권한 정책을 변경하지 않았으며 전체 권한 목록은 검증 보고서에 보존했다.
- Firebase 프로젝트/앱 목록만 읽기 조회했다. 프로젝트 생성·앱 등록·업로드·그룹 생성·테스터 초대·실제 로그인·DB 변경·계정 삭제는 수행하지 않았다.
- 운영 Supabase의 공개 `/auth/v1/settings` 읽기 요청은 HTTP 200, Google provider 활성으로 확인했다. 로그인 세션을 생성하지 않았으며 인증된 DB 읽기/쓰기·Google 사용자 로그인 성공의 증거로 간주하지 않는다.
- build wrapper의 DEV 환경·DEV 로그인·service-role 형식·추가 비밀 변수·localhost 거부 테스트를 통과했다. 업로드 스크립트는 가짜 APK 입력과 `-DryRun`으로만 대상/그룹 인수를 검증했으며 실제 업로드 테스트가 아니다.
- 가짜 Firebase CLI를 사용한 인수 전달 검사에서 기본 실행의 그룹 미지정, `-Distribute`의 `ssaida-beta` 지정, 공백 포함 파일 경로 전달을 확인했다. 이 검사도 외부 업로드/초대를 실행하지 않았다. TypeScript·변경 JS의 ESLint·기존 OAuth 중복 콜백 관련 회귀를 통과했다.
