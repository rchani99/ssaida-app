# DESIGN-01-APP — 학습 시간 기본값 UI 적용

2026-10-26. 상태 **REVIEW** — 코드 구현·로컬 검증·독립 검수 완료, Android 기기 확인은 남아 있다. 배포 보류 유지.

## 범위와 기준

사용자가 이 개발 채팅에서 DESIGN-01 앱 적용·기존 저장 로직 유지·에이전트 구현/검수를 직접 승인했다. 이전 전달 요청 단계의 자동 승인 차단은 이 직접 승인으로 해소됐으며, 차단 당시에는 소스 변경이 없었다.

- 브랜치 `codex/daily-target-design`, 기준 `95ae0e794b15d6d2ad06c573b992a5435cc294c8`.
- 기준은 문제집 폼 개선 [PR #4](https://github.com/rchani99/ssaida-app/pull/4)의 head다. 해당 변경을 보존한 별도 브랜치이며 이번 PR은 그 브랜치에 대한 추가 diff로 검토한다. master 병합을 수행하지 않는다.
- DESIGN-01 v1의 입력 5개 해시가 원본과 일치했다. 작업 기준과의 해시 차이는 CRLF/LF뿐이며 정규화 후 내용이 동일했다.
- 구현 담당과 검수 담당은 각각 `daily_target_implementation`, `daily_target_review`로 분리했다. 하위 재위임 없음.

## 변경

`src/features/learning/components/daily-target-settings-panel.tsx` 한 파일에 국한한다.

- 30·45 / 60·90분을 동일 폭 2열, 직접 입력을 전체 폭으로 표시.
- 기존 Lucide Check를 장식으로 표시하고 선택/비활성 상태를 접근성 속성으로 제공.
- 시안의 카드·여백·글자 위계·입력 단위·저장 버튼과 오류 색상 적용. 공용 컨트롤/토큰 변경 없음.
- draft/custom 계산, 같은 값 재선택 저장, 숫자 필터/3자리 제한/number-pad, 저장 시 10~240 정수 검증을 유지.
- mutate 인수, 성공/실패 문구, 성공 후 reset, 실패 입력 유지, 저장 비활성 조건을 유지.
- 자동 저장·새 dirty 비교·DB/API/RPC·오늘 계획 및 이후 계획 적용 정책 변경 없음. 기존 설정 ScrollView와 keyboardShouldPersistTaps를 유지.

## 이번 검증

- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- 단일 패널 ESLint 및 Prettier check: PASS.
- `node scripts/settings-screen-ui-regression.mjs`: PASS — 설정 목록/상세 이동 등의 기존 회귀이며 패널 API 검증은 아님.
- 로컬 fixture: 최초 비활성, 직접 입력만 선택했을 때 비활성, 같은 프리셋 재선택 저장, 숫자 필터, 10/240 경계·빈값/5/9/241 거부, 데이터 없음/저장 중 비활성, 성공 reset, 실패 입력 보존/재시도 PASS. API 훅을 fixture로 대체했으며 운영 호출 없음. 독립 검수 담당도 행동 검증을 별도 실행해 PASS.
- 실제 컴포넌트 소스를 React Native Web으로 렌더: 360px 기본, 320px 직접 입력, 320px 글자 크기/행간 1.3배 오류 상태. 동일 폭/2열/최소48 터치영역/전체 폭 직접 입력/수평 넘침 없음 확인. 화면 높이360px에서 저장 버튼까지 스크롤 가능한 것을 확인.
- 확대 PNG 최초 캡처에 제목 위치 잔상이 있었으나 DOM/문자 Range는 정상. 글꼴 준비와 두 렌더 프레임을 기다린 최종 `320-large-error-stable.png`를 사용한다. 초반 fixture import를 수정한 후 검증 통과.
- `git diff --check`: PASS.

로컬 렌더/fixture 도구와 증거는 원본 저장소의 `outputs/design-app/DESIGN-01-20261026/`에만 보관하며 공개 커밋에는 포함하지 않는다. 이는 전체 앱 실행이 아닌 패널의 React Native Web 서버 렌더이며 Check만 장식 SVG 대체를 사용했다. CSS 글자 크기/짧은 뷰포트는 Android 시스템 fontScale/키보드 검증을 대체하지 않는다. 기존 빈 message 표현에서 RN Web 빈 텍스트 경고가 관찰됐으며 저장 결과나 렌더 배치 실패로 나타나지 않았다.

## 독립 검수와 남은 확인

코드 diff·저장 행동 보존·3개 최종 이미지·확대 DOM 및 공개 문서 독립 검수 PASS. 필수 수정 지적과 민감정보 발견 없음. 검수 담당 daily_target_review가 실제 파일과 픽셀을 확인했다. 구현 커밋: fd58894.

실제 Android 작은 화면/시스템 글자 확대/키보드 열린 상태 저장 접근/스크린리더 읽기 순서, 실제 저장 API는 이번에 검증하지 않았다. 앱 설치·리로드·새 APK/EAS 빌드·Firebase 업로드·체험단 배포·master 병합은 수행하지 않았다. 기존 APK6는 이 UI 변경을 포함하지 않는다.

다음은 이 소스를 포함한 테스트 앱에서 남은 native 검증이다. 원격 빌드·실제 배포는 이번 UI 적용 승인으로 실행하지 않는다. 기존 사용자 데이터는 변경하지 않았다.

참고 API: [Expo v57](https://docs.expo.dev/versions/v57.0.0/), [RN 0.86 TextInput](https://reactnative.dev/docs/0.86/textinput), [Pressable](https://reactnative.dev/docs/0.86/pressable), [접근성](https://reactnative.dev/docs/0.86/accessibility), [Flexbox](https://reactnative.dev/docs/0.86/flexbox).
