# 프로젝트 관리 문서 구축 결과

2026-10-22. 사용자의 최종 문서 구축 요청과 후속 DEV-01~27 원문을 반영했다.
이번 작업은 문서만 변경했으며 기능 개발 착수·실운영 검증 완료를 의미하지 않는다.

## 생성한 문서

| 파일 | 역할 |
| --- | --- |
| [product-decisions.md](product-decisions.md) | 결정 상태·구현 상태·관련 과제·근거·미결정 정책 |
| [development-backlog.md](development-backlog.md) | 원본 27개 과제, 우선순위, 상태, 완료 조건, 의존성, 승인 경계 |
| [project-status.md](project-status.md) | 코드·브랜치·배포·기존 기능 분석과 증거의 한계 |
| [project-management-audit.md](project-management-audit.md) | 이번 변경 파일 목록·검증·미결정 사항 |

## 갱신한 기존 문서

| 파일 | 통합한 내용 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | 기존 Expo 지침 보존, 최신 문서 우선순위·문서 전용 범위·승인 Sprint·위험별 검증·Git·보고 규칙 |
| [README.md](../README.md) | 관리 문서 진입점, 기존 14일 구현과 목표 정책 구분, Firebase 최초 조회와 후속 기록 구분 |
| [account-deletion-policy.md](account-deletion-policy.md) | 14일 설명을 기존 구현/운영 이력으로 표시, 새 목표 정책 링크 |
| [production-db-deployment.md](production-db-deployment.md) | 과거 운영 적용과 신규 목표/현재 재확인 구분 |
| [beta-distribution.md](beta-distribution.md) | 신규 DEV-01 연결, 후속 APK (4) 검증 미완료와 최초 기록 구분 |
| [marketing/launch-paid-20-daily-plan.md](marketing/launch-paid-20-daily-plan.md) | 최신 개발 백로그 우선, 기존 DEV 번호/자동 탐색 지시의 역사 구분 |
| [automation/development-workflow.md](automation/development-workflow.md) | 승인된 과제만 실행, P2/P3 제한, 표준 상태, 기존 큐 이관 전 자동 재개 금지 |
| [automation/configuration-audit-2026-10-22.md](automation/configuration-audit-2026-10-22.md) | 최종 제품 백로그 이전의 설정 점검 이력 표시 |
| [automation/runs/DEV-01-20261022T030504Z.md](automation/runs/DEV-01-20261022T030504Z.md) | LEGACY-AUTO-01 표시, 과거 다음 과제의 현재 실행 권한 오인 방지 |

기존 문서의 구현·운영·검증 본문은 보존하고 최신 기준을 연결했다. 위 목록 외의 기존
미커밋 마케팅 수정·이미지·로그는 이번 변경으로 포함하거나 정리하지 않았다.
기존 자동화 JSON, 예약 설정, 실행 패치와 worktree도 그대로 두었다.

## 검증

- DEV-01~27 번호·제목·P0(9개)/P1(7개)/P2(7개)/P3(4개)를 사용자 제공 목록과 대조했다.
- 상세 과제 27개 각각의 ID/우선순위·목표·상태·구현 여부·완료 기준·선행 과제·관련 자료·승인 여부를 확인했다.
- 상태값은 TODO/IN_PROGRESS/BLOCKED/REVIEW/DONE만 사용하며 P2/P3 명시 승인 조건을 검사했다.
- 백로그에 DEV-28을 등록하지 않았다. 제외 정책은 AGENTS.md와 제품 결정에만 남겼다.
- 새 제품 결정/백로그/현황 문서의 로컬 링크와 제목 anchor를 검사했다. 관련 코드/다른 브랜치 참조를 대조했다.
- `git diff --check` 통과. 새 문서는 구조·링크·상태 정합성을 별도로 확인했다.
- 문서 외 추적 파일 530개의 경로+내용 해시가 분석 시작 시점과 마지막 검사에서 일치했다.
  앱 코드·테스트 코드·DB 정의·설정 파일에 이번 변경이 없음을 확인했다.
- 독립 검수 `audit_account_policy`: 삭제/다자녀 근거, 정책·승인·상태/미완료 구분 검토, 필수 수정 없음.
- 독립 검수 `audit_release`: 배포·자동화 번호 충돌·승인 범위·27개 필드 검토, 필수 수정 없음.
  선택 개선으로 예약 상태 설명에 “이전 점검 이력, 이번 재조회 아님”을 추가했다.
- 기능 코드 변경이 없어 앱 전체 회귀·빌드·DB/실기기 검증은 재실행하지 않았다.

## 확인된 상태와 남은 결정

1. DEV-01: beta 빌드/업로드 기반과 APK (4) 기록 존재. 같은 APK의 실기기 검증과 체험단 배포 결과가 남아 IN_PROGRESS다.
2. DEV-03: 별도 브랜치의 이메일 인증 기반에도 14일 유예가 남아 즉시 실행 전환 미완료다. DEV-03~06은 Firebase 이후 재개한다.
3. 기존 부모 대시보드·계획·숙제·미완료·성장/도감·기록 기능은 재사용 대상이다. 신규 개선 요구의 완료로 처리하지 않았다.
4. 기존 유예 삭제 요청의 전환/취소 경계, 보관 기간·실메일 운영 조건, 현실 보상 포인트 세부 규칙, 다자녀/구독 정책 등이 미결정이다.
5. 다음 기능 구현 Sprint/과제의 명시적 범위는 아직 승인되지 않았다. 최우선 후보는 DEV-01이며 P2/P3는 승인 전 구현하지 않는다.

정책별 상세 미결정 목록은 [제품 결정](product-decisions.md#미결정-사항과-결정-전-경계)을 따른다.
운영 DB/함수·실계정 삭제·실결제·실메일·Firebase 변경·원격 push를 수행하지 않았다.
이번에는 커밋하지 않았으며, 이후 커밋 시에도 기존 사용자 변경과 구분해 관련 파일/변경만 명시적으로 선택한다.
