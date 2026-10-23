# DEV-02 — 기존 공개 beta 설정 사전 검사

- 실행: 2026-10-22 / 20261022-beta-config-preflight.
- 과제 상태: REVIEW. 이번 로컬 사전 검사 및 독립 검수 PASS. 새 APK·실기기 검증은 미완료.
- 승인 범위: DEV-02 검증·배포 준비. 코드 작성·원격 빌드·업로드·설정 변경·초대·실메일 발송 없음.
- 조정자: 예약 채팅 01a12eee-6360-7fe1-aa67-3f816397f27d /root. 이전 소유 채팅 idle 및 activeTask null을 확인하고 공용 상태에 인계 기록.
- 검사 담당: /root/beta_config_preflight. 검수 담당: /root/beta_config_review.
- 기준/결과 SHA: a45721a51e56ab04fbd1fa951af6b6b958558a98, 브랜치 codex/dev02-onboarding.
- 작업 경로: C:/Users/rchani/.codex/worktrees/dev02-onboarding/ssaida-app.
- 기존 Git 상태: 격리 worktree에는 AGENTS.md 수정만 있으며 보존. 원본의 기존 문서·이미지·미추적 변경도 보존.

## 해결한 준비 공백

이전 기록은 .env.beta.local 부재로 실제 공개 beta 설정 검사를 미실행으로 남겼다.
기존 outputs/android-release/.env.production을 재사용하면 파일 변환·복사나 새 환경 파일 생성 없이 검사할 수 있음을 확인했다.
실제 값은 출력하거나 이 보고서에 저장하지 않았다. 해당 파일은 기존 Git/EAS 제외 대상이다.

파일은 허용 공개 변수 4개만 포함하며 빈 값이 없다.

- EXPO_PUBLIC_AUTH_REDIRECT_URI
- EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF
- EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY
- EXPO_PUBLIC_PRODUCTION_SUPABASE_URL

나머지 EXPO_PUBLIC_APP_ENV=production 및 EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN=false는 기존 wrapper의 기본값이다.
기존 scripts/build-beta.mjs와 environment-policy.js를 읽어 check 모드가 원격 CLI를 실행하지 않는 것을 확인했다.
기존 eas-production.cjs는 실행하지 않았다.

## 이번 검증

```powershell
& 'C:/Users/rchani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' `
  'C:/Users/rchani/.codex/worktrees/dev02-onboarding/ssaida-app/scripts/build-beta.mjs' `
  'C:/Users/rchani/workspace/ssaida-app/outputs/android-release/.env.production' check
```

결과: exit 0, `PASS beta production configuration (values omitted)`.
과거 prep-env-checks.json의 결과를 전용하지 않고 이번에 실행했다. 코드 변경이 없어 전체 회귀는 반복하지 않았다.

## 변경·운영 영향·재개 조건

- 앱 코드·DB·API·원격 설정 변경 없음. 소스 diff/신규 코드 패치 없음.
- 변경 문서: 이 실행 기록, docs/automation/state.json, docs/development-backlog.md.
- 검사 통과는 로컬 정책 준수 근거다. 현재 EAS 원격 환경 일치·서비스 접근 성공·서명·최신 versionCode·APK 생성·실기기 성공의 근거가 아니다.
- 다음 순서: 기존 EAS 원격 공개 설정/서명/최신 버전 읽기 확인 → 확인된 커밋의 새 beta 빌드 실행안 → 명시적 승인 후 원격 빌드/업로드 → 새 APK 정적 검사와 승인된 계정·데이터의 실기기 확인.
- 빌드·배포 승인 전 업로드하거나 초대하지 않는다. DEV-01/DEV-02 REVIEW 유지, DEV-03 이후 자동 착수 없음.
- 마케팅 참고: CONTENT-01 v3는 앞선 사용자 승인으로 16:32에 게시됐으며 이번 예약의 신규 외부 실행이 아니다. 문의·모집 성과는 미확인.

## 독립 검수 결과

/root/beta_config_review가 실제 wrapper·정책·eas.json과 Git 상태를 읽고 같은 check 명령을 독립 재실행했다. exit 0, PASS. 필수 지적 없음, 수정 0회. 로컬 형식·정책 정합성만 확인하며 EAS 원격 일치·키의 서버 유효성·새 APK/실기기 성공은 미확인이라는 한계를 재확인했다.
