# cc-checkup

저장소의 Claude Code 팀 세팅을 한국어 위험 문장으로 진단하고, 정해진 안전 수정은 확인 후 적용하는 CLI. 영업 도구·블로그 무료 도구로 쓴다. 설계: `docs/designs/risk-report-wedge.md`

- 스택: TypeScript (Node.js ESM), vitest, eslint, prettier
- 답변은 한국어로, 코드 식별자는 영문으로 쓴다.

## 구조

- `src/` — CLI 흐름(cli), 진단 실행(diagnose), .env 규칙 판정(env-rules), 고치기(fix), 백업·되돌리기(backup), 질문(prompt), 출력(report), 사내 표준 정의(standard·standard-default), 점수(score), Claude로 반영 실행기(claude-runner), 폴더 종류 판별(kind), [자세히] 설명(details), 차단 훅 템플릿 읽기(hook-template)
- `standard/` — 사내 표준 정의 파일 예시 (진단 기준은 코드가 아니라 표준 파일에서 읽는다)
- `src/checks/` — 진단 항목별 체크 함수 (Check 타입)
- `src/templates/hooks/` — 저장소에 넣는 위험 명령 차단 훅 (team-ai-kit 복사본, 린트·포맷 제외, 원본을 고치면 맞춘다)
- `src/app/` — 설치형 앱(Electron). main(창·보안·IPC), preload.cts(고정 함수만 노출), core(입력 검증·엔진 연결, 단위 테스트 대상), ui/(화면, textContent로만 렌더링)
- `test/` — vitest 테스트
- `docs/` — 제품 문서, 팀 가이드
- 새 진단 항목은 `src/checks/`에 `src/checks/claude-md.ts`와 같은 패턴으로 만든다.

## 명령

| 용도      | 명령               |
| --------- | ------------------ |
| 설치      | `npm install`      |
| 빌드      | `npm run build`    |
| 실행      | `node dist/cli.js` |
| 앱 실행   | `npm run app`      |
| 앱 E2E    | `npm run test:e2e` |
| 설치 파일 | `npm run dist:win` |

## 검증 명령

`verify` 스킬이 이 순서로 실행한다. 실제로 실행해 확인한 명령만 적는다.

1. 타입체크: `npm run typecheck`
2. 린트: `npm run lint`
3. 테스트(전체): `npm run test`
4. 앱을 고쳤으면: `npm run test:e2e`

## 원칙

1. **코딩 전에 생각한다** — 모르면 모른다고 한다. 방법이 여럿이면 선택지를 먼저 보인다.
2. **단순하게** — 요청을 푸는 최소한의 코드만. 나중을 위한 추상화를 미리 넣지 않는다.
3. **요청 범위만 고친다** — 옆 코드를 겸사겸사 고치지 않는다. 다른 개선거리는 따로 제안한다.
4. **검증될 때까지** — 완료 기준을 정하고, 실제 실행 결과로 확인될 때까지 반복한다.

## 작업 방식

- 파일 여러 개를 고치는 작업은 `plan-feature`로 계획을 세워 `plan.md`에 적고, 승인 후 구현한다.
- `plan.md` 항목을 끝내면 `[x]`로 표시하고 "완료"로 옮긴다.
- 구현 후 `verify`로 검증한다. 검증하지 않고 완료라고 말하지 않는다.
- 작업이 끝나면 대화를 끊고, 다음 작업은 `plan.md`와 이 파일을 근거로 새로 시작한다.

## 작업 진행 방식

- 내 입력이 필요 없는 단계면 계속 진행한다.
- 진행 상황 메모는 다음 작업과 같은 메시지에 쓴다.
- 나 없이는 진행할 수 없을 때, 또는 삭제처럼 되돌리기 어려운 작업 전에만 멈추고 묻는다.

## 코딩 규칙

- Check 타입 함수(`(ctx) => Finding[]`)를 export하고 diagnose.ts의 CHECKS 배열에 등록한다.
- 설정 파일을 쓰는 경로는 반드시 diff → `[y/N]` → backup.ts 백업을 거친다. 터미널이 아니면 쓰지 않는다.
- ESM import에 `.js` 확장자를 붙인다 (NodeNext 해석).
- strict + noUncheckedIndexedAccess가 켜져 있다.

## 커밋 규칙

- Conventional Commits (feat, fix, chore, docs 등). 범위는 모듈 이름.
- 기본 브랜치에 직접 커밋하지 않는다.

## 하지 말 것

- dist/ 안의 파일을 직접 수정하지 않는다 (빌드 산출물).
- 테스트를 통과시키려고 테스트를 지우거나 건너뛰게 바꾸지 않는다.
- 비밀값(.env, 키)을 읽거나 코드에 넣지 않는다.

## 참고 문서

- `docs/PRODUCT.md` — 제품 목적, 진단 항목, 점수 설계
- `docs/ai-workflow.md` — 팀 AI 사용 가이드

<!-- 기준: team-ai-kit v0.2. 100줄 안쪽 유지. 규칙 하나가 5줄을 넘으면 docs/로 빼고 링크만 남긴다. -->
