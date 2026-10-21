// 사내 표준 정의 파일. 진단 기준·필수 항목·Claude 작업 지시문을 코드가 아니라 이 파일에서 읽는다.
// 우선순위 (eng review R3): 지정한 공유 경로의 standard.json → 실패하면 기본 표준(내장).
// 공유 파일은 일부 항목만 적어도 되고, 빠진 항목은 기본 표준 값을 쓴다.
import { readFile } from "node:fs/promises";
import { DEFAULT_STANDARD } from "./standard-default.js";

export interface StandardSection {
  id: string; // "verify"는 검증 명령(제목 또는 명령어)으로 판정
  title: string;
  aliases: string[]; // 제목 줄에 이 중 하나가 들어 있으면 있음
}

export interface StandardFile {
  id: string;
  path: string; // 기준 폴더 기준, `/` 구분
  title: string;
  severity: "warn" | "fail";
  when?: "hasUI"; // 화면이 있는 프로젝트에만 요구
  template?: string; // 있으면 "바로 만들기" 후보
  claudeTask?: string; // 있으면 "Claude로 반영" 대상 (PR2)
}

export interface ClaudeTask {
  title: string;
  targets: string[]; // Claude가 쓸 수 있는 파일
  prompt: string;
}

export interface Standard {
  name: string;
  version: string;
  env: { targets: string[] };
  claudeMd: { maxLines: number; requiredSections: StandardSection[] };
  requiredFiles: StandardFile[];
  plugins: { marketplaces: Record<string, unknown>; required: string[] };
  uiDetection: { dependencies: string[]; files: string[] };
  score: { fail: number; warn: number };
  claudeTasks: Record<string, ClaudeTask>;
}

export interface LoadedStandard {
  standard: Standard;
  source: "default" | "shared";
  path?: string;
  error?: string; // 공유 파일을 쓰지 못한 이유 (기본 표준으로 진단)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function check(cond: boolean, what: string): void {
  if (!cond) throw new Error(what);
}

// 공유 파일 내용을 기본 표준 위에 덮는다. 형식이 틀리면 어느 항목인지 알려 주는 오류를 던진다
export function mergeStandard(base: Standard, input: unknown): Standard {
  check(isObject(input), "최상위가 객체가 아닙니다");
  const o = input as Record<string, unknown>;
  const out: Standard = structuredClone(base);

  if (o.name !== undefined) {
    check(typeof o.name === "string", "name은 문자열이어야 합니다");
    out.name = o.name as string;
  }
  if (o.version !== undefined) {
    check(typeof o.version === "string", "version은 문자열이어야 합니다");
    out.version = o.version as string;
  }
  if (o.env !== undefined) {
    check(
      isObject(o.env) && isStringArray(o.env.targets),
      "env.targets는 문자열 배열이어야 합니다",
    );
    out.env.targets = (o.env as { targets: string[] }).targets;
  }
  if (o.claudeMd !== undefined) {
    check(isObject(o.claudeMd), "claudeMd는 객체여야 합니다");
    const c = o.claudeMd as Record<string, unknown>;
    if (c.maxLines !== undefined) {
      check(
        typeof c.maxLines === "number" && c.maxLines > 0,
        "claudeMd.maxLines는 양수여야 합니다",
      );
      out.claudeMd.maxLines = c.maxLines as number;
    }
    if (c.requiredSections !== undefined) {
      check(
        Array.isArray(c.requiredSections) &&
          c.requiredSections.every(
            (s) =>
              isObject(s) &&
              typeof s.id === "string" &&
              typeof s.title === "string" &&
              isStringArray(s.aliases),
          ),
        "claudeMd.requiredSections 항목은 id·title·aliases가 필요합니다",
      );
      out.claudeMd.requiredSections = c.requiredSections as StandardSection[];
    }
  }
  if (o.requiredFiles !== undefined) {
    check(
      Array.isArray(o.requiredFiles) &&
        o.requiredFiles.every(
          (f) =>
            isObject(f) &&
            typeof f.id === "string" &&
            typeof f.path === "string" &&
            typeof f.title === "string" &&
            (f.severity === "warn" || f.severity === "fail") &&
            (f.when === undefined || f.when === "hasUI") &&
            (f.template === undefined || typeof f.template === "string") &&
            (f.claudeTask === undefined || typeof f.claudeTask === "string") &&
            !String(f.path).split(/[\\/]/).includes(".."),
        ),
      "requiredFiles 항목은 id·path·title·severity(warn|fail)가 필요하고 path에 ..를 쓸 수 없습니다",
    );
    out.requiredFiles = o.requiredFiles as StandardFile[];
  }
  if (o.plugins !== undefined) {
    check(isObject(o.plugins), "plugins는 객체여야 합니다");
    const p = o.plugins as Record<string, unknown>;
    if (p.marketplaces !== undefined) {
      check(isObject(p.marketplaces), "plugins.marketplaces는 객체여야 합니다");
      out.plugins.marketplaces = p.marketplaces as Record<string, unknown>;
    }
    if (p.required !== undefined) {
      check(isStringArray(p.required), "plugins.required는 문자열 배열이어야 합니다");
      out.plugins.required = p.required as string[];
    }
  }
  if (o.uiDetection !== undefined) {
    check(
      isObject(o.uiDetection) &&
        isStringArray(o.uiDetection.dependencies) &&
        isStringArray(o.uiDetection.files),
      "uiDetection은 dependencies·files 문자열 배열이 필요합니다",
    );
    out.uiDetection = o.uiDetection as Standard["uiDetection"];
  }
  if (o.score !== undefined) {
    check(
      isObject(o.score) && typeof o.score.fail === "number" && typeof o.score.warn === "number",
      "score는 fail·warn 숫자가 필요합니다",
    );
    out.score = o.score as Standard["score"];
  }
  if (o.claudeTasks !== undefined) {
    check(isObject(o.claudeTasks), "claudeTasks는 객체여야 합니다");
    for (const [k, t] of Object.entries(o.claudeTasks as Record<string, unknown>)) {
      check(
        isObject(t) &&
          typeof t.title === "string" &&
          isStringArray(t.targets) &&
          typeof t.prompt === "string",
        `claudeTasks.${k}는 title·targets·prompt가 필요합니다`,
      );
      out.claudeTasks[k] = t as unknown as ClaudeTask;
    }
  }
  return out;
}

// 공유 경로가 없거나 읽기·형식 오류면 기본 표준으로 돌아가고 이유를 남긴다
export async function loadStandard(sharedPath?: string): Promise<LoadedStandard> {
  if (sharedPath === undefined || sharedPath === "") {
    return { standard: structuredClone(DEFAULT_STANDARD), source: "default" };
  }
  try {
    const text = await readFile(sharedPath, "utf8");
    const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const standard = mergeStandard(DEFAULT_STANDARD, JSON.parse(raw));
    return { standard, source: "shared", path: sharedPath };
  } catch (e) {
    return {
      standard: structuredClone(DEFAULT_STANDARD),
      source: "default",
      path: sharedPath,
      error: (e as Error).message,
    };
  }
}

export function describeStandard(loaded: LoadedStandard): string {
  const { name, version } = loaded.standard;
  const from = loaded.source === "shared" ? `공유 파일: ${loaded.path}` : "기본 내장";
  return `${name} ${version} (${from})`;
}
