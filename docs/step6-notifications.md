# Step 6: 기기 로컬 알림

## 설정과 범위

### 변경 파일

- 설정: `app.json`, `package.json`, `pnpm-lock.yaml`
- 연결: `src/providers/app-providers.tsx`, `src/app/_layout.tsx`, `src/app/child/_layout.tsx`
- 기존 화면: `src/features/auth/components/parent-mode-button.tsx`, `src/features/auth/screens/settings-screen.tsx`,
  `src/features/learning/screens/child-today-screen.tsx`, `src/features/learning/components/manual-tasks-panel.tsx`
- 신규 feature: `src/features/notifications/`의 `api.ts`, `types.ts`, `planner.ts`, `reconcile.ts`, `storage.ts`,
  `notification-context.ts`, `notification-provider.tsx`, `notification-routing.tsx`,
  `notification-settings-panel.tsx`, `notification-port.ts`, `notification-port.native.ts`
- 날짜 hook: `src/shared/hooks/use-today.ts`
- 테스트: `scripts/step4-2-ui-regression.mjs`, `scripts/step6-integration.mjs`,
  `scripts/step6-lifecycle-regression.mjs`, `scripts/step6-notification-regression.mjs`
- 문서: `README.md`, 이 문서

### 플랫폼

- Expo SDK 57 / expo-notifications 57.0.17. 공식 문서: <https://docs.expo.dev/versions/v57.0.0/sdk/notifications/>.
- app.json plugin과 Android `ssaida-reminders` 채널 사용. 새 네이티브 빌드가 필요합니다.
- 부모 설정 화면에서 설명 후 알림 켜기를 선택해야 권한을 요청합니다. 최초 실행은 요청하지 않습니다.
- 전체 알림과 두 시간 알림은 기본 비활성, 시간은 빈 값입니다. 사용자가 HH:MM으로 지정합니다.
- 거부 후 OS prompt를 반복하지 않고 기기 설정 링크를 제공합니다. 학습 기능은 차단하지 않습니다.
- iOS authorized/provisional/ephemeral 권한을 지원합니다. Web에서는 네이티브 API를 import하지 않고 미지원 안내만 표시합니다.
- push token, remote push server, 새 DB table/migration/RPC는 없습니다. 같은 기기에서만 알림을 받습니다.

## 판단 규칙

| 목적          | 판단 및 취소                                                                                        | 식별자                                   |
| ------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 오늘 완료     | STUDY + 비어 있지 않은 오늘 task 전체가 CHILD_COMPLETED/미확인일 때 날짜당 1회                      | `ssaida:daily-complete:{childId}:{date}` |
| 3일 확인 대기 | STUDY, CHILD_COMPLETED, parent_verified_at NULL, 완료 시각 존재, 72시간 이상. 새 대상만 묶어서 알림 | `ssaida:overdue-confirm:{childId}`       |
| 부모 확인시간 | 부모가 정한 시간에 매일 반복. 비활성/시간 변경 시 기존 예약 취소                                    | `ssaida:parent-check:{childId}`          |
| 미완료        | STUDY + 오늘 PLANNED/IN_PROGRESS가 있을 때 오늘 설정 시각에 1회 예약. 모두 완료/REST면 취소         | `ssaida:unfinished:{childId}:{date}`     |

완료 확인/RETRY 후 부모 확인 알림을 재평가하고 필요 없는 예약·알림함 항목을 정리합니다.
RETRY는 3일 확인 대기 및 미완료 알림 대상에 넣지 않습니다.
기존 reschedule 원본 제외 API를 재사용하며 AUTO 학습 상태는 변경하지 않습니다.

## 저장·동시성·lifecycle

AsyncStorage `ssaida.notifications.v1:{authUserId}`에 로컬 설정과 중복 방지 receipt만 저장합니다.
DB task 내용/상태, PIN, 인증 토큰을 이 저장소에 복제하지 않습니다.
완료 알림은 날짜별, overdue는 task ID + child_completed_at별 receipt이므로 일부 확인 후
대상군이 작아져도 기존 대상에 반복 발송하지 않습니다. RETRY 후 새 완료 건은 별개입니다.

예약 비교에는 identifier와 설정 signature를 사용합니다. 동일 예약은 유지하고 사라진 예약은 복구합니다.
저장·sync는 직렬화되며 계정이 변경된 이전 응답은 알림을 만들지 않습니다.
로그아웃 시 앱 소유 예약/표시 알림을 취소하며, 다른 계정의 예약도 정리합니다.

앱 시작, foreground 복귀, mutation 성공, foreground 60초 점검에서 동기화합니다.
날짜는 별도 작은 로컬 date store에서 갱신하여 아이 오늘/부모 수동 폼이 새 query key를 사용합니다.
날짜 변경 시 ensure_daily_plan 및 learning query 무효화를 수행합니다. 실패한 rollover는 다음 sync에서 재시도합니다.
설정 해제에 따른 취소는 DB 조회 전에 수행하므로 서버에 연결되지 않아도 기존 예약을 취소합니다.

