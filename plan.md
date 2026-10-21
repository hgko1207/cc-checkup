# plan.md

> 계획은 여기 적고, 구현은 "다음 작업"을 위에서부터 진행한다. 끝난 항목은 `[x]`로 표시하고 "완료"로 옮긴다.

## 현재 상태

- PR1 완료(PR #2): 사내 표준 정의 파일(--standard), 표준 규칙(필수 섹션·파일·플러그인), 점수, 플러그인 설정 추가·plan.md 만들기
- PR2 완료(PR #3): Claude로 반영 실행기(src/claude-runner.ts)
- PR3 완료: 설치형 앱(src/app, Electron 45) + E2E + Windows 설치 파일 + 시범 EVAL 체크리스트
- 다음: 시범 2팀 적용(docs/eval-checklist.md). 남은 결정: 라이선스, 사내 배포 경로·코드 서명, 사내 계정의 claude -p 허용·비용
- 테스트 12파일 227건 + E2E 2건, typecheck·lint·test·build·dist:win 통과

## 다음 작업 (구현 예정)

> 근거: 사내 Claude 세팅 점검 설치형 프로그램 설계 (`~/.gstack/projects/cc-checkup/khkkh-main-design-20261020-230029.md`, office-hours 2026-10-20 승인 + eng review 2026-10-21 결정 R1~R8). 작업 번호는 그 문서의 Implementation Tasks와 같다. PR1=T1~T4, PR2=T5, PR3=T6~T10.

## 완료

### [x] PR3 설치형 앱 (T6~T10)

- 목표: 폴더 선택 → 사내 표준 대비 진단(점수·영역 4개) → 바로 고치기·Claude로 반영(미리 보기 → 적용/취소) → 되돌리기를 Windows 설치형 앱으로 (R1·R6)
- 변경할 파일: `src/app/`(api·channels·core·main·preload.cts·ui/), `scripts/`(copy-ui, run-app), `test/app-core.test.ts`·`test/e2e/app.spec.ts`, `package.json`(빌드·electron-builder), tsconfig·vitest·playwright 설정, `docs/eval-checklist.md`. 엔진: commitGuide를 report.ts로 옮김(CLI·앱 공용), Finding.claudeVars(빠진 섹션 이름을 지시문에)
- 안 하는 것: 문서·기획 폴더 모드(시범 후), 자동 업데이트, 코드 서명, 아이콘
- 결과(2026-10-21): 단위 227건(앱 core 29건: 채널 목록, 보안 설정, 폴더 경로 검증, 화면 데이터, 미리 보기→적용·되돌리기, 가짜 claude 반영·적용 기록, 리포트) + Playwright E2E 2건(렌더러에 require·process 없음·노출 함수 9개·허용 안 된 폴더 거부 / 폴더 열기→진단→바로 고치기→되돌리기). `npm run dist:win`으로 `release/CC Checkup Setup 0.1.0.exe`(약 112MB, 서명 없음) 생성, 설치본 실행 파일로 진단까지 확인. `npm pack --dry-run`에 dist/app 없음.
- 설계와 다른 점:
  - 노출 함수가 5개가 아니라 8개(+진행 이벤트): 상태 읽기(getState), 사내 표준 파일 선택(pickStandard), 리포트 저장(saveReport)을 더했다. 모두 입력을 검증하고 폴더는 선택 창·최근 목록에서 고른 것만 받는다.
  - 바로 고치기·되돌리기는 미리 보기와 적용을 나눴고, 적용 때 다시 계산해 미리 본 것과 다르면 거절한다.
  - "Claude로 반영" 적용률(Success Criteria) 계산용으로 적용/취소를 `%APPDATA%cc-checkupclaude-decisions.jsonl`에 남긴다(파일 내용은 남기지 않음).
- 실제 claude로 앱 화면에서 확인(2026-10-22, 임시 폴더, 예시 표준): Claude로 반영 → 적용 → 점수 40→45 → 되돌리기 바이트 동일. 1회 33~40초, $0.15. 첫 실행에서 근거 없는 규칙("TypeScript로 전환하지 않는다" 등)을 지어내 기본 지시문에 "근거 없으면 TODO로 남김"을 더했고, 다시 실행해 코드에서 찾은 규칙만 적고 나머지는 TODO로 남는 것을 확인.
- 주의: VS Code 터미널은 ELECTRON_RUN_AS_NODE=1을 물려줘 `electron .`이 Node로 뜬다. `npm run app`(scripts/run-app.mjs)과 E2E는 이 값을 빼고 실행한다.

### [x] PR2 Claude로 반영 실행기 (T5)

- 목표: 표준의 claudeTasks 작업을 claude -p로 대상 파일만 고치게 실행하고, 전후 비교·diff·유지/취소·중단·10분 제한·동시 실행 차단을 엔진으로 제공 (R2·R5·R7·R8)
- 변경할 파일: `src/claude-runner.ts`(신규), `src/backup.ts`(createBackup·confirmBackup·restoreBackup로 나눔, applyWithBackup은 이를 사용), `src/standard.ts`(claudeTasks 대상 경로 검사), `test/claude-runner.test.ts`·`test/fixtures/fake-claude.mjs`(신규)
- 안 하는 것: 화면·IPC(PR3), CLI 옵션(설계상 Claude로 반영은 앱 기능)
- 결과(2026-10-21): 테스트 11파일 198건 통과(실행기 36건: 인자, 대상 경로 검사, stream-json, Windows claude.cmd 찾기, 스냅샷 비교, ready·keep→--undo, discard, 새 폴더, 변경 없음, 대상 밖 변경, 실패 종료, result 오류, 시간 초과 시 하위 프로세스 종료, 중단·동시 실행 차단, 20만 상한, 실행 실패, 잘못된 작업). 실제 claude 2.1.83로 임시 폴더에서 2회 확인($0.32):
  - `Edit(./CLAUDE.md)`는 sub/CLAUDE.md까지 허용됨 → 전후 비교가 잡아 되돌림. `Edit(/CLAUDE.md)`로 바꿔 폴더 맨 위만 허용되는 것을 확인 (eng review 미확인 항목 해소)
  - index.js 편집·notes.txt 생성·.env 읽기·Bash는 모두 거부됨
- 설계와 다른 점: 대상 밖 변경은 "전부 되돌리기" 대신 반영을 막고 대상 파일만 되돌린 뒤 목록으로 알린다. 스냅샷(R7)은 크기·시각만 있어 대상 밖 파일의 원본 내용이 없고, 새 파일은 실행 중 사용자나 편집기·개발 서버가 만든 것일 수 있어 지우면 남의 작업을 잃는다.

### [x] PR1 사내 표준 정의 파일 + 표준 규칙 + 점수 + 바로 만들기·설치하기 (T1~T4)

- 목표: 진단 기준을 표준 정의 파일에서 읽고(기본 내장 + `--standard <파일>` 우선, 실패 시 기본), CLAUDE.md 필수 섹션·필수 파일·필수 플러그인을 진단하고, 점수(0~100)를 보여 주며, plan.md 템플릿 만들기와 플러그인 설정 추가를 고치기 후보로 낸다. 기본 표준으로는 v0.3과 같은 진단 결과(기존 테스트 120건 통과).
- 변경할 파일: `src/standard.ts`·`src/standard-default.ts`(신규, 기본 표준을 TS로 둬 빌드에 포함), `standard/example-company.json`(TF용 예시), `src/checks/standard-rules.ts`(신규), `src/score.ts`(신규), `src/env-rules.ts`, `src/checks/claude-md.ts`, `src/checks/settings.ts`, `src/types.ts`, `src/diagnose.ts`, `src/fix.ts`, `src/report.ts`, `src/cli.ts`, `test/*`
- 안 하는 것: Claude 실행기(PR2), 앱(PR3), 공유 경로 설정 UI(PR3 — PR1은 CLI `--standard`).
- 멈춤 조건: 기본 표준으로 기존 테스트가 깨지면 멈추고 원인을 본다.
- 결과(2026-10-21): typecheck·lint·build 통과, 테스트 10파일 159건 통과(기존 120건은 기본 표준으로 그대로 통과). 예시 사내 표준으로 cc-checkup·ai-cost-calc 읽기 전용 진단 확인(ai-cost-calc는 화면 있는 프로젝트로 판정돼 DESIGN.md 요구). 기본 표준은 TS(src/standard-default.ts)로 둬 빌드에 포함.

### [x] v0.3 위험 리포트 + 선택형 고치기 (T1~T10)

- 목표: 설계의 진단 9개·고치기 2개·`--undo`·`--report`가 동작하고 `npm run typecheck && npm run lint && npm run test` 통과
- 변경할 파일 (eng review D1 배치):
  - `src/checks/settings.ts` — 진단 2·4·5·6·7·8, settings.json 읽기(BOM 제거·서식 감지·타입 검사) (T1, T3, T6)
  - `src/checks/claude-md.ts` — 진단 1(두 위치)·9 (T4)
  - `src/checks/git.ts` (신규) — 진단 3, git 실행 실패=확인 불가 (T5)
  - `src/env-rules.ts` (신규) — deny 규칙 gitignore식 판정, 실제 .env 탐색(링크 무시·20만 상한), 하위 settings 경로 (T2)
  - `src/backup.ts` (신규) — 경로 정규화, 백업·manifest·롤백, `--undo` 역순·undoneAt (T7)
  - `src/fix.ts` (신규) — 고치기 후보("더하기만" 기준), 서식 보존 텍스트 삽입, diff (T8)
  - `src/prompt.ts` (신규) — TTY 판정, 번호 선택·[y/N] (T9)
  - `src/diagnose.ts` (신규) — 진단 실행 순서와 공유 입력(settings·탐색·git) 모음. 배치안에 없던 파일: CLI 흐름과 진단을 나눠 테스트하려고 추가
  - `src/report.ts`, `src/cli.ts`, `src/types.ts` — 묶음 출력, `--report` 표식·거부, 착지 링크, 커밋 안내 (T9, T10)
  - `test/*.test.ts` — 설계의 테스트 계획(Edge Cases) 기준
- 안 하는 것: T11(package.json 공개 준비)·T12(착지 페이지) — 소스 공개 여부·호스팅 위치 결정 후. 하위 settings 진단, 점수, 스킬.
- 멈춤 조건: 설계와 다른 동작이 필요해지면 멈추고 묻는다.
- 결과(2026-10-20): typecheck·lint 통과, 테스트 7파일 120건 통과, build 통과. 임시 사본으로 고치기→되돌리기 왕복이 바이트 단위로 원본과 같음을 확인. ai-cost-calc·blog-seo-check는 읽기 전용(비TTY)으로 진단만 실행.
- 남은 것: T11·T12(Open Question 결정 후), 사람이 실제 터미널에서 돌려 보는 관찰(설계 The Assignment).

### [x] v0.2 권한 설정 진단 — checkSettings 구현

- 목표: `npm run test`에서 settings 관련 테스트 전부 통과, `npm run typecheck`·`npm run lint` 통과
- 맥락: PRODUCT.md v0.2 범위. 팀이 안전하게 쓰려면 권한 설정이 핵심이다
- 변경할 파일:
  - `src/checks/settings.ts` (신규) — checkSettings: Check 함수. 아래 5개 진단을 하나의 Check에서 반환
    - `settings/missing`: `.claude/settings.json` 존재 여부 (fail)
    - `settings/env-read-deny`: `permissions.deny`에 `.env` Read 규칙이 있는지 (fail)
    - `settings/env-edit-deny`: `permissions.deny`에 `.env` Edit 규칙이 있는지 (warn)
    - `settings/risky-allow`: `permissions.allow`에 위험한 자동 허용이 없는지 (warn). 대상: `Bash` bare, `Bash(*)`, `Bash(git restore*)`, `Bash(git reset*)`, `Bash(git clean*)`, `Bash(git push*)`, `Bash(rm -rf*)`
    - `settings/bypass-disabled`: `permissions.disableBypassPermissionsMode`가 `"disable"`인지 (warn)
  - `src/cli.ts` — CHECKS 배열에 `checkSettings` 추가, import 추가
  - `test/settings.test.ts` (신규) — 테스트 케이스:
    1. `.claude/settings.json` 없으면 `settings/missing` fail
    2. deny에 `.env` Read 규칙 있으면 ok, 없으면 fail
    3. deny에 `.env` Edit 규칙 있으면 ok, 없으면 warn
    4. allow에 `Bash(*)` 있으면 warn (위험 목록 보여줌)
    5. allow에 `Bash(git push *)` 있으면 warn
    6. allow가 안전하면 ok
    7. `disableBypassPermissionsMode: "disable"` 있으면 ok, 없으면 warn
- 참조: `src/checks/claude-md.ts`, `test/claude-md.test.ts` — 같은 패턴
- 검증: `npm run typecheck && npm run lint && npm run test`
- 안 하는 것:
  - `settings/powershell-pair` (v0.2 범위 아님, PRODUCT.md에는 있지만 이번에 안 함)
  - settings.json JSON 문법 검사 (범위 밖)
  - `permissions.ask` 섹션 검사 (ask는 사용자에게 묻는 것이므로 위험하지 않음)
- 멈춤 조건:
  - settings.json 파싱에서 예상 밖 구조가 나오면 (예: permissions가 객체가 아닌 경우) 멈추고 묻는다
  - PRODUCT.md에 적힌 규칙 형식(`Read(**/.env)`)과 실제 Claude Code가 다를 수 있으면 묻는다

#### 구현 세부

**규칙 매칭 로직:**
- `.env` Read deny 판정: `permissions.deny` 배열에서 `Read(` 뒤에 `.env`를 포함하는 항목이 하나라도 있으면 통과
- `.env` Edit deny 판정: 같은 방식으로 `Edit(` + `.env`
- 위험한 allow 판정: `permissions.allow` 배열에서 아래 패턴에 매치되는 항목을 모두 찾아 목록으로 보여줌
  - bare `"Bash"` (괄호 없음)
  - `"Bash(*)"` (전체 허용)
  - `"Bash(git restore"`, `"Bash(git reset"`, `"Bash(git clean"`, `"Bash(git push"`, `"Bash(rm -rf"` 로 시작
- bypass 판정: `permissions.disableBypassPermissionsMode === "disable"`

**settings.json이 존재하지만 JSON 파싱 실패 시:** `settings/missing`을 fail로 반환하되 message에 "파싱 실패"를 명시

