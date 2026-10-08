# plan.md

> 계획은 여기 적고, 구현은 "다음 작업"을 위에서부터 진행한다. 끝난 항목은 `[x]`로 표시하고 "완료"로 옮긴다.

## 현재 상태

- v0.1 완료: CLI 뼈대, CLAUDE.md 존재·길이 진단 (checkClaudeMd)
- 다음 마일스톤: v0.2 — 권한 설정 진단 (settings 존재, .env 읽기·쓰기 차단, 위험한 자동 허용, 우회 모드)
- 테스트 1파일 3건, typecheck·lint·test 모두 통과

## 다음 작업 (구현 예정)

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

## 완료

