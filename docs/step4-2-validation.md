# Step 4.2 검증 (2026-09-10)

## 환경 및 변경 범위

- Windows / Expo SDK 57 Web export / local Supabase Auth·PostgREST·PostgreSQL.
- Step 1 및 Step 2 학습·컬렉션 migration, seed.sql은 변경하지 않음.
- Step 4.1 함수 선언만 CREATE OR REPLACE로 정리. Step 4.2 migration을 별도 추가.
- Git commit/push 및 remote Supabase push는 수행하지 않음.

## Fresh apply 및 DB 보안

- `supabase db reset --local`을 이번 작업에서 정확히 1회 실행, 성공.
- Step 1 → Step 2 → Step 4.1 → Step 4.2 → seed 순서 적용 성공.
- `supabase db lint --local`: No schema errors found.
- 실제 로컬 public schema에서 database.types.ts 재생성.
- verify_parent_pin: SECURITY DEFINER, 빈 search_path 확인.
- ACL: postgres(함수 소유자), authenticated만 EXECUTE.
  PUBLIC / anon / service_role에는 EXECUTE 없음.
- parent_pin_credentials의 기존 RLS·직접 접근 차단 유지.
- 반환값 true=성공, false=실패, null=잠금. 5번째 실패를 저장한 뒤 null을 반환하므로
  예외로 인한 카운터/잠금 rollback이 발생하지 않음.
- row lock 획득 후 clock_timestamp로 잠금 여부를 검사하며, 잠금 중에는 crypt를 호출하지 않음.

## 로컬 integration

기존 STEP3_API_URL / STEP3_ANON_KEY / STEP3_SERVICE_ROLE_KEY를 로컬 테스트 프로세스에만
주입한다. 서비스 키는 앱에 넣지 않는다. Step 4.2 테스트는 검사/만료 fixture를 위해
Docker의 로컬 PostgreSQL에 접근한다. 기본 컨테이너는 supabase_db_ssaida-app이며
STEP42_DB_CONTAINER로 로컬 테스트 컨테이너명을 지정할 수 있다.

```bash
node scripts/step4-2-integration.mjs
node scripts/step4-1-integration.mjs
node scripts/step3-integration.mjs
node scripts/step4-2-ui-regression.mjs
node scripts/step4-1-ui-regression.mjs
```

- 정상 PIN, 성공 시 카운터 초기화, 1~4회 실패, 5번째 실패 잠금: 통과.
- 잠금 중 정상 PIN 차단 및 counter/locked_until 불변: 통과.
- 5분 잠금 만료 시각 검증, 만료 fixture 후 정상 PIN 성공 및 초기화: 통과.
- 만료 후 잘못된 PIN은 새 묶음의 1회 실패로 처리: 통과.
- 독립 HTTP 동시 4회 실패: counter=4, 유실 없음.
- 독립 HTTP 동시 12회 실패: false 4개, locked(null) 8개, counter=5.
- anon 실행 차단, credential SELECT 차단, 타인 parent_id 인자 거부, A/B 카운터 분리: 통과.
- Step 4.1 PIN smoke: 통과. 각 형식 오류 case 사이 성공 검증을 넣어 독립 테스트로 유지.
- Step 3 integration의 7개 PASS 그룹 전부 통과.
- Step 4.2와 Web 테스트 계정은 검증 후 정리. Step 3 스크립트가 남기는 자체 fixture는 유지.

## 실제 Expo Web E2E

실제 로컬 테스트 Auth 세션을 일회용 loopback bootstrap으로 준비했다.
Google OAuth 자체 로그인은 수행하지 않았고 제품 로그인 코드는 변경하지 않았다.
테스트용 서버와 계정은 검증 후 제거했다.

- 아이 헤더 → 부모님 메뉴: PIN 입력 없이 로그아웃 버튼 접근 가능.
- 서버에서 테스트 계정을 잠근 후 정상 PIN 입력: 잠시 후 다시 시도해 주세요 표시,
  child mode 유지.
- 해당 계정의 잠금 시각만 만료 fixture로 변경한 후 정상 PIN: parent/home 진입.
- parent → 아이 화면: child/today로 이동. 양방향 모두 root를 거치는 코드로 검증.
- child에서 parent/home URL 직접 방문: child/today로 이동.
- 실제 부모 UI로 WORKBOOK(5쪽/회, 마지막 100쪽), ACTIVITY(독서 20분) 등록.
- DINO 선택 → WORKBOOK 시작 → 새로고침 → 같은 IN_PROGRESS task 복원 → 아이 완료.
- ACTIVITY 시작 → 아이 완료. 두 공부 모두 부모 확인 대기 표시.
- 실제 완료 페이지 101 입력 시 마지막 쪽 초과 안내. 5 입력 후 일괄 확인 성공,
  문제집 진도 5쪽 표시 및 대기 목록 비워짐.
- 정원에서 공개 전 이름 숨김 → 열어보기 성공 시 실제 이름 표시 → 정원으로 후 이전 이름 제거.
- 서버에서 다시 잠근 상태에서도 아이 메뉴 로그아웃 성공 → Google 로그인 화면으로 복귀.

## 컴포넌트 수준 회귀와 한계

step4-2-ui-regression은 production TSX를 메모리에서 변환해 handler와 반환 JSX를 실행한다.
React renderer/Router/네트워크는 mock이며 브라우저 E2E를 대체하지 않는다.

- PIN invalid/locked 유지, 성공 root 이동, 입력 초기화, PIN 없는 logout: 통과.
- reveal 실패 비노출 / 성공 표시 / 새 GROWING에서 이름 제거: 통과.
- ensure 최초 1회 / retry 1회 추가 / 일반 rerender 추가 0회: 통과.
- workbook 상한 초과 시 mutation 0회, 상한값 허용: 통과.
- CHILD_COMPLETED/PARENT_CONFIRMED/PARTIAL/SKIPPED 완료 CTA 없음, RETRY 시작 유지: 통과.
- 기존 production NULL StudyItem filter 실행 테스트: 통과.
- 이번에는 브라우저 네트워크 오류를 주입하는 reveal/ensure 테스트와 PARTIAL/SKIPPED 직접 URL
  테스트는 반복하지 않았으며, 위 mock 기반 회귀로 검증했다.
- Android/iOS 실기기, Google 재인증/복구, production catalog는 미검증/후속 범위.

## 품질

- Typecheck / ESLint / Prettier / git diff --check: 통과.
- Expo Web export: 성공.
- src/scripts/supabase 대상 secret literal 패턴 탐지 0건.
- src 대상 service-role 및 PIN 로그/저장 패턴 탐지 0건. Git에 .env는 없고 .env.example만 추적.
- 타입 생성 과정의 CLI MaxListenersExceededWarning은 있었지만 종료 코드 0이며 타입 생성 및
  DB lint는 성공했다.

## Production release blockers

- Parent PIN recovery requires parent re-authentication before production release.
- Production collectible catalog data migration required; all six themes need active data.
  로컬 DEV seed는 원격 db push로 적용되지 않으며 production 콘텐츠로 옮기지 않았다.
