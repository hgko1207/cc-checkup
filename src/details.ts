// [자세히]에 보여 줄 설명: 왜 문제인지, 고치면 무엇이 바뀌는지, 고쳐도 남는 한계.
// 진단 결과 문장(message)은 "무엇이" 문제인지만 말하므로 여기서 이유와 한계를 채운다.

export interface Detail {
  why: string;
  fix?: string;
  limit?: string;
}

const SHELL_LIMIT =
  "차단 규칙은 Claude의 파일 도구와 cat·head·tail·sed·tee, >·< 리다이렉트에 적용되지만, grep -r처럼 파일 이름 없이 읽는 명령과 Python·Node 스크립트는 막지 못합니다. 위험 명령 차단 훅을 함께 쓰세요.";

const DETAILS: Record<string, Detail> = {
  "claude-md": {
    why: "CLAUDE.md는 Claude Code가 대화를 시작할 때마다 읽는 팀 지침입니다. 없으면 Claude가 빌드·테스트 방법과 팀 규칙을 매번 추측하고, 사람마다 다른 결과가 나옵니다. 너무 길면 중요한 규칙이 묻히고 매번 비용이 듭니다.",
    fix: '"Claude로 만들기"는 Claude가 폴더를 읽고 실제로 확인한 명령·경로만으로 CLAUDE.md를 씁니다. 적용 전에 바뀔 내용을 보여 줍니다.',
    limit:
      "Claude가 쓴 내용은 팀이 한 번 읽고 고쳐야 합니다. 근거를 찾지 못한 규칙은 TODO로 남깁니다.",
  },
  "claude-md/verify": {
    why: "검증 명령(테스트·린트·타입체크)이 CLAUDE.md에 없으면 Claude가 고친 뒤 확인하지 않고 '완료'라고 말할 수 있습니다.",
    fix: '"Claude로 반영"은 package.json 같은 설정 파일에서 실제 명령을 찾아 검증 섹션을 채웁니다.',
  },
  "claude-md/sections": {
    why: "사내 표준이 정한 섹션(코딩 규칙, 하지 말 것 등)이 있어야 팀마다 Claude에게 같은 기준을 줄 수 있습니다.",
    fix: '"Claude로 반영"은 빠진 섹션만 채우고 기존 내용은 지우지 않습니다. [예시 보기]로 어떤 내용이 들어가는지 볼 수 있습니다.',
    limit: "근거가 없는 규칙은 TODO로 남기므로 팀이 정해서 채워야 합니다.",
  },
  "settings/missing": {
    why: ".claude/settings.json은 팀원 모두에게 같은 권한 규칙(비밀 파일 차단, 위험 명령 확인)을 적용하는 공용 설정입니다. 없으면 각자 개인 설정에 맡겨집니다.",
    fix: "바로 고치기는 settings.json을 새로 만들고 .env 차단 규칙을 넣습니다. 함께 고른 다른 할 일(권한 우회 모드 막기, 위험 명령 차단 훅 등)도 이 파일에 들어갑니다.",
  },
  "settings/env-read-deny": {
    why: "Claude가 .env를 읽으면 API 키·비밀번호가 대화 기록과 모델 요청에 들어갑니다. 실수로 코드나 답변에 옮겨 적을 수도 있습니다.",
    fix: "바로 고치기는 permissions.deny에 Read(**/.env) 같은 규칙을 더합니다. 기존 규칙은 바꾸지 않습니다.",
    limit: SHELL_LIMIT,
  },
  "settings/env-edit-deny": {
    why: "Claude가 .env를 고쳐 쓰면 운영 비밀값이 바뀌거나 지워질 수 있습니다.",
    fix: "바로 고치기는 permissions.deny에 Edit(**/.env) 같은 규칙을 더합니다.",
    limit: SHELL_LIMIT,
  },
  "settings/risky-allow": {
    why: "allow 목록에 있는 명령은 Claude가 묻지 않고 바로 실행합니다. git push, rm -rf, Bash 전체 허용은 되돌리기 어려운 일을 확인 없이 하게 만듭니다.",
    limit:
      "기존 허용을 지우는 변경이라 자동으로 고치지 않습니다. 팀이 정말 필요한 허용인지 보고 직접 지우세요.",
  },
  "settings/bypass": {
    why: "권한 우회 모드(--dangerously-skip-permissions)를 켜면 모든 확인이 사라집니다. 팀 설정으로 이 모드를 막아 두면 실수로 켤 수 없습니다.",
    fix: '바로 고치기는 permissions.disableBypassPermissionsMode를 "disable"로 더합니다.',
  },
  "settings/committed": {
    why: "settings.json이 git에 커밋되지 않으면 내 PC에만 적용되고 팀원에게는 적용되지 않습니다. 보호 규칙이 settings.local.json(개인 설정)에만 있어도 마찬가지입니다.",
    fix: "고친 뒤 안내대로 git add 후 커밋하세요.",
  },
  "hooks/present": {
    why: "훅은 Claude가 명령을 실행하기 직전에 검사하는 스크립트입니다. 강제 푸시, rm -rf, 보호 브랜치 리셋처럼 되돌리기 어려운 명령을 권한 설정보다 촘촘하게 막습니다.",
    fix: "바로 고치기는 team-ai-kit의 차단 훅을 .claude/hooks/cc-guard에 넣고 settings.json에 등록합니다. 이 PC에 node가 있어야 동작합니다.",
    limit:
      "훅은 Claude Code가 실행하는 명령만 검사합니다. 사람이 터미널에서 직접 실행하는 명령은 막지 않습니다.",
  },
  "plugins/required": {
    why: "사내 표준 플러그인에는 팀 공용 스킬(계획·검증·리뷰)과 훅이 들어 있습니다. 저장소 설정에 켜 두면 팀원이 이 폴더를 열 때 설치를 안내받습니다.",
    fix: "설치하기는 settings.json에 마켓플레이스와 enabledPlugins를 더합니다. 실제 설치는 각자 Claude Code에서 안내를 받아 승인합니다.",
    limit: "플러그인 저장소에 접근 권한이 없으면 설치되지 않습니다.",
  },
};

const FILE_DETAIL: Detail = {
  why: "사내 표준이 정한 파일입니다. 작업 계획(plan.md)이나 화면 규칙(DESIGN.md)이 있으면 Claude가 팀 방식대로 작업합니다.",
  fix: '"바로 만들기"는 표준 템플릿으로 만들고, "Claude로 만들기"는 Claude가 실제 코드를 읽고 씁니다.',
};

export function detailFor(id: string): Detail | undefined {
  return DETAILS[id] ?? (id.startsWith("file/") ? FILE_DETAIL : undefined);
}
