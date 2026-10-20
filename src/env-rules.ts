// .env 차단 규칙 판정과 실제 .env 파일 탐색. 진단 4·5와 고치기 1이 함께 쓴다.
//
// 규칙 해석 근거: https://code.claude.com/docs/en/permissions (2026-10-12 확인)
// - Read·Edit 규칙은 gitignore 문법이다. 슬래시 없는 패턴은 어느 깊이든 맞는다:
//   "`Read(.env)` and `Read(**/.env)` are equivalent".
// - `/path`는 설정 위치(=기준 폴더), `//path`는 절대 경로, `~/path`는 홈 기준이다.
// - 중간에 `/`가 있는 패턴은 그 위치에만 맞는다. 단 deny에서 `secrets/**`처럼
//   폴더 한 단계 패턴은 어느 깊이든 맞는다.
// - `./path`의 깊이는 문서에 직접 나오지 않는다. 거짓 안심을 피하려고 기준 폴더에
//   고정된 것으로 본다 (eng review R1).
// - `!` 규칙은 앞에 나온 상대 경로 규칙에서만 빼낸다.
//
//   기준 폴더 ──탐색(링크 무시, node_modules·.git 건너뜀, 상한)──► .env 파일 목록
//        │                                                         │
//        └── deny 규칙 ──parseRule──► 정규식 ──isCovered(파일·조상 폴더)──┘
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EnvScan } from "./types.js";

export type FileTool = "Read" | "Edit";

// 고치기 1이 넣는 기본 대상 6개 (team-ai-kit 템플릿과 같은 목록)
export const DEFAULT_TARGETS = [
  ".env",
  ".env.local",
  ".env.*.local",
  ".env.production*",
  ".env.development*",
  ".env.staging*",
];

// 대상 패턴이 덮였는지 볼 대표 파일 이름. 루트와 하위 폴더 모두에서 덮여야 통과
const SAMPLES: Record<string, string[]> = {
  ".env": [".env"],
  ".env.local": [".env.local"],
  ".env.*.local": [".env.production.local", ".env.test.local"],
  ".env.production*": [".env.production", ".env.production.server"],
  ".env.development*": [".env.development", ".env.development.server"],
  ".env.staging*": [".env.staging", ".env.staging.server"],
};
const SAMPLE_DIRS = ["", "apps/api/"];

export const SCAN_LIMIT = 200_000;
const SKIP_DIRS = new Set(["node_modules", ".git"]);

export interface MatchContext {
  baseDir: string;
  home?: string;
}

interface Rule {
  negate: boolean;
  // relative: path·./path (! 규칙이 빼낼 수 있음), anchored: /path·//path·~/path
  kind: "relative" | "anchored";
  absolute: boolean; // 절대 경로와 비교하는 규칙
  regex: RegExp | null; // null이면 모든 파일
  dirOnly: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// gitignore식 glob 본문을 정규식 소스로 바꾼다
function globSource(p: string): string {
  let out = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i] as string;
    if (c === "*") {
      if (p[i + 1] === "*") {
        const atStart = i === 0 || p[i - 1] === "/";
        const next = p[i + 2];
        if (atStart && next === "/") {
          out += "(?:.*/)?";
          i += 3;
          continue;
        }
        if (atStart && next === undefined) {
          out += ".*";
          i += 2;
          continue;
        }
        out += "[^/]*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i++;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < p.length) {
      out += escapeRegex(p[i + 1] as string);
      i += 2;
      continue;
    }
    if (c === "[") {
      const end = p.indexOf("]", i + 2);
      if (end > 0) {
        let cls = p.slice(i + 1, end);
        if (cls.startsWith("!")) cls = "^" + cls.slice(1);
        out += "[" + cls.replace(/\\/g, "\\\\") + "]";
        i = end + 1;
        continue;
      }
    }
    out += escapeRegex(c);
    i++;
  }
  return out;
}

// Windows 경로를 Claude Code가 비교하는 POSIX 형태로: C:\Users\a → /c/Users/a
export function toPosixAbs(p: string): string {
  const s = p.replace(/\\/g, "/");
  const m = /^([A-Za-z]):(\/|$)(.*)$/.exec(s);
  if (m) return `/${(m[1] as string).toLowerCase()}/${m[3] ?? ""}`.replace(/\/$/, "");
  return s.replace(/\/$/, "") || "/";
}