알림 데이터에는 고정 목적(parent/child)과 사용자·아이 ID만 사용합니다. 임의 URL을 열지 않습니다.
parent 알림을 child mode에서 탭하면 아이 화면의 기존 PIN gate를 엽니다. tap 자체는 parent mode를 설정하지 않습니다.

## 로컬 알림의 한계

- 앱 종료 중 원격 데이터 변경을 감지하지 않습니다. 특히 3일 경과 알림은 다음 앱 sync에서 평가합니다.
- 미래 날짜 전체의 미완료 예약을 미리 만들지 않습니다. 새 날짜 계획은 앱 실행/복귀 때 확인합니다.
- 마지막 sync 후 다른 기기에서 확인해도 이미 OS에 맡긴 알림은 다음 sync 전까지 남을 수 있습니다.
- 절전/OS 정책으로 정시 전달이 지연될 수 있습니다. 정확 알람 특별 권한은 추가하지 않았습니다.
  설치한 Android 구현은 exact alarm 권한이 없으면 inexact 경로를 사용합니다.
- 시각이 지났어도 아직 OS에 대기 중인 오늘 미완료 알림은 유효한 동안 유지합니다.
  OS 전달 후 사라진 알림을 지난 시각에 새로 생성하지 않습니다.
- 앱 데이터 삭제/재설치 또는 다른 기기까지 중복을 막는 전역 delivery history는 없습니다.
- 즉시 알림 receipt를 먼저 저장합니다. 저장 직후 앱이 종료되면 알림을 놓칠 수 있지만
  재실행마다 중복 발송하지 않도록 하는 at-most-once 우선 전략입니다. OS scheduling 실패는 receipt를 되돌립니다.

## 검증과 재현

```powershell
node scripts/step6-notification-regression.mjs
node scripts/step6-lifecycle-regression.mjs
node scripts/step6-integration.mjs
node scripts/step4-2-ui-regression.mjs
```

DB 테스트 환경 변수는 기존 Step 3과 동일한 로컬 `STEP3_API_URL`, `STEP3_ANON_KEY`,
`STEP3_SERVICE_ROLE_KEY`입니다. 키를 로그/앱/저장소에 넣지 않습니다.
step6-integration은 일회용 사용자로 실제 쿼리와 RPC를 검증하고 finally에서 정리합니다.
OS port/권한/시간은 mock이며 실제 알림 수신 E2E를 대체하지 않습니다.

- A~H planner/reconciler, 저장소 재로딩, 계정 분리, 권한 요청, PIN gate/시간 입력 UI 테스트 통과.
- production Provider의 시작/복귀/mutation/자정/ensure 실패 재시도/로그아웃 중 응답 테스트 통과.
- 로컬 DB snapshot의 STUDY/REST/RETRY/확정 상태 필터 통과.
- 기존 Step 3, 4.1, 4.2, 4.2.1, Step 5 실행 스크립트 통과.
- Web export 통과. Android/iOS 실제 수신/탭/재부팅 검증은 미실행입니다.
  연결된 Android 기기 및 등록된 AVD가 없으며, Windows 환경에서 iOS 런타임은 사용할 수 없습니다.
- Android JS/Hermes export도 통과했습니다. 네이티브 APK 빌드 성공을 의미하지는 않습니다.
- TypeScript, ESLint, Prettier, git diff --check 통과. DB migration/commit/push는 수행하지 않았습니다.

### Android 빌드 결과

아래는 Step 6 당시 실패 기록입니다. Step 6.1에서 pnpm hoisted 설치로 경로를 줄인 뒤
동일 도구 버전으로 debug APK 빌드와 서명 검증에 성공했습니다.
재현 명령과 남은 기기 검증은 [Step 6.1 빌드 문서](step6-1-android-build.md)를 참고하세요.

`expo prebuild --platform android --no-install`은 성공했습니다.
병합 manifest에 `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, notifications service/receiver가 포함되었습니다.
SDK/NDK 등 필요한 구성요소는 로컬 Gradle 빌드 중 설치되었습니다.
`gradlew assembleDebug --no-daemon`은 기존 react-native-worklets CMake/Ninja 단계에서 실패했습니다.
긴 pnpm 경로 경고가 반복된 뒤 `ninja: error: manifest 'build.ninja' still dirty after 100 tries`로 종료했습니다.
APK 성공이나 실제 알림 수신으로 보고하지 않습니다. 생성된 android 폴더는 기존 Git ignore 대상입니다.
프로젝트 경로 단축 또는 별도 네이티브 빌드 환경 검토는 후속 작업이며, 이번에 의존성/저장소를 임의 이동하지 않았습니다.

실제 기기에서는 부모 설정에서 권한 허용/거부, 가까운 미래 시각 예약, 두 공부 완료 시 1회 표시,
PIN 잠금 중 알림 탭, 확인 후 취소, background/foreground, 재실행·재부팅, 시간대 변경을 추가 확인해야 합니다.
