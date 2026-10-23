# DEV-02 — 체험단 업데이트 배포

- 상태: REVIEW / Firebase 업데이트 배포 실행과 독립 결과 검수 완료. 제품의 잔여 기기 검증은 별도 유지.
- 승인: 2026-10-22 사용자 「체험단 업데이트 배포 해줘」. 검증한 APK5의 Firebase 업로드와 기존 체험단 배포 승인.
- APK: `outputs/dev02-build-20261022/ssaida-1.0.0-5.apk`, 119,704,600 bytes.
- SHA-256: `df37fb69e8d6cc5b5e50954e44f65eb0f977b345b7defbac2e427684a423276f`.
- 소스: `a45721a51e56ab04fbd1fa951af6b6b958558a98`, beta `1.0.0 (5)`.
- 릴리스 노트: `outputs/dev02-build-20261022/release-notes-5.txt`.
- 대상 프로젝트: `ssaida-732f2`, Android 앱 `1:709799668495:android:dca06f464aa568cd826c7a`.
- 실행: `/root`; 독립 검수: `/root/dev02_distribution_review`.
- 사전 독립 검수: 실제 APK 해시·버전·노트와 [빌드 검증 기록](DEV-02-20261022-beta-build.md) 정합성 PASS.
- 신규 계정 초기 설정·실제 통신 실패·새 OAuth·알림 경로 등의 기기 검증 한계는 유지한다. 배포 성공을 수신자 설치·실사용 성공으로 간주하지 않는다.

## 실행 결과

- 사전 조회: `ssaida-beta` 기존 그룹 5명, 그룹 릴리스 수 1. 프로젝트 전체 6명 중 그룹 밖 1명은 대상에서 제외.
- 검증된 APK와 준비한 릴리스 노트로 Firebase 신규 릴리스 생성.
- 릴리스 ID: `4v1cf39nb6tq8`, 버전 `1.0.0 (5)`.
- 업로드 후 원격 APK를 스트리밍으로 해시 검증: 위 SHA-256 및 119,704,600 bytes가 로컬 검증 파일과 일치.
- 배포 직전 그룹 인원수 5명 재확인. 개별 구성원의 전후 동일성까지 비교한 것은 아니며 현재 기존 그룹을 대상으로 실행.
- 배포 요청: `testerEmails: []`, `groupAliases: ["ssaida-beta"]`.
- Firebase `releases:distribute` 응답 **HTTP 200**, 수락 시각 **2026-10-22 20:40:23 KST**.
- 배포 후 그룹 테스터 5명 유지, 릴리스 수 **1 → 2**.
- [Firebase 콘솔](https://console.firebase.google.com/project/ssaida-732f2/appdistribution/app/android:com.ssaida.app/releases/4v1cf39nb6tq8).
- [기존 체험단용 업데이트 링크](https://appdistribution.firebase.google.com/testerapps/1:709799668495:android:dca06f464aa568cd826c7a/releases/4v1cf39nb6tq8).

근거: `outputs/dev02-distribute-20261022/preflight.json`, `release-result.json`.
개인 이메일·인증 토큰·서명 다운로드 URL은 결과에 저장하지 않았다. 앱 코드·DB/API·인증/서명 설정·Git 원격 변경 없음.
별도 신규 테스터 추가·개별 외부 메시지는 수행하지 않았다. Firebase 업데이트 배포에 따른 알림은 서비스 동작 범위다.
현재 확인 수준은 Firebase의 배포 요청 성공이며 실제 이메일 수신·테스터별 업데이트 설치·실사용 결과는 미확인이다.

## 독립 배포 후 검수

`/root/dev02_distribution_review`가 20:42 KST 독립 원격 GET으로 릴리스 ID/버전·노트 일치,
그룹 테스터 표시 수와 실제 목록 수 각 5명, 그룹 릴리스 수 2를 재확인했다.
독립 로컬 APK 해시는 실행자가 검증한 원격 해시와 일치한다. 배포 HTTP 200은 실행 증거로 확인하며
검수자는 배포 요청을 재실행하지 않았다. 필수 지적 없음 / PASS.
근거: `outputs/dev02-distribute-20261022/independent-review.json`.
이번 업데이트 배포 작업은 완료했으며 DEV-02 전체 완료와 개별 설치 성공은 별도 판정한다.
