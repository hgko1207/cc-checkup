import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Check, Finding } from "../types.js";

export const MAX_LINES = 200;

// CLAUDE.md 존재 여부와 길이를 본다
export const checkClaudeMd: Check = async (repoDir) => {
  let text: string;
  try {
    text = await readFile(join(repoDir, "CLAUDE.md"), "utf8");
  } catch {
    return [
      {
        id: "claude-md/missing",
        severity: "fail",
        message: "CLAUDE.md가 없습니다.",
        fix: "저장소 루트에 CLAUDE.md를 만들고 구조·명령·규칙을 적으세요.",
      },
    ];
  }

  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/).length;
  if (lines > MAX_LINES) {
    findings.push({
      id: "claude-md/too-long",
      severity: "warn",
      message: `CLAUDE.md가 ${lines}줄입니다 (권장 ${MAX_LINES}줄 이하).`,
      fix: "긴 설명은 docs/로 옮기고 링크만 남기세요.",
    });
  } else {
    findings.push({ id: "claude-md/length", severity: "ok", message: `CLAUDE.md ${lines}줄` });
  }
  return findings;
};
