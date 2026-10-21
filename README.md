# cc-checkup

**저장소의 Claude Code 팀 세팅을 진단하고, 정해진 안전 수정은 확인 후 바로 적용하는 CLI.**
점수 대신 "지금 무엇이 위험한가"를 한국어 문장으로 보여 준다. 설계: [docs/designs/risk-report-wedge.md](docs/designs/risk-report-wedge.md)

## 이런 결과를 낸다

```
이 저장소의 Claude Code 팀 세팅 진단

위험
  ✗ Claude가 파일 도구와 cat 같은 명령으로 .env를 읽을 수 있습니다 (읽기 차단 규칙 없음)
주의
  ! 권한 우회 모드가 막혀 있지 않습니다
  ! 위험 명령(강제 푸시, rm -rf 등)을 막는 훅이 없습니다
괜찮음
  ✓ CLAUDE.md 59줄

직접 판단이 필요한 것 (자동으로 고치지 않음)
  - 위험 명령 차단 훅이 필요합니다 …

남는 위험
  - 차단 규칙은 … grep -r·스크립트는 막지 못합니다 …

바로 고칠 수 있는 것
  1. .claude/settings.json에 .env 읽기·쓰기 차단 규칙 추가 (12개)
  2. 권한 우회 모드 막기
적용할 번호 (예: 1,2 / a=전부 / 엔터=건너뛰기):
```

번호를 고르면 변경 내용(diff)을 보여 주고 `[y/N]`으로 한 번 더 묻는다. 적용 전 원본은 저장소 밖 `~/.cc-checkup/backups/`에 백업한다.

> 웹페이지나 Windows 프로그램이 아니라 **터미널에서 실행하는 CLI**다. 설계에서 "찾아와서 여는 도구보다 한 줄로 바로 돌리는 도구"를 먼저 만들기로 했다. 웹·앱은 사용자 반응을 본 뒤 다시 정한다 ([설계 문서](docs/designs/risk-report-wedge.md)의 Approaches Considered).

## 처음 실행하기

**준비물:** Node.js 20 이상(`node -v`로 확인), git. Windows·macOS·Linux 모두 된다. 저장소는 비공개라 접근 권한이 있는 GitHub 계정으로 로그인돼 있어야 clone할 수 있다(`gh auth login`). 권한이 없는 사람에게는 아래 "다른 PC·동료에게 전달할 때"처럼 `.tgz` 파일을 준다.

**1. 받아서 빌드** (한 번만)

```powershell
git clone https://github.com/hgko1207/cc-checkup.git
cd cc-checkup
npm install
npm run build
```

**2. 진단할 저장소를 지정해 실행**

```powershell
# 예: D:\project\Coding\my-app 을 진단
node dist/cli.js D:\project\Coding\my-app
```

경로를 빼면 지금 폴더를 진단한다. 진단만 하고 아무것도 바꾸지 않는다. 고칠 수 있는 항목이 있으면 번호를 묻는데, **엔터만 누르면 아무것도 쓰지 않고 끝난다.**

**3. 고치기 (원할 때만)**

번호(`1,2` 또는 `a`)를 고르면 바뀔 내용(diff)을 보여 주고 `적용할까요? [y/N]`을 한 번 더 묻는다. `y`를 눌러야만 쓴다. 쓰기 전에 원본을 `~/.cc-checkup/backups/`에 남긴다. 적용 후 안내대로 `.claude/settings.json`을 커밋해야 팀원에게도 적용된다.

```powershell
node dist/cli.js D:\project\Coding\my-app --undo   # 마음에 안 들면 되돌리기
```

**4. 어디서나 `cc-checkup` 명령으로 실행하고 싶으면** (선택)

```powershell
npm install -g .          # cc-checkup 폴더에서 한 번 (빌드 후). 이후 아무 폴더에서나:
cc-checkup                # 지금 폴더 진단
npm uninstall -g cc-checkup   # 지우기
```

**다른 PC·동료에게 전달할 때** (npm 공개 전)

```powershell
npm run build
npm pack                                   # cc-checkup-0.1.0.tgz 생성 → 파일 전달
# 받은 사람 (Node 20 이상):
npm install -g D:\받은경로\cc-checkup-0.1.0.tgz
cd 진단할-저장소
cc-checkup
```

`npx <tgz파일>`로 바로 실행하는 방법은 이 환경(Windows, npm 11)에서 출력 없이 멈춰 쓰지 않는다. 위 `npm install -g`는 확인했다.

## 사용법 요약

