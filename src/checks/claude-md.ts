import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { KIT_GUIDE } from "../report.js";
import type { Check, Finding } from "../types.js";

export const MAX_LINES = 200;

// Claude Code가 프로젝트 지침으로 읽는 두 위치
const LOCATIONS = ["CLAUDE.md", ".claude/CLAUDE.md"];

const VERIFY_HEADING = /^#+.*(검증|verify|test)/im;
const VERIFY_COMMANDS = [
  /\b(npm|pnpm|yarn|bun)( run)? (test|lint|typecheck)\b/,
  /\bgradlew\b/,
  /\bmvn\b/,
  /\bpytest\b/,
  /\bgo test\b/,
  /\bcargo test\b/,
  /\bdotnet test\b/,
];

function lineCount(text: string): number {
  if (text === "") return 0;
  return text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

export function hasVerifyCommand(text: string): boolean {
  return VERIFY_HEADING.test(text) || VERIFY_COMMANDS.some((re) => re.test(text));
}

// 진단 1(존재·길이)과 진단 9(검증 명령)
export const checkClaudeMd: Check = async ({ repoDir }) => {
  const found: { name: string; text: string }[] = [];
  for (const name of LOCATIONS) {
    try {
      found.push({ name, text: await readFile(join(repoDir, name), "utf8") });
    } catch {
      // 없는 위치는 건너뛴다
    }
  }

  if (found.length === 0) {
    return [
      {
        id: "claude-md",
        severity: "fail",
        message: "CLAUDE.md가 없습니다 (CLAUDE.md, .claude/CLAUDE.md 모두 없음)",
        judgment: `팀 지침 파일(CLAUDE.md)을 만드세요. ${KIT_GUIDE}`,
      },
    ];
  }

  const findings: Finding[] = found.map(({ name, text }) => {
    const lines = lineCount(text);
    return lines > MAX_LINES
      ? {
          id: "claude-md",
          severity: "warn",
          message: `${name}가 ${lines}줄입니다 (권장 ${MAX_LINES}줄 이하)`,
          judgment: `${name}의 긴 설명을 docs/로 옮기고 링크만 남기세요`,
        }
      : { id: "claude-md", severity: "ok", message: `${name} ${lines}줄` };
  });

  if (hasVerifyCommand(found.map((f) => f.text).join("\n"))) {
    findings.push({
      id: "claude-md/verify",
      severity: "ok",
      message: "CLAUDE.md에 검증 명령이 있습니다",
    });
  } else {
    findings.push({
      id: "claude-md/verify",
      severity: "warn",
      message:
        "CLAUDE.md에 검증 명령(테스트·린트·타입체크)이 없어 Claude가 결과를 확인하지 않고 끝낼 수 있습니다",
      judgment: `CLAUDE.md에 검증 명령을 적으세요. ${KIT_GUIDE}`,
    });
  }
  return findings;
};
