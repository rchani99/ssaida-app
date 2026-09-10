# Step 4.1 검증 (2026-09-10)

환경: Windows, Expo SDK 57 Web export, local Supabase PostgreSQL/Auth/PostgREST.
원격 Supabase push와 Git commit/push는 수행하지 않음.

## 로컬 DB와 자동 테스트

- `supabase migration up --local`: 새 PIN RPC migration 적용 성공.
- `supabase gen types typescript --local --schema public`: 실제 타입 재생성.
- `scripts/step4-1-integration.mjs`: 정상/오입력/잘못된 형식/NULL PIN,
  서로 다른 PIN을 사용하는 두 계정의 소유권 분리, anon 실행 거부,
  credentials 직접 SELECT 거부, 임의 parent_id 파라미터 거부 확인.
- PostgreSQL 카탈로그에서 SECURITY DEFINER와 빈 search_path 확인.
  PUBLIC/anon/service_role EXECUTE 없음, authenticated EXECUTE 있음.
  함수 소유자 postgres의 실행 권한은 유지.
- `scripts/step4-1-ui-regression.mjs`: 실제 production filter 함수를 사용해
  과거 MANUAL/RESCHEDULED의 NULL FK가 오늘 MANUAL을 숨기지 않음과
  같은 non-null StudyItem만 중복 제거됨을 검증.
- 기존 `scripts/step3-integration.mjs`: 7개 PASS 그룹 전부 통과.

실행: 기존 Step 3과 동일한 STEP3_API_URL / STEP3_ANON_KEY /
STEP3_SERVICE_ROLE_KEY를 로컬 테스트 프로세스에만 주입한 뒤 실행한다.
서비스 키는 앱 환경 변수에 넣지 않는다. PIN 테스트 계정은 finally에서 정리한다.

```bash
node scripts/step4-1-integration.mjs
node scripts/step4-1-ui-regression.mjs
node scripts/step3-integration.mjs
```

## 실제 Web 화면 검증

로컬 Google provider 미설정으로, 테스트 전용 Auth 계정을 서버에서 만들고
한 번만 제공하는 localhost 페이지로 세션을 준비했다. 제품 로그인 코드를 바꾸지 않았다.
부모 모드 진입은 모두 화면의 부모님 버튼과 verify_parent_pin RPC를 거쳤다.

실패 주입은 테스트용 loopback HTTP 프록시에서 대상 요청 하나만 503으로 응답했다.
나머지 요청은 local Supabase에 그대로 전달했으며 요청 body/PIN을 로깅하지 않았다.
테스트 계정, fixture, 서버 파일은 검증 후 제거했다.

| 항목                                           | 결과                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| 부모님 버튼, 잘못된 PIN                        | child 유지, PIN이 맞지 않아요 표시, 입력값 초기화 |
| 올바른 PIN                                     | 부모 홈 진입, StudyItem 등록 가능                 |
| 부모 → 아이 → 부모                             | 재진입마다 PIN 요구                               |
| 부모 URL 직접 진입                             | 잠긴 모드에서는 child/today로 이동                |
| 부모 설정 → 로그아웃                           | 로그인 화면으로 복귀                              |
| reveal 강제 실패                               | 오류 표시, 공개 이름 요소 0개                     |
| reveal 성공                                    | 성공 화면에서만 실제 이름 표시                    |
| 정원으로 → 다음 collectible                    | 이전 공개 이름 제거                               |
| 다음 GROWING                                   | 무언가 자라고 있어요 표시, 이전 이름 요소 0개     |
| 과거 IN_PROGRESS MANUAL + 오늘 MANUAL 2개      | 세 항목 모두 유지                                 |
| ensure 최초 실패 → 재시도 1회                  | 요청 횟수 1 → 2, 추가 중복 요청 없음              |
| last_page=100에 actual=101 입력                | 마지막 쪽을 넘을 수 없어요, confirm RPC 요청 0회  |
| CHILD_COMPLETED                                | 부모 확인 대기, 완료 버튼 없음                    |
| PARENT_CONFIRMED / PARTIAL / SKIPPED 직접 진입 | 종료 안내, 완료 버튼 각각 0개                     |
| RETRY 직접 진입                                | 공부 시작 버튼 유지                               |

다음 GROWING 테스트는 이번 테스트 child의 pending만 0인 fixture로 조정했다.
seed/catalog 목표나 제품 DB 규칙은 변경하지 않았다.

## Step 4 정상 흐름 회귀

- WORKBOOK을 실제 부모 UI에서 등록: 5쪽/회, 마지막 100쪽, 오늘과 다음날 요일.
- 아이 시작 → 완료: 확정 진도 0, collectible 성장 0 유지 확인.
- 실제 부모 확인 actual=5: 진도 5, PARENT_CONFIRMED, DINO 성장 확인.
- 다음날 ensure RPC: 6~10쪽 확인.
- ACTIVITY 독서 20분을 실제 UI에서 등록/시작/완료/부모 확인.
- 다음날도 20분 생성, 시간 누적 없음.
- IN_PROGRESS 공부 화면 새로고침과 루트 재진입 후 같은 task 이어하기 복원.

## 미검증 및 후속 범위

- Google OAuth provider 자체 로그인, Android/iOS 실기기 동작은 이번 검증에 포함되지 않음.
- 이번에는 기존 local DB에 migration을 순차 적용했으며 DB reset은 수행하지 않음.
- PIN 잠금/복구, PARTIAL/RETRY 상세 UI, 자정 AppState 처리는 후속 범위.
- DEV catalog는 local/dev 전용이며 출시 전 별도 production data migration 필요.
