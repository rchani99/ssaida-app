# Step 6.1 Windows Android native build

결과: 동일 위치/도구 버전에서 **debug APK 빌드 성공**. `assembleDebug`는 27분 11초,
489개 task 실행으로 완료했습니다. 최소 성공 기준 B를 충족했고, 기기 실행은 미검증입니다.

## 원인과 수정 범위

Windows의 pnpm isolated 설치에서 Worklets/Screens 네이티브 경로가 길어졌습니다.
Ninja 1.10.2는 실제로 존재하는 273자 ReactAndroidConfig.cmake 경로를 없는 파일로
판단했고, CMake 재생성을 반복하다 `build.ninja still dirty after 100 tries`로 실패했습니다.
프로젝트 내부 Android/Worklets/Reanimated 산출물을 정리한 동일 빌드도 4분 38초 후
같은 오류로 실패했습니다. 알림 코드의 컴파일 오류가 아닙니다.

- `pnpm-workspace.yaml`: `nodeLinker: hoisted`로 네이티브 모듈의 실제 경로를 단축합니다.
  프로젝트 원본 위치, 전역 pnpm/Gradle 캐시, Windows 레지스트리는 변경하지 않습니다.
  동일 prefab 설정 파일 경로는 273자에서 193자로 줄었습니다.
- `allowBuilds.unrs-resolver: false`: 기존 미결정 문자열을 명시적인 설치 스크립트
  비허용 값으로 바꿉니다. 새 설치 스크립트를 허용하지 않습니다.
- AsyncStorage만 설치된 Expo 57.0.16의 `bundledNativeModules.json` 기준 `2.2.0`으로
  맞춥니다. 알림/인증 저장 로직은 변경하지 않습니다.
- 최신 SDK 57 패치 일괄 업데이트, New Architecture 비활성화, NDK/Gradle 다운그레이드,
  SDK에 포함된 Ninja 실행 파일 덮어쓰기는 하지 않습니다.

공식 근거:
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[Expo pnpm isolated 설치 문제 시 hoisted 전환](https://docs.expo.dev/guides/monorepos/),
[Reanimated Windows 빌드 가이드](https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/).
Reanimated 가이드는 긴 경로에 Ninja 1.12 이상을 권장합니다. 이번에는 전역 도구를
교체하지 않고 문제가 되는 경로 자체를 줄이는 방법을 검증합니다.

## 로컬 환경

| 항목                                   | 버전/상태                  |
| -------------------------------------- | -------------------------- |
| pnpm                                   | 11.19.0, hoisted           |
| Expo / React Native                    | 57.0.16 / 0.86.2           |
| expo-notifications / expo-modules-core | 57.0.17 / 57.0.13          |
| Gradle / Android Gradle Plugin         | 9.3.1 / 8.12.0             |
| NDK                                    | 27.1.12297006              |
| CMake / Ninja                          | 3.22.1 / 1.10.2            |
| Java                                   | Android Studio JBR 21.0.10 |
| compileSdk / targetSdk                 | 36 / 36                    |
| New Architecture / Hermes              | 활성 / 활성                |
| Windows LongPathsEnabled               | 이미 1; 변경하지 않음      |

`android/`는 Expo prebuild로 생성하며 Git에서 제외합니다. `local.properties`는 없고,
빌드 프로세스에만 `JAVA_HOME`, `ANDROID_HOME`을 지정합니다. 시스템 환경 변수는
변경하지 않습니다. `ANDROID_SDK_ROOT`를 중복 지정할 필요는 없습니다.

## 재현 가능한 빌드 명령 (PowerShell, 저장소 루트)

```powershell
pnpm install --frozen-lockfile
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
pnpm exec expo prebuild --platform android --no-install
.\android\gradlew.bat -p android assembleDebug --no-daemon --stacktrace
```

경로는 각 PC에 설치된 Android Studio/SDK 위치에 맞춥니다. `prebuild`는 생성된
네이티브 폴더를 갱신할 수 있으므로 수동 native 변경이 있으면 먼저 보존해야 합니다.
또한 `package.json`의 iOS 실행 스크립트를 `run:ios`로 바꿀 수 있습니다. 이번 작업은
Android만 대상이므로 기존 `expo start --ios`를 유지했습니다.

APK 위치: `android/app/build/outputs/apk/debug/app-debug.apk`.
debug APK 실행에는 Metro 개발 서버가 필요합니다.

검증한 APK는 230,919,655 bytes이며 arm64-v8a/armeabi-v7a/x86/x86_64를 포함합니다.
`apksigner verify --verbose` 서명 검증 성공(v2), `aapt2 dump badging`으로
`com.ssaida.app`, minSdk 24, targetSdk 36, MainActivity를 확인했습니다.
SHA-256: `A8EE6F788765412700A8EE4DC26A43FE48789839580E82BF692FA9B5AE3A46FD`.

```powershell
pnpm start --localhost
# 별도 터미널, USB 디버깅을 허용한 Android 기기 연결 후:
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android/app/build/outputs/apk/debug/app-debug.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n com.ssaida.app/.MainActivity
```

## 검증 로그와 한계

다음 검증은 hoisted 설치/AsyncStorage 변경 후 통과했습니다.

- 설치된 Expo 57.0.16의 bundled dependency 검사 (`EXPO_OFFLINE=1`): 일치.
  온라인 검사는 이후 출시된 SDK 57 패치들을 권장하지만 이번에는 일괄 업데이트하지 않았습니다.
- `pnpm install --frozen-lockfile --offline`: 성공.
- Step 3, 4.1, 4.2, 5, 6 로컬 Supabase 통합 스크립트 전체.
- Step 4.1/4.2 UI, 4.2.1 실제 mutation/reveal, Step 6 notification/lifecycle 회귀.
- TypeScript, ESLint, Prettier, `git diff --check`.
- Expo Web export 및 Android JS/Hermes `.hbc` export.

병합 manifest 및 APK 내부 manifest(`aapt2 dump xmltree`)에서 `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`,
`NotificationsService` receiver, `ExpoFirebaseMessagingService` service,
`NotificationForwarderActivity`, 기본 `ssaida-reminders` 채널 metadata를 확인했습니다.
채널의 실제 OS 생성 및 권한 허용은 기기 런타임에서 별도 확인해야 합니다.

빌드/번들 상세 로그는 Git 제외 경로 `.expo/step6-1/`에 둡니다.
`clean-baseline.log`는 isolated 실패 재현, `hoisted-build.log`는 수정 후 빌드입니다.
`web-export.log`, `android-export.log`는 각각 Web과 Android JS/Hermes export입니다.

현재 연결 기기, 등록된 AVD, 설치된 emulator system image가 없습니다. APK 생성/manifest 검사는 앱 런타임 검증을
대체하지 않습니다. 로그인 화면, crash 여부, 권한 요청, 실제 즉시/예약 알림,
알림 탭의 PIN gate, foreground/background, 재실행 후 예약 복원은 Android에서
추가 확인해야 합니다. Step 6 mock/DB 회귀 통과를 실제 OS 알림 성공으로 해석하지 않습니다.

DB migration, 알림 비즈니스 로직, Git commit/push, remote Supabase push는 변경/실행하지 않습니다.
