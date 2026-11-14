import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { guideSuffix } from "../standard.js";
import type { Check, Finding } from "../types.js";

// 기본 표준의 길이 기준 (표준 파일 claudeMd.maxLines로 바꿀 수 있다)
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

// Claude Code의 @경로 import: 가져온 파일을 따라가는 최대 단계 수 (공식 문서 기준 4)
const MAX_IMPORT_DEPTH = 4;

// 코드 펜스·인라인 코드 밖의 @경로 목록. 따옴표로 감싼 경로는 Claude Code도 가져오지 않는다.
export function importPaths(text: string): string[] {
  const paths: string[] = [];
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const plain = line.replace(/`[^`]*`/g, "");
    for (const m of plain.matchAll(/(?:^|\s)@([^\s`"']+)/g)) {
      if (m[1]) paths.push(m[1]);
    }
  }
  return paths;
}

// text 뒤에 그 안의 @import 파일 내용을 덧붙인다. 저장소 밖 경로, 없는 파일, 이미 읽은 파일은 건너뛴다.
async function expandImports(
  repoDir: string,
  file: string,
  text: string,
  depth: number,
  seen: Set<string>,
): Promise<string> {
  if (depth >= MAX_IMPORT_DEPTH) return text;
  const parts = [text];
  for (const p of importPaths(text)) {
    const target = resolve(dirname(file), p);
    const rel = relative(repoDir, target);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || seen.has(target)) continue;
    let body: string;
    try {
      body = await readFile(target, "utf8");
    } catch {
      continue; // @멘션 등 파일이 아닌 것
    }
    seen.add(target);
    parts.push(await expandImports(repoDir, target, body, depth + 1, seen));
  }
  return parts.join("\n");
}

// 있는 CLAUDE.md 파일들 (두 위치).
// text는 파일 자체 내용(길이 검사용), expanded는 @import한 파일(예: @AGENTS.md)까지 펼친 내용(섹션·검증 명령 검사용)
export async function readClaudeMd(
  repoDir: string,
): Promise<{ name: string; text: string; expanded: string }[]> {
  const found: { name: string; text: string; expanded: string }[] = [];
  const root = resolve(repoDir);
  for (const name of LOCATIONS) {
    const file = join(root, name);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue; // 없는 위치는 건너뛴다
    }
    const expanded = await expandImports(root, file, text, 0, new Set([file]));
    found.push({ name, text, expanded });
  }
  return found;
}

// 진단 1(존재·길이)과 진단 9(검증 명령)
export const checkClaudeMd: Check = async ({ repoDir, standard }) => {
  const maxLines = standard.claudeMd.maxLines;
  const found = await readClaudeMd(repoDir);
  const task = standard.claudeMd.task;

  if (found.length === 0) {
    const titles = standard.claudeMd.requiredSections.map((s) => s.title).join(", ");
    return [
      {
        id: "claude-md",
        severity: "fail",
        message: "CLAUDE.md가 없습니다 (CLAUDE.md, .claude/CLAUDE.md 모두 없음)",
        judgment: `팀 지침 파일(CLAUDE.md)을 만드세요 (점검 프로그램의 "Claude로 만들기" 또는 Claude Code에서 /init).${guideSuffix(standard)}`,
        claudeTask: task,
        claudeVars: { missing: titles || "기본 섹션" },
        example: standard.claudeMd.requiredSections
          .map((s) => s.example)
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
  }

  const findings: Finding[] = found.map(({ name, text }) => {
    const lines = lineCount(text);
    return lines > maxLines
      ? {
          id: "claude-md",
          severity: "warn",
          message: `${name}가 ${lines}줄입니다 (권장 ${maxLines}줄 이하)`,
          judgment: `${name}의 긴 설명을 docs/로 옮기고 링크만 남기세요`,
        }
      : {
          id: "claude-md",
          severity: "ok",
          message: `${name} ${lines}줄 (기준 ${maxLines}줄 이하)`,
        };
  });

  // 표준에 "verify" 섹션이 있을 때만 검증 명령을 본다 (기본 표준에는 있음)
  if (!standard.claudeMd.requiredSections.some((s) => s.id === "verify")) return findings;
  if (hasVerifyCommand(found.map((f) => f.expanded).join("\n"))) {
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
      judgment: `CLAUDE.md에 검증 명령을 적으세요.${guideSuffix(standard)}`,
      claudeTask: task,
      claudeVars: { missing: "검증 명령" },
      example: standard.claudeMd.requiredSections.find((s) => s.id === "verify")?.example,
    });
  }
  return findings;
};
