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

진단 기준은 코드가 아니라 기준 파일(기본 내장 `src/standard-default.ts`, 사내 기준 파일 `standard/*.json`)에서 읽는다. 아래는 기본 기준이다. 앱의 [점검 기준] 탭이 같은 목록을 이 폴더의 결과와 함께 보여 준다.

| id                       | 무엇을 보나        | 통과 기준                                                              | 안 지키면                      | 언제 보나                  |
| ------------------------ | ------------------ | ---------------------------------------------------------------------- | ------------------------------ | -------------------------- |
| `settings/missing`       | Claude 설정 파일   | `.claude/settings.json`이 있다                                         | 위험                           | 항상 (혼자면 아래 참고)    |
| `settings/env-read-deny` | .env 읽기 차단     | .env 기본 이름과 폴더 안 실제 .env 파일을 Read로 막는다                | 위험 (.env가 아직 없으면 주의) | 항상                       |
| `settings/env-edit-deny` | .env 쓰기 차단     | 같은 파일을 Edit로 막는다                                              | 주의                           | 항상                       |
| `settings/risky-allow`   | 위험한 자동 허용   | allow에 강제 푸시·rm -rf·Bash 전체 같은 명령이 없다                    | 주의 (자동으로 고치지 않음)    | 항상                       |
| `settings/bypass`        | 권한 우회 모드     | `permissions.disableBypassPermissionsMode: "disable"`                  | 주의                           | 항상                       |
| `hooks/present`          | 위험 명령 검사(훅) | Bash 앞에 도는 PreToolUse 훅 또는 team-ai 플러그인                     | 주의                           | 개발 저장소                |
| `settings/committed`     | 설정 커밋          | settings.json이 git에 커밋돼 있고, 보호 규칙이 개인 설정에만 있지 않다 | 위험 (확인할 수 없으면 주의)   | 팀 저장소                  |
| `claude-md`              | CLAUDE.md          | CLAUDE.md 또는 .claude/CLAUDE.md가 있고 기준 줄 수 이하                | 없으면 위험, 길면 주의         | 항상                       |
| `claude-md/verify`       | 검증 명령          | 검증 섹션이나 테스트·린트·타입체크 명령이 적혀 있다                    | 주의                           | 개발 저장소                |
| `claude-md/sections`     | 사내 필수 섹션     | 사내 기준 파일이 정한 섹션이 있다                                      | 주의                           | 사내 기준 파일을 고른 경우 |
| `file/<id>`              | 사내 필수 파일     | 사내 기준 파일이 정한 파일(예: plan.md, DESIGN.md)이 있다              | 기준 파일이 정한 심각도        | 사내 기준 파일을 고른 경우 |
| `plugins/required`       | 사내 플러그인      | 저장소 설정에서 사내 플러그인을 켜 둔다                                | 주의                           | 사내 기준 파일 + 팀 저장소 |

### 혼자 / 팀

- 폴더마다 사용 방식을 고른다. 자동 추천: settings.json이 이미 커밋돼 있거나 커밋한 사람이 2명 이상이면 팀, 아니면 혼자(`src/usage.ts`). CLI는 지금처럼 팀 기준.
- 혼자: `settings/committed`·`plugins/required`를 보지 않는다. 개인 설정(`.claude/settings.local.json`)과 내 PC 전체 설정(`~/.claude/settings.json`)에 둔 .env 차단·우회 모드 막기·훅도 통과로 인정하고, 저장소 설정 파일이 없어도 다른 설정을 쓰면 `settings/missing`을 통과로 본다.
- 팀: 저장소 설정만 통과로 친다. 다른 곳에 보호가 있으면 "팀원에게는 적용되지 않습니다"라고 알리되 감점은 그대로.

## 4. 점수

- 점수 = 100 − 위험 수 × 15 − 주의 수 × 5 (0 아래로 내려가지 않음). 가중치는 기준 파일의 `score`에서 바꿀 수 있다.
- 해당 없음(폴더 종류·사용 방식에 따라 보지 않는 항목)은 점수에 넣지 않는다.
- 목표는 80점. 앱은 지금 점수, 바로 고치면 오를 점수, (팀이면) 커밋하면 오를 점수를 함께 보여 준다.

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
