# cc-checkup

**저장소의 Claude Code 팀 세팅을 사내 표준과 비교해 진단하고, 확인 후 바로 고치거나 Claude로 반영하는 도구.** Windows·macOS 설치형 앱과 CLI 두 가지로 쓴다. 점수 대신 "지금 무엇이 위험한가"를 한국어 문장으로 보여 준다.

## 앱으로 쓰기 (3단계)

1. **앱 받기** — [Releases](https://github.com/hgko1207/cc-checkup/releases/latest)에서 Windows는 `cc-checkup-setup-<버전>.exe`, macOS는 `.dmg`를 받는다.
2. **설치** — 받은 파일을 실행해 설치한다. 코드 서명이 없어 처음 실행할 때 경고가 뜬다. Windows는 **추가 정보 → 실행**, macOS는 앱을 **우클릭 → 열기**로 연다.
3. **폴더 고르기** — 앱을 띄워 진단할 저장소 폴더를 고른다.

폴더를 고르면 사내 표준 대비 점수와 영역별(보안·팀 표준·문서·구조·스킬·플러그인) 결과가 나온다. 항목마다 왜 문제인지 볼 수 있고, 고칠 수 있는 것은 바뀔 내용을 먼저 보여 준 뒤 [적용]을 눌러야 쓴다. 적용 전 원본은 `~/.cc-checkup/backups/`에 남아 되돌릴 수 있다.

### 이 문서의 표시

- **[터미널]**: VS Code 메뉴 **터미널 → 새 터미널**(`` Ctrl+` ``) 또는 PowerShell에 입력하는 명령이다. 앱만 쓸 사람은 필요 없다.

## 앱 기능

- **폴더 종류**: 개발 저장소 / 문서·기획 폴더를 자동으로 판별하고 이유를 보여 준다. 바꾸면 그 폴더에 기억한다. 문서 폴더는 표준 파일의 `docs` 기준(폴더 목적·구조·문서 작성 규칙·하지 말 것)으로 진단한다.
- **바로 고치기 / 바로 만들기 / 설치하기**: 도구가 정한 내용(.env 차단 규칙, 우회 모드 막기, 위험 명령 차단 훅, plan.md 템플릿, 사내 플러그인 설정)을 넣는다. 바뀔 내용을 먼저 보여 주고 [적용]을 눌러야 쓴다.
- **Claude로 반영 / Claude로 만들기**: 그 폴더에서 Claude Code(`claude -p`)를 실행해 CLAUDE.md(없을 때 새로 만들기, 빠진 섹션·검증 명령 채우기)나 DESIGN.md를 쓰게 한다.
  - Claude는 대상 파일만 고칠 수 있다(명령 실행·`.env` 읽기 금지). 끝나면 바뀐 내용을 보여 준 뒤 [적용]/[취소]를 고른다.
  - 진행 로그가 보이고 [중단]할 수 있다. 10분이 넘으면 자동으로 멈추고 원래대로 돌린다.
  - 근거를 찾지 못한 규칙은 지어내지 않고 `TODO`로 남긴다.
- **[자세히] / [예시 보기]**: 항목마다 왜 문제인지·고치면 무엇이 바뀌는지·남는 한계, 필수 섹션·파일의 예시를 펼쳐 본다.
- **↶ 마지막 반영 되돌리기**: 바로 고치기와 Claude로 반영 모두 적용 전 원본을 `~/.cc-checkup/backups/`에 남기므로 되돌릴 수 있다.
- **Claude Code 상태**: 설치·버전·로그인 계정을 보여 준다. 로그인이 안 돼 있으면 Claude 버튼이 꺼지고, 로그인 후 [다시 확인]을 누른다.
- **사내 표준**: 왼쪽 [표준 파일 선택]으로 공유 폴더의 `standard.json`을 지정한다(앱이 기억함). 지정하지 않으면 기본 표준.
- **새 버전 알림**: 사내 표준 파일의 `app.latestVersion`이 지금 버전보다 높으면 맨 위에 알리고, [설치 파일 위치 열기]로 `app.downloadUrl`(공유 폴더 경로나 사내 주소)을 연다. 설치 파일을 직접 실행하지는 않는다.
- **리포트 저장**: 결과를 마크다운으로 저장한다(TF가 팀별 결과를 모을 때).

**위험 명령 차단 훅**: "바로 고치기"는 team-ai-kit의 차단 훅(강제 푸시·`rm -rf /` 같은 되돌리기 어려운 명령 차단)을 `.claude/hooks/cc-guard/`에 복사하고 `.claude/settings.json`의 PreToolUse에 등록한다. team-ai-kit 저장소가 비공개라 플러그인 대신 파일로 넣는다. 실행하려면 그 PC에 Node.js가 있어야 한다. 실제 Claude Code(2.1.83, Windows)에서 `git push --force origin main`을 막는 것을 확인했다.

## CLI로 쓰기 (개발자·CI용)

앱과 같은 진단을 터미널에서 돌린다.

### 이런 결과를 낸다

```
이 저장소의 Claude Code 팀 세팅 진단

위험
  ✗ Claude가 비밀 설정 파일(.env)을 읽을 수 있습니다 (읽기 차단 규칙 없음)
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

### 처음 실행하기

**준비물:** Node.js 20 이상([터미널]에서 `node -v`로 확인), git. Windows·macOS·Linux 모두 된다.

**1. 받아서 빌드** (한 번만) — [터미널]

```powershell
git clone https://github.com/hgko1207/cc-checkup.git
cd cc-checkup
npm install
npm run build
```

**2. 진단할 저장소를 지정해 실행** — [터미널]

```powershell
# 예: D:\project\Coding\my-app 을 진단
node dist/cli.js D:\project\Coding\my-app
```

경로를 빼면 지금 폴더를 진단한다. 진단만 하고 아무것도 바꾸지 않는다. 고칠 수 있는 항목이 있으면 번호를 묻는데, **엔터만 누르면 아무것도 쓰지 않고 끝난다.**

**3. 고치기 (원할 때만)**

번호(`1,2` 또는 `a`)를 고르면 바뀔 내용(diff)을 보여 주고 `적용할까요? [y/N]`을 한 번 더 묻는다. `y`를 눌러야만 쓴다. 쓰기 전에 원본을 `~/.cc-checkup/backups/`에 남긴다. 적용 후 안내대로 `.claude/settings.json`을 커밋해야 팀원에게도 적용된다.

마음에 안 들면 되돌린다. — [터미널]

```powershell
node dist/cli.js D:\project\Coding\my-app --undo
```

**4. 어디서나 `cc-checkup` 명령으로 실행하고 싶으면** (선택) — [터미널]

```powershell
npm install -g .          # cc-checkup 폴더에서 한 번 (빌드 후). 이후 아무 폴더에서나:
cc-checkup                # 지금 폴더 진단
npm uninstall -g cc-checkup   # 지우기
```

**다른 PC·동료에게 전달할 때** (npm 공개 전) — [터미널]

```powershell
npm run build
npm pack                                   # cc-checkup-1.0.0.tgz 생성 → 파일 전달
# 받은 사람 (Node 20 이상):
npm install -g D:\받은경로\cc-checkup-1.0.0.tgz
cd 진단할-저장소
cc-checkup
```

`npx <tgz파일>`로 바로 실행하는 방법은 이 환경(Windows, npm 11)에서 출력 없이 멈춰 쓰지 않는다. 위 `npm install -g`는 확인했다.

### 사용법 요약

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

## 사내 표준

진단 기준은 코드가 아니라 **표준 정의 파일**에서 읽는다. 아무것도 지정하지 않으면 기본 표준(아래 9개 진단, 지금까지와 같은 기준)으로 진단한다.

- 앱은 왼쪽 [표준 파일 선택], CLI는 `--standard <파일>`로 사내 표준 파일을 지정한다. 그 값이 우선이고, 적지 않은 항목은 기본값을 쓴다.
- 파일이 없거나 형식이 틀리면 경고하고 기본 표준으로 진단한다. 화면·리포트 맨 위에 어떤 표준으로 진단했는지 표시된다.
- 예시: [standard/example-company.json](standard/example-company.json) — CLAUDE.md 필수 섹션(검증 명령·코딩 규칙·하지 말 것), plan.md 템플릿, 화면 있는 프로젝트의 DESIGN.md, 사내 플러그인(team-ai).
- 표준 파일로 정할 수 있는 것: `.env` 차단 대상, CLAUDE.md 길이·필수 섹션(제목 별칭·예시), 필수 파일(템플릿 또는 Claude 작업·예시), 필수 플러그인과 마켓플레이스, 화면 판정 규칙, 점수 가중치, Claude 작업 지시문, 문서·기획 폴더 기준(`docs`), 안내 문구에 붙일 사내 가이드 주소(`guideUrl`), 새 버전 알림(`app`).
- 고치기 후보에 "사내 표준 플러그인 설정 추가"(저장소 settings.json에 더하기만)와 "plan.md 만들기"(템플릿)가 더해진다.
- 폴더 종류: CLI는 기본이 개발 저장소(예전과 같음)이고 `--kind docs`·`--kind auto`(자동 판별)로 바꾼다. 앱은 자동 판별한다.

```jsonc
{
  "guideUrl": "https://wiki.your-company.example/claude", // 없으면 링크를 붙이지 않는다
  "app": {
    "latestVersion": "0.2.0",
    "downloadUrl": "\\\\fileserver\\tools\\cc-checkup\\",
    "note": "…",
  },
  "docs": {
    "claudeMd": {
      "requiredSections": [
        {
          "id": "purpose",
          "title": "폴더 목적",
          "aliases": ["목적"],
          "example": "## 폴더 목적\n…",
        },
      ],
    },
    "requiredFiles": [],
    "plugins": { "required": [] }, // 없으면 개발 저장소와 같은 플러그인을 요구
  },
}
```

## 진단 항목

| id                                                 | 보는 것                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `claude-md`                                        | `CLAUDE.md`·`.claude/CLAUDE.md` 존재·길이                                         |
| `claude-md/verify`                                 | CLAUDE.md에 검증 명령(테스트·린트·타입체크)이 있는가                              |
| `settings/missing`                                 | `.claude/settings.json` 존재·구조                                                 |
| `settings/committed`                               | settings.json이 git에 커밋됐는가, 보호 규칙이 settings.local.json에만 있지 않은가 |
| `settings/env-read-deny`, `settings/env-edit-deny` | 기본 `.env` 대상 6개와 실제 `.env*` 파일이 deny 규칙에 덮이는가                   |
| `settings/risky-allow`                             | `Bash`, `git push`, `rm -rf` 같은 위험 명령이 묻지 않고 허용되는가                |
| `settings/bypass`                                  | 권한 우회 모드가 막혀 있는가                                                      |
| `hooks/present`                                    | Bash 명령 전에 실행되는 훅이나 team-ai 플러그인이 있는가                          |
| `claude-md/sections`                               | 사내 표준이 정한 CLAUDE.md 필수 섹션이 있는가 (표준에 있을 때만)                  |
| `file/<id>`                                        | 사내 표준이 정한 필수 파일(예: plan.md, 화면 있는 프로젝트의 DESIGN.md)이 있는가  |
| `plugins/required`                                 | 사내 표준 플러그인이 저장소 설정(enabledPlugins)에 켜져 있는가                    |

진단 결과마다 **사내 표준 대비 점수(0~100)**를 함께 보여 준다. 위험 1건 -15, 주의 1건 -5(표준 파일에서 바꿀 수 있음).

## 설치 파일 만들기 (배포 담당자용)

태그를 올리면 GitHub Actions가 설치 파일을 릴리스 초안에 붙인다. 아래는 직접 만들 때다. — [터미널]

```powershell
npm install
npm run dist:win     # release\cc-checkup-setup-1.0.0.exe → 사내 배포 경로에 올린다
npm run dist:mac     # macOS에서만: release/*.dmg, *.zip
```

- GitHub Actions: `v0.2.0` 같은 태그를 올리거나 Actions 화면에서 `release`를 실행하면 Windows·macOS 설치 파일을 만들어 Artifacts로 남긴다. PR마다 `ci`가 테스트와 앱 E2E를 돌린다.
- **코드 서명**: 인증서가 없으면 서명 없이 만들어 처음 실행할 때 Windows SmartScreen·macOS Gatekeeper 경고가 뜬다. 인증서를 저장소 Secrets(`CSC_LINK`, `CSC_KEY_PASSWORD`, macOS는 `MAC_CSC_LINK`·`MAC_CSC_KEY_PASSWORD`·공증용 `APPLE_ID`·`APPLE_APP_SPECIFIC_PASSWORD`·`APPLE_TEAM_ID`)에 넣으면 자동으로 서명한다. 로컬 빌드도 같은 이름의 환경 변수를 쓴다.
- 새 버전을 배포하면 사내 표준 파일의 `app.latestVersion`과 `app.downloadUrl`을 올려 사용자에게 알린다.
- 아이콘: `build/icon.png` (`npx electron scripts/make-icon.cjs`로 다시 만든다. VS Code 터미널이면 `ELECTRON_RUN_AS_NODE`를 지우고 실행).

## 개발

설계: [docs/designs/risk-report-wedge.md](docs/designs/risk-report-wedge.md)

| 용도      | 명령                                           |
| --------- | ---------------------------------------------- |
| 타입체크  | `npm run typecheck`                            |
| 린트      | `npm run lint`                                 |
| 테스트    | `npm test`                                     |
| 앱 E2E    | `npm run test:e2e`                             |
| 앱 실행   | `npm run app`                                  |
| 설치 파일 | `npm run dist:win` (macOS: `npm run dist:mac`) |
| 포맷      | `npm run format`                               |
| 빌드      | `npm run build`                                |

개발 중에 앱을 바로 띄우려면 [터미널]에서 `npm run app`.

진단 하나는 `src/checks/<이름>.ts`에 `Check` 함수(`(ctx) => Finding[]`)로 만들고 `src/diagnose.ts`의 `CHECKS`에 등록하고, `test/<이름>.test.ts`에 테스트를 둔다. `.env` 규칙 판정은 `src/env-rules.ts` 하나를 진단과 고치기가 함께 쓴다.
