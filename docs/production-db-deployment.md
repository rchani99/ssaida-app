# 운영 DB 배포 기록

2026-10-13 최초 배포 완료.

- 프로젝트: `ssahida-prod` / `thinmctzgynmtuihirng`
- 리전: Seoul (`ap-northeast-2`)
- 배포 전: public 앱 테이블 및 마이그레이션 이력 없음.
- 적용: `supabase/migrations`의 기존 19개와 운영 전용 컬렉션 마이그레이션 1개.
- 운영 전용 원본: `supabase/production-migrations/202610130001_production_collection_catalog.sql`
- 당시 적용 파일 SHA-256: `supabase/production-migrations/deployment-20261013-hashes.json`
- 배포 작업 폴더: `outputs/production-db-thinmctzgynmtuihirng` (Git 제외, 재생성 가능).
- 원래 작업 폴더의 DEV 연결 `ffnxodulitwzuqswlaga`는 유지.

## 검증 결과

- 원격 이력 20개, 배포 폴더 기준 재 dry-run에서 미적용 파일 0개.
- 카탈로그 36개, 테마별 6개, 모든 성장 목표 24.
- 코드, 이름, 테마, 순서, 활성 상태, 성장 목표를 승인한 SQL과 비교: 불일치 0개.
- public 테이블 중 RLS 비활성 테이블 0개.
- authenticated 역할의 parent_pin_credentials 직접 SELECT 권한 없음.
- 당시 Auth 사용자 0명. 실제 로그인과 학습 흐름의 기기 검증은 별도.

## 파일 해시 확인

해시 목록은 배포 당시 파일 바이트의 SHA-256을 보존한 기록이다. Windows Git 체크아웃·archive가 LF를 CRLF로 바꾸면 SQL 내용이 같아도 해시가 달라질 수 있다. 이 배포 기록의 파일은 LF 기준으로 비교한다. 검증용 복사본의 줄바꿈을 LF로 맞춰 확인하고, 기록된 해시나 이미 적용된 마이그레이션을 바꾸지 않는다.

## 다음 운영 배포

운영 전용 파일도 원격 마이그레이션 이력에 등록돼 있다. 루트의
`supabase/migrations`만으로 운영에 push하면 파일 목록이 원격 이력과 다르다.
운영 배포 폴더에는 다음 두 경로의 SQL을 모두 모아야 한다.

1. `supabase/migrations/*.sql`
2. `supabase/production-migrations/*.sql`

배포 폴더의 `supabase/config.toml`은 저장소 설정을 복사한다. 개발용 `seed.sql`은
복사하지 않으며 `--include-seed`를 사용하지 않는다. 운영 전용 카탈로그 SQL은
빈 카탈로그만 허용하므로 DEV의 공통 마이그레이션 폴더에 넣지 않는다.
이미 적용한 파일은 수정하지 않고 변경사항은 새로운 마이그레이션으로 추가한다.

저장소 루트에서 재생성 예시:

```powershell
$deployPath = 'outputs/production-db-thinmctzgynmtuihirng'
New-Item -ItemType Directory -Force -Path "$deployPath/supabase/migrations" | Out-Null
Copy-Item -LiteralPath supabase/config.toml -Destination "$deployPath/supabase/config.toml"
Get-ChildItem supabase/migrations -Filter '*.sql' | Copy-Item -Destination "$deployPath/supabase/migrations"
Get-ChildItem supabase/production-migrations -Filter '*.sql' | Copy-Item -Destination "$deployPath/supabase/migrations"
pnpm dlx supabase link --project-ref thinmctzgynmtuihirng --workdir $deployPath
pnpm dlx supabase migration list --linked --workdir $deployPath
pnpm dlx supabase db push --linked --dry-run --workdir $deployPath
```

불필요한 SQL 파일이 남아 있지 않은 배포 폴더인지 확인하고, 예정 목록을 검토한 뒤 같은 workdir로
`db push --linked`를 실행한다. 운영 대상에 `db reset`을 실행하지 않는다.
카탈로그는 이미 이력에 포함돼 있으므로 snippets의 SQL을 다시 실행하지 않는다.

이 작업은 DB 배포만 포함한다. Google OAuth 설정, Edge Function 배포,
예약 작업 등록, EAS 빌드 및 실제 기기 검증은 별도 작업이다.

## 2026-10-16 STEP 2-B 추가 적용 완료

적용 직전 운영 원격 이력은 최초 기록과 동일한 20개였다. 기존 배포 폴더에
아래 원본 SQL 4개만 복사했으며, dry-run에서 이 4개 외 대상이 없음을 확인한 뒤
`db push --linked`로 적용했다. 기존 20개와 운영 카탈로그는 재실행하지 않았다.
seed와 별도 역할 설정은 적용하지 않았다.

| 적용 파일 | 원본 파일 SHA-256 |
| --- | --- |
| `202610130002_account_deletion_mvp.sql` | `3B89A59501C98DCC00F47CF0E2836FB677289F10D71E70E743E044961BF816F9` |
| `202610130003_study_item_apply_today.sql` | `B35A252642735084724562165D7549CC946B8288E632C3F017B3739BE90AFE13` |
| `202610140001_daily_earned_points.sql` | `64397C2FCFA6EFE7DA596C0F4050B9BB8C861C6C2B8F137AFCBF30A1911B8A2C` |
| `202610140002_change_pin_cancels_reset.sql` | `28E4F84743053D6E0DCF587A3B8F0450B8632FC8F88D0E9F9EAE6D9402716EA2` |

적용 후 읽기 전용 검증:

- 원격 마이그레이션 24개, 대상 4개 이력 존재. 최종 dry-run 미적용 파일 0개.
- `create_study_item(uuid,jsonb,boolean)`의 인자·반환형과 authenticated 실행 권한 확인.
- `daily_tasks.awarded_growth_points`는 nullable `numeric(10,6)`이며 음수 방지 제약 존재.
  `confirm_daily_tasks`의 해당 포인트 저장 로직 확인.
- `watch_account_deletion` 생성 및 service_role 실행 허용, anon/authenticated 실행 차단 확인.
- `list_pending_sensitive_actions`의 `processing boolean` 반환과 authenticated 실행 권한 확인.
- 삭제 claim 보호 트리거·영수증 인덱스·consumed 재시도 로직 확인.
- `change_parent_pin`의 대기 중 PIN 재설정 취소 로직 확인.
- 확인한 앱 RPC의 anon 실행 차단 유지. public 테이블 중 RLS 비활성 0개,
  authenticated의 PIN 자격증명 테이블 직접 SELECT 불가 유지.
- 주요 데이터 건수는 적용 전후 동일. 운영 컬렉션 36개, DEV 코드 0개 유지.

검증 SQL은 Git 제외 배포 폴더의 `verify-step2b.sql`에 보존했다. 이 검증은
함수 정의·시그니처·권한·컬럼과 집계 조회이며 실제 학습 mutation이나 계정 삭제를
실행하지 않았다. 앱 실기기 검증은 별도다.

Edge Function, Cron, Vault/secrets, OAuth 및 EAS 설정은 변경하지 않았다.
