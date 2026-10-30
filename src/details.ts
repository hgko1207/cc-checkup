// 앱 할 일 카드에 보여 줄 설명: 제목(무엇이 위험한가), 할 일 한 줄, 왜 위험한지, 고치면 무엇이 바뀌는지,
// 고쳐도 못 막는 것. 진단 결과 문장(message)은 CLI와 리포트가 쓰므로 그대로 두고, 앱은 여기 쉬운 말을 쓴다.

export interface Detail {
  risk?: string; // 할 일 제목. 없으면 진단 문장을 쓴다
  todo?: string; // "할 일: …" 한 줄
  why: string;
  fix?: string;
  limit?: string;
}

export interface DetailContext {
  usage: "solo" | "team";
  envFiles: number; // 이 폴더에서 찾은 .env 파일 수
  severity: "ok" | "warn" | "fail";
}

const SHELL_LIMIT =
  "grep -r처럼 파일 이름 없이 읽는 명령과 Python·Node 스크립트는 막지 못합니다. 위험 명령 검사를 함께 넣으면 더 안전합니다.";

type Entry = Detail | ((c: DetailContext) => Detail);

const DETAILS: Record<string, Entry> = {
  "claude-md": (c) =>
    c.severity === "fail"
      ? {
          risk: "Claude가 이 저장소의 규칙과 빌드·테스트 방법을 모릅니다",
          todo: "Claude가 폴더를 읽고 작업 지침(CLAUDE.md)을 씁니다",
          why: "CLAUDE.md는 Claude가 대화를 시작할 때마다 읽는 작업 지침입니다. 없으면 Claude가 빌드·테스트 방법을 매번 추측해서, 사람마다 다른 결과가 나옵니다.",
          fix: "Claude가 폴더를 읽고 실제로 확인한 명령과 경로만으로 CLAUDE.md를 씁니다. 적용하기 전에 바뀔 내용을 보여 드립니다.",
          limit: "근거를 찾지 못한 규칙은 TODO로 남깁니다. 한 번 읽고 직접 채워 주세요.",
        }
      : {
          risk: "작업 지침(CLAUDE.md)이 길어 중요한 규칙이 묻힙니다",
          why: "CLAUDE.md는 대화마다 통째로 읽힙니다. 길면 중요한 규칙이 묻히고, 대화마다 사용량이 더 듭니다.",
        },
  "claude-md/verify": {
    risk: "Claude가 고친 뒤 테스트를 돌려 보지 않고 끝났다고 할 수 있습니다",
    todo: "작업 지침(CLAUDE.md)에 테스트·린트 명령을 적습니다",
    why: "작업 지침에 검증 명령(테스트·린트·타입체크)이 없으면, Claude가 고친 코드를 실행해 보지 않고 끝났다고 말할 수 있습니다.",
    fix: "Claude가 package.json 같은 파일에서 실제 명령을 찾아 검증 명령 섹션을 채웁니다.",
  },
  "claude-md/sections": {
    risk: "작업 지침(CLAUDE.md)에 사내 기준이 정한 내용이 빠져 있습니다",
    todo: "빠진 섹션만 채웁니다",
    why: "사내 기준이 정한 섹션(코딩 규칙, 하지 말 것 등)이 있어야 팀마다 Claude에게 같은 기준을 줄 수 있습니다.",
    fix: "Claude가 빠진 섹션만 채우고 기존 내용은 지우지 않습니다. 예시 보기로 어떤 내용이 들어가는지 볼 수 있습니다.",
    limit: "근거가 없는 규칙은 TODO로 남기므로 직접 정해서 채워야 합니다.",
  },
  "settings/missing": (c) => ({
    risk:
      c.usage === "solo"
        ? "Claude 보호 설정이 없어 .env와 위험한 명령을 막지 못합니다"
        : "팀 공용 Claude 설정이 없어 팀원마다 보호 수준이 다릅니다",
    todo: "Claude 설정 파일(.claude/settings.json)을 만들어 보호 규칙을 넣습니다",
    why:
      c.usage === "solo"
        ? "보호 규칙은 Claude 설정 파일(.claude/settings.json)에 적어 둡니다. 이 파일이 없으면 Claude가 .env를 읽거나 위험한 명령을 실행해도 막을 것이 없습니다."
        : "저장소의 Claude 설정 파일(.claude/settings.json)은 팀원 모두에게 같은 보호 규칙을 적용합니다. 없으면 보호가 각자 PC의 설정에 맡겨집니다.",
    fix: "설정 파일을 새로 만들고, 함께 고른 할 일의 규칙만 넣습니다. 다른 파일은 건드리지 않습니다.",
  }),
  "settings/env-read-deny": (c) => ({
    risk:
      c.envFiles > 0
        ? "Claude가 .env(API 키·비밀번호)를 읽을 수 있습니다"
        : "나중에 .env를 만들면 Claude가 읽을 수 있습니다",
    todo: "Claude가 .env를 읽지 못하게 막습니다",
    why:
      c.envFiles > 0
        ? `이 폴더에 .env 파일이 ${c.envFiles}개 있습니다. Claude가 읽으면 키와 비밀번호가 대화 기록에 그대로 남습니다.`
        : "아직 .env는 없지만, 만드는 순간부터 Claude가 읽을 수 있습니다. 읽으면 키와 비밀번호가 대화 기록에 그대로 남습니다.",
    fix: "Claude 설정 파일(.claude/settings.json)에 .env 읽기를 막는 규칙을 더합니다. 다른 설정은 그대로입니다.",
    limit: SHELL_LIMIT,
  }),
  "settings/env-edit-deny": (c) => ({
    risk:
      c.envFiles > 0
        ? "Claude가 .env 내용을 바꿀 수 있습니다"
        : "나중에 .env를 만들면 Claude가 내용을 바꿀 수 있습니다",
    todo: "Claude가 .env를 고치지 못하게 막습니다",
    why: "Claude가 .env를 고치면 운영에 쓰는 키나 비밀번호가 바뀌거나 지워질 수 있습니다.",
    fix: "Claude 설정 파일(.claude/settings.json)에 .env 고치기를 막는 규칙을 더합니다.",
    limit: SHELL_LIMIT,
  }),
  "settings/risky-allow": {
    risk: "위험한 명령 일부가 묻지 않고 바로 실행되게 허용돼 있습니다",
    todo: "허용 목록에서 직접 지우세요 (앱이 대신 고치지 않습니다)",
    why: "허용 목록(permissions.allow)에 있는 명령은 Claude가 묻지 않고 바로 실행합니다. git push, rm -rf, 모든 명령 허용은 되돌리기 어려운 일을 확인 없이 하게 만듭니다.",
    fix: "허용 목록에서 지우면 Claude가 실행 전에 매번 묻습니다. 기존 허용을 지우는 변경이라 앱이 자동으로 고치지 않습니다.",
  },
  "settings/bypass": (c) => ({
    risk: "묻지 않고 모든 명령을 실행하는 모드를 켤 수 있습니다",
    todo:
      c.usage === "solo"
        ? "이 모드를 켜지 못하게 막습니다. 일부러 쓰고 있다면 그대로 두세요"
        : "팀원 누구도 이 모드를 켜지 못하게 막습니다",
    why: "이 모드(권한 우회 모드)를 켜면 Claude가 파일 수정과 명령 실행을 하나도 묻지 않습니다. 실수로 켜도 막을 장치가 없습니다.",
    fix: "Claude 설정 파일에 이 모드를 끄는 설정 한 줄을 더합니다. 평소처럼 묻고 실행하는 방식은 그대로입니다.",
  }),
  "settings/committed": {
    risk: "Claude 설정이 내 PC에만 있어 팀원에게는 적용되지 않습니다",
    todo: "설정 파일을 커밋해 팀원에게 보냅니다",
    why: "Claude 설정 파일이 git에 커밋되지 않으면 내 PC에만 적용됩니다. 보호 규칙이 개인 설정(settings.local.json)에만 있어도 마찬가지입니다.",
    fix: "고친 뒤 요약 카드의 커밋 → 팀원에게 보내기를 차례로 누르세요.",
  },
  "hooks/present": {
    risk: "Claude가 되돌리기 어려운 명령(강제 푸시, rm -rf)을 바로 실행할 수 있습니다",
    todo: "이런 명령을 실행 전에 멈추는 검사를 넣습니다",
    why: "검사(훅)는 Claude가 명령을 실행하기 직전에 도는 작은 스크립트입니다. 강제 푸시, rm -rf처럼 되돌리기 어려운 명령이면 실행을 멈춥니다.",
    fix: "검사 스크립트를 .claude/hooks/cc-guard에 넣고 Claude 설정 파일에 등록합니다. 이 PC에 Node.js가 있어야 동작합니다.",
    limit:
      "Claude가 실행하는 명령만 검사합니다. 사람이 터미널에서 직접 실행하는 명령은 막지 않습니다.",
  },
  "plugins/required": {
    risk: "팀원이 이 폴더를 열어도 사내 플러그인을 안내받지 못합니다",
    todo: "저장소 설정에 사내 플러그인을 켜 둡니다",
    why: "사내 플러그인에는 팀 공용 스킬(계획·검증·리뷰)과 검사가 들어 있습니다. 저장소 설정에 켜 두면 팀원이 이 폴더를 열 때 설치를 안내받습니다.",
    fix: "Claude 설정 파일에 플러그인 위치와 켜기 설정을 더합니다. 실제 설치는 각자 Claude Code에서 승인합니다.",
    limit: "플러그인 저장소에 접근 권한이 없으면 설치되지 않습니다.",
  },
};

const FILE_DETAIL: Detail = {
  why: "사내 기준이 정한 파일입니다. 작업 계획(plan.md)이나 화면 규칙(DESIGN.md)이 있으면 Claude가 팀 방식대로 작업합니다.",
  fix: "바로 만들면 사내 기준 템플릿으로 만들고, Claude로 만들면 Claude가 실제 코드를 읽고 씁니다.",
};

const DEFAULT_CONTEXT: DetailContext = { usage: "team", envFiles: 0, severity: "warn" };

export function detailFor(id: string, c: DetailContext = DEFAULT_CONTEXT): Detail | undefined {
  const d = DETAILS[id];
  if (d) return typeof d === "function" ? d(c) : d;
  return id.startsWith("file/") ? FILE_DETAIL : undefined;
}
