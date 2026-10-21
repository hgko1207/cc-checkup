// 위험 명령 차단 훅 "바로 고치기": team-ai-kit의 차단 훅(templates/hooks)을 저장소에 넣고
// settings.json PreToolUse에 등록한다. team-ai-kit 저장소가 비공개라 플러그인 대신 파일로 넣는다.
import { readFileSync } from "node:fs";

export const HOOK_DIR = ".claude/hooks/cc-guard";
const NAMES = ["block-dangerous-bash.cjs", "lib.cjs"];

export const HOOK_ENTRY = {
  matcher: "Bash|PowerShell",
  hooks: [
    {
      type: "command",
      command: `node "$CLAUDE_PROJECT_DIR/${HOOK_DIR}/block-dangerous-bash.cjs"`,
      timeout: 10,
    },
  ],
};

// src/와 dist/ 모두 옆의 templates/hooks에서 읽는다 (빌드 때 dist로 복사)
export function hookFiles(): { path: string; content: string }[] {
  return NAMES.map((name) => ({
    path: `${HOOK_DIR}/${name}`,
    content: readFileSync(new URL(`./templates/hooks/${name}`, import.meta.url), "utf8"),
  }));
}