function parseRule(entry: string, tool: FileTool, ctx: MatchContext): Rule | undefined {
  if (entry === tool) {
    return { negate: false, kind: "relative", absolute: false, regex: null, dirOnly: false };
  }
  if (!entry.startsWith(`${tool}(`) || !entry.endsWith(")")) return undefined;
  let pat = entry.slice(tool.length + 1, -1).trim();
  if (pat === "") return undefined;

  let negate = false;
  if (pat.startsWith("!")) {
    negate = true;
    pat = pat.slice(1);
  }
  let dirOnly = false;
  if (pat.length > 1 && pat.endsWith("/")) {
    dirOnly = true;
    pat = pat.slice(0, -1);
  }

  // ! 규칙은 앞의 /, ~/, //와 관계없이 현재 폴더 기준으로 읽는다 (문서)
  if (!negate && pat.startsWith("//")) {
    return {
      negate,
      kind: "anchored",
      absolute: true,
      regex: new RegExp(`^${globSource(pat.slice(1))}$`),
      dirOnly,
    };
  }
  if (!negate && pat.startsWith("~/")) {
    const home = toPosixAbs(ctx.home ?? homedir());
    return {
      negate,
      kind: "anchored",
      absolute: true,
      regex: new RegExp(`^${escapeRegex(home)}/${globSource(pat.slice(2))}$`),
      dirOnly,
    };
  }

  let kind: Rule["kind"] = "relative";
  let anchored = false;
  if (pat.startsWith("/")) {
    kind = negate ? "relative" : "anchored";
    anchored = true;
    pat = pat.replace(/^\/+/, "");
  } else if (pat.startsWith("./")) {
    // ./path는 기준 폴더에 고정된 것으로 본다 (보수적, eng review R1)
    anchored = true;
    pat = pat.slice(2);
  } else if (pat.includes("/")) {
    anchored = !/^[^/]+\/\*\*$/.test(pat); // deny의 `dir/**`는 어느 깊이든
  }
  const body = globSource(pat);
  const regex = new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`);
  return { negate, kind, absolute: false, regex, dirOnly };
}

// 파일 자신과 조상 폴더들 (gitignore: 폴더가 맞으면 그 안의 파일도 맞는다)
function candidates(path: string): { path: string; isDir: boolean }[] {
  const parts = path.split("/");
  const out: { path: string; isDir: boolean }[] = [];
  for (let i = 1; i < parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    if (p !== "") out.push({ path: p, isDir: true });
  }
  out.push({ path, isDir: false });
  return out;
}

function ruleMatches(rule: Rule, rel: string, ctx: MatchContext): boolean {
  if (rule.regex === null) return true;
  const target = rule.absolute ? `${toPosixAbs(ctx.baseDir)}/${rel}` : rel;
  return candidates(target).some(
    (c) => (!rule.dirOnly || c.isDir) && (rule.regex as RegExp).test(c.path),
  );
}

// 기준 폴더 기준 상대 경로(rel)의 파일이 deny 규칙에 덮이는가
export function isCovered(deny: string[], tool: FileTool, rel: string, ctx: MatchContext): boolean {
  let byRelative = false;
  let byAnchored = false;
  for (const entry of deny) {
    const rule = parseRule(entry, tool, ctx);
    if (!rule || !ruleMatches(rule, rel, ctx)) continue;
    if (rule.negate) byRelative = false;
    else if (rule.kind === "relative") byRelative = true;
    else byAnchored = true;
  }
  return byRelative || byAnchored;
}

// 기본 대상 6개 중 어느 깊이든 덮이지 않는 것
export function missingTargets(deny: string[], tool: FileTool, ctx: MatchContext): string[] {
  return DEFAULT_TARGETS.filter((target) =>
    (SAMPLES[target] ?? []).some((name) =>
      SAMPLE_DIRS.some((dir) => !isCovered(deny, tool, dir + name, ctx)),
    ),
  );
}

function escapeGlob(name: string): string {
  return name.replace(/[*?[\]\\]/g, "\\$&");
}

export function targetRule(tool: FileTool, target: string): string {
  return `${tool}(**/${target})`;
}

// 실제 파일 이름에 맞춘 규칙: apps/api/.env.prod → Read(**/.env.prod)
export function fileRule(tool: FileTool, rel: string): string {
  const name = rel.split("/").pop() ?? rel;
  return `${tool}(**/${escapeGlob(name)})`;
}

// .env 또는 .env.* 파일. 값이 없는 예시 파일(.example·.sample·.template)은 뺀다
export function isEnvFile(name: string): boolean {
  if (name === ".env") return true;
  return name.startsWith(".env.") && !/\.(example|sample|template)$/.test(name);
}

// 파일 이름만 찾는다 (내용은 읽지 않는다). 링크·정션은 따라가지 않는다
export async function scanRepo(baseDir: string, limit = SCAN_LIMIT): Promise<EnvScan> {
  const result: EnvScan = { envFiles: [], nestedSettings: [], truncated: false, unreadableDirs: 0 };
  let count = 0;
  const stack = [""];
  scan: while (stack.length > 0) {
    const rel = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(join(baseDir, rel), { withFileTypes: true });
    } catch {
      result.unreadableDirs++;
      continue;
    }
    for (const e of entries) {
      if (++count > limit) {
        result.truncated = true;
        break scan;
      }
      if (e.isSymbolicLink()) continue;
      const child = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(child);
      } else if (e.isFile()) {
        if (isEnvFile(e.name)) result.envFiles.push(child);
        if (e.name === "settings.json" && rel !== ".claude" && rel.endsWith("/.claude")) {
          result.nestedSettings.push(child);
        }
      }
    }
  }
  result.envFiles.sort();
  result.nestedSettings.sort();
  return result;
}
