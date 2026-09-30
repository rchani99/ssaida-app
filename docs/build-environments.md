# DEV / production 빌드 환경

실제 값은 Git 미추적 `.env` 또는 EAS의 해당 environment에 넣습니다.
`.env.example`은 변수 이름만 제공합니다. `EXPO_PUBLIC_` 값은 앱에서 읽을 수 있으므로
publishable/anon key만 사용하며 service_role, secret key, Google Client Secret을 넣지 않습니다.

| 변수                                              | development                     | production                      |
| ------------------------------------------------- | ------------------------------- | ------------------------------- |
| `EXPO_PUBLIC_APP_ENV`                             | `development`                   | `production` 필수               |
| `EXPO_PUBLIC_SUPABASE_URL`                        | 로컬/승인된 DEV URL             | 사용하지 않음                   |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | DEV 공개 키                     | 사용하지 않음                   |
| `EXPO_PUBLIC_PRODUCTION_SUPABASE_URL`             | 사용하지 않음                   | production HTTPS URL 필수       |
| `EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY` | 사용하지 않음                   | production 공개 키 필수         |
| `EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF`     | 사용하지 않음                   | URL과 일치하는 project ref 필수 |
| `EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN`              | 기본 비활성, debug에서만 opt-in | `false` 필수                    |
| `EXPO_PUBLIC_AUTH_REDIRECT_URI`                   | `ssaida://auth/callback`        | `ssaida://auth/callback`        |

기존 `.env`는 수정하지 않았습니다. 환경 식별자 미지정은 기존 개발 실행 호환을 위해
debug에서만 development로 취급합니다. 빈 값/알 수 없는 환경은 실패합니다.
production 전용 값이 없으면 DEV 변수로 fallback하지 않습니다.
`.env.production` 파일명이나 `NODE_ENV`만으로 서비스 환경을 선택하지 않습니다.

## 차단 정책

- `src/config/environment-policy.js`에 DEV project ref를 공개 정책으로 한 번만 정의합니다.
  DEV 프로젝트 변경 시 목록과 회귀 테스트를 함께 검토합니다.
- production은 로컬/DEV URL, 비 HTTPS, ref 불일치, URL의 사용자정보/경로/쿼리/fragment를 거부합니다.
  현재 Supabase 기본 도메인만 허용하며 커스텀 도메인은 별도 정책 검토가 필요합니다.
- production은 DEV 로그인 flag가 명시적으로 false여야 합니다.
- legacy JWT는 anon role과 production ref를 검사합니다. opaque publishable key의 실제
  프로젝트 소속은 오프라인에서 확인할 수 없으므로 해당 프로젝트의 키인지 별도 확인합니다.
- Expo config 해석 단계에서 검사하고 EAS profile/앱 환경 불일치도 실패합니다.
- Supabase 클라이언트 생성 전 같은 정책을 검사합니다. `__DEV__=false`이면 반드시 production입니다.
  직접 Gradle 등 config 검사를 우회한 release도 네트워크 클라이언트 초기화에서 실패합니다.
  기존 설정 오류 화면이 원인을 표시하며 오류에 키/PIN/URL 원문은 포함하지 않습니다.
- DEV 로그인은 debug + development + 명시적 opt-in + 승인된 DEV endpoint를 모두 요구합니다.

## EAS profiles / 버전

| profile     | EAS environment | Android 결과                         |
| ----------- | --------------- | ------------------------------------ |
| development | development     | `:app:assembleDebug` APK, Metro 필요 |
| production  | production      | store용 AAB, DEV 로그인 false        |

development는 기존 debug/Metro 흐름이며 `expo-dev-client`를 요구하지 않습니다.
preview는 추가하지 않았습니다. DEV DB를 쓰는 release APK는 허용하지 않습니다.
iOS development는 simulator Debug이며 실제 iOS 출시 검증은 별도입니다.

EAS `appVersionSource: remote`, production `autoIncrement: true`를 사용합니다.
`app.json`의 versionCode 1 / buildNumber "1"은 초기 기준이며, EAS 연결 후 원격 초기값을
확인해야 합니다. 로컬 빌드에는 원격 자동 증가가 적용되지 않습니다. 사용자 버전은 1.0.0입니다.
package/bundleIdentifier `com.ssaida.app`, slug `ssaida-app`, scheme `ssaida`는 유지합니다.
표시 이름만 `쌓이다`로 맞췄습니다. 같은 package라 DEV/production 동시 설치가 안 되며
서명이 다르면 교체 설치도 실패할 수 있습니다.

사람이 EAS 프로젝트를 연결하고 해당 environment에 공개 변수를 등록해야 합니다.
URL/ref/callback은 Plain text, 공개 키는 Sensitive 등 로컬 config 해석에도 사용할 수 있는
가시성을 선택합니다. Secret 가시성은 로컬 config 해석에서 읽지 못할 수 있습니다.
실제 secret은 이 앱 변수에 넣지 않습니다. 준비 후 사용할 명령은
`eas build --platform android --profile production`입니다. 현재는 연결/서명/빌드를 실행하지 않았습니다.

## Android 서명 / 출시 전 확인

현재 Git 미추적 `android/` release의 signingConfig는 debug이며 수동 수정하지 않았습니다.
기존 `.gitignore`가 native 폴더와 `.env*`를 EAS 업로드에서 제외하므로 EAS에서 prebuild한 뒤
관리된 서명을 적용하는 경로를 사용합니다. `.easignore`를 추가하면 이 제외 규칙을 유지해야 합니다.
로컬 Gradle 산출물을 정식 release로 간주하지 않습니다. adaptive icon/splash 참조는 유지했습니다.

최종 AAB에서 확인할 항목:

- 정식 upload key/Play App Signing 연결, debug 서명 및 debuggable 여부.
- versionCode, package, scheme/callback, 실제 production 연결, DEV 로그인 비노출.
- 병합 release manifest의 `POST_NOTIFICATIONS` 및 알림 채널/허용/거절 동작.
- 기존 저장소/overlay 권한과 라이브러리 유입 권한의 필요성.
- cleartext 허용 여부, `allowBackup` 및 세션 데이터 백업 정책.
- adaptive icon/splash 실제 렌더링.

## 검증

`node scripts/environment-regression.mjs`는 합성 공개 값으로 차단 정책, 네트워크 초기화 전
검사, EAS profiles 및 실제 Expo config loader를 확인합니다. 외부 네트워크/DB는 사용하지 않습니다.
`pnpm test`에도 포함됩니다. 기존 OAuth callback/DEV 로그인 회귀를 함께 실행합니다.

참고: [Expo SDK 57 config](https://docs.expo.dev/versions/v57.0.0/config/app/),
[EAS 환경 변수](https://docs.expo.dev/eas/environment-variables/),
[EAS 버전 관리](https://docs.expo.dev/build-reference/app-versions/).