```
node dist/cli.js [저장소 경로]                 # 진단 (+ 터미널이면 고치기 선택)
node dist/cli.js [저장소 경로] --report r.md   # UTF-8 마크다운 리포트 (질문·설정 수정 없음)
node dist/cli.js [저장소 경로] --undo          # 마지막 고치기 되돌리기 (여러 번이면 역순)
node dist/cli.js [저장소 경로] --standard s.json  # 사내 표준 정의 파일로 진단 (아래 "사내 표준")
node dist/cli.js --help
```

- 파이프·CI·리다이렉트처럼 터미널이 아니면 묻지 않고 설정 파일도 쓰지 않는다.
- `--report`는 cc-checkup이 만든 리포트(첫 줄 표식)만 덮어쓰고, 다른 파일이면 거부한다(종료 코드 2).
- 종료 코드: 위험 항목이 있으면 1, 없으면 0, 잘못된 옵션·덮어쓰기 거부는 2.
- 진단은 저장소 안의 파일만 읽고, `.env`는 이름만 찾는다(내용은 읽지 않음). 네트워크를 쓰지 않는다.

## 진단 항목

| id | 보는 것 |
|---|---|
| `claude-md` | `CLAUDE.md`·`.claude/CLAUDE.md` 존재·길이 |
| `claude-md/verify` | CLAUDE.md에 검증 명령(테스트·린트·타입체크)이 있는가 |
| `settings/missing` | `.claude/settings.json` 존재·구조 |
| `settings/committed` | settings.json이 git에 커밋됐는가, 보호 규칙이 settings.local.json에만 있지 않은가 |
| `settings/env-read-deny`, `settings/env-edit-deny` | 기본 `.env` 대상 6개와 실제 `.env*` 파일이 deny 규칙에 덮이는가 |
| `settings/risky-allow` | `Bash`, `git push`, `rm -rf` 같은 위험 명령이 묻지 않고 허용되는가 |
| `settings/bypass` | 권한 우회 모드가 막혀 있는가 |
| `hooks/present` | Bash 명령 전에 실행되는 훅이나 team-ai 플러그인이 있는가 |
| `claude-md/sections` | 사내 표준이 정한 CLAUDE.md 필수 섹션이 있는가 (표준에 있을 때만) |
| `file/<id>` | 사내 표준이 정한 필수 파일(예: plan.md, 화면 있는 프로젝트의 DESIGN.md)이 있는가 |
| `plugins/required` | 사내 표준 플러그인이 저장소 설정(enabledPlugins)에 켜져 있는가 |

진단 결과마다 **사내 표준 대비 점수(0~100)**를 함께 보여 준다. 위험 1건 -15, 주의 1건 -5(표준 파일에서 바꿀 수 있음).

## 사내 표준

진단 기준은 코드가 아니라 **표준 정의 파일**에서 읽는다. 아무것도 지정하지 않으면 기본 표준(위 9개 진단, 지금까지와 같은 기준)으로 진단한다.

- `--standard <파일>`로 사내 표준 파일을 지정하면 그 값이 우선이고, 적지 않은 항목은 기본값을 쓴다.
- 파일이 없거나 형식이 틀리면 경고하고 기본 표준으로 진단한다. 화면·리포트 맨 위에 어떤 표준으로 진단했는지 표시된다.
- 예시: [standard/example-company.json](standard/example-company.json) — CLAUDE.md 필수 섹션(검증 명령·코딩 규칙·하지 말 것), plan.md 템플릿, 화면 있는 프로젝트의 DESIGN.md, 사내 플러그인(team-ai).
- 표준 파일로 정할 수 있는 것: `.env` 차단 대상, CLAUDE.md 길이·필수 섹션(제목 별칭), 필수 파일(템플릿 또는 Claude 작업), 필수 플러그인과 마켓플레이스, 화면 판정 규칙, 점수 가중치, Claude 작업 지시문.
- 고치기 후보에 "사내 표준 플러그인 설정 추가"(저장소 settings.json에 더하기만)와 "plan.md 만들기"(템플릿)가 더해진다.

## 개발

| 용도     | 명령                |
| -------- | ------------------- |
| 타입체크 | `npm run typecheck` |
| 린트     | `npm run lint`      |
| 테스트   | `npm test`          |
| 포맷     | `npm run format`    |
| 빌드     | `npm run build`     |

진단 하나는 `src/checks/<이름>.ts`에 `Check` 함수(`(ctx) => Finding[]`)로 만들고 `src/diagnose.ts`의 `CHECKS`에 등록하고, `test/<이름>.test.ts`에 테스트를 둔다. `.env` 규칙 판정은 `src/env-rules.ts` 하나를 진단과 고치기가 함께 쓴다.
