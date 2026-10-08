# cc-checkup 제품 문서

## 1. 왜 만드나

- **영업 도구**: "AI 코딩 팀 세팅" 서비스 상담 전에 고객 저장소 상태를 숫자와 목록으로 본다. 견적의 근거가 되고, 세팅 후 다시 돌려 전후를 비교한다.
- **블로그 무료 도구**: 개인 개발자가 자가 진단에 쓰고, 팀 도입 문의로 이어지는 입구가 된다.
- **기준의 출처**: 진단 기준은 team-ai-kit(팀 표준 세팅 키트)의 규칙과 블로그 hgko-dev.tistory.com의 Claude Code 글을 따른다.

## 2. 비슷한 도구와의 차이

영문 린터가 이미 여럿 있다: [claudelint](https://claudelint.com/), [cclint](https://github.com/carlrannaberg/cclint), [claudecode-linter](https://github.com/retif/claudecode-linter), [Claude_Linter](https://github.com/Santhosraj/Claude_Linter).
이것들은 설정 파일 문법·충돌을 넓게 검사한다. cc-checkup은 범위를 좁힌다.

- **한국어** 메시지와 고치는 방법
- **팀 도입 준비도** 관점: 계획 파일, 검증 명령, 비밀 파일 차단, 위험 명령 통제처럼 "팀이 안전하게 같은 방식으로 쓰는가"
- **점수** 하나로 상태를 요약하고 전후 비교
- Windows 팀 고려: Bash 권한 규칙에 PowerShell 짝이 있는지

## 3. 진단 항목

| id                          | 무엇을 보나         | 통과 기준                                                                               | 실패 시     | 가중치 |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------- | ----------- | ------ |
| `claude-md/missing`         | CLAUDE.md 존재      | 루트에 있음                                                                             | fail        | 15     |
| `claude-md/too-long`        | CLAUDE.md 길이      | 200줄 이하 (100줄 권장)                                                                 | warn        | 5      |
| `claude-md/verify-commands` | 검증 명령           | "검증 명령" 섹션 또는 test·lint·typecheck 명령이 적혀 있음                              | fail        | 10     |
| `claude-md/do-not`          | 금지 사항           | "하지 말 것" 섹션이 있음                                                                | warn        | 5      |
| `settings/missing`          | 팀 권한 설정        | `.claude/settings.json` 있음                                                            | fail        | 10     |
| `settings/env-read-deny`    | 비밀 파일 읽기 차단 | deny에 `.env` Read 규칙                                                                 | fail        | 10     |
| `settings/env-edit-deny`    | 비밀 파일 쓰기 차단 | deny에 `.env` Edit 규칙                                                                 | warn        | 5      |
| `settings/risky-allow`      | 위험한 자동 허용    | allow에 `git restore`·`git reset`·`git clean`·`git push`·`rm -rf`·`Bash(*)`·`Bash` 없음 | warn        | 10     |
| `settings/bypass-disabled`  | 권한 우회 모드      | `disableBypassPermissionsMode: "disable"`                                               | warn        | 5      |
| `settings/powershell-pair`  | Windows 짝 규칙     | Bash 규칙마다 PowerShell 짝이 있음                                                      | warn (정보) | 0      |
| `hooks/present`             | 차단 훅             | settings의 hooks 또는 팀 플러그인(team-ai) 활성                                         | fail        | 10     |
| `plan/present`              | 작업 계획 파일      | `plan.md` 또는 `TASKS.md`                                                               | warn        | 5      |
| `gitignore/local-settings`  | 개인 설정 분리      | `.gitignore`에 `.claude/settings.local.json`                                            | warn        | 5      |
| `skills/too-many`           | 컨텍스트 비용       | 저장소 스킬 15개 이하                                                                   | warn        | 5      |

## 4. 점수

- 점수 = 통과한 항목의 가중치 합 ÷ 전체 가중치 합 × 100 (반올림)
- warn은 가중치의 절반을 준다.
- 등급: 80 이상 "준비됨", 50~79 "부분 준비", 50 미만 "준비 필요"

## 5. 출력

- 기본: 사람이 읽는 텍스트 (위 README 화면)
- `--json`: 도구 연동용 (`{ score, grade, findings[] }`)
- `--markdown`: 고객에게 보낼 리포트

## 6. 범위 밖

- 설정 파일 문법 전체 검사 (기존 린터가 더 잘함)
- 저장소 코드 품질 분석
- 네트워크 호출 (오프라인으로만 동작)

## 7. 로드맵

| 버전 | 내용                                                                            |
| ---- | ------------------------------------------------------------------------------- |
| v0.1 | CLI 뼈대, CLAUDE.md 존재·길이 (완료)                                            |
| v0.2 | 권한 설정 진단: settings 존재, .env 읽기·쓰기 차단, 위험한 자동 허용, 우회 모드 |
| v0.3 | CLAUDE.md 검증 명령·금지 사항, 훅, plan.md, .gitignore, 스킬 수                 |
| v0.4 | 점수·등급, `--json`, `--markdown` 리포트                                        |
| v0.5 | npm 배포(`npx cc-checkup`), 블로그 소개 글                                      |
