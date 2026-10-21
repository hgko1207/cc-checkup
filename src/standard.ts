// 사내 표준 정의 파일. 진단 기준·필수 항목·Claude 작업 지시문을 코드가 아니라 이 파일에서 읽는다.
// 우선순위 (eng review R3): 지정한 공유 경로의 standard.json → 실패하면 기본 표준(내장).
// 공유 파일은 일부 항목만 적어도 되고, 빠진 항목은 기본 표준 값을 쓴다.
import { readFile } from "node:fs/promises";
import { DEFAULT_STANDARD } from "./standard-default.js";

export interface StandardSection {
  id: string; // "verify"는 검증 명령(제목 또는 명령어)으로 판정
  title: string;
  aliases: string[]; // 제목 줄에 이 중 하나가 들어 있으면 있음
  example?: string; // [예시 보기]에 보여 줄 섹션 예시
}

export interface StandardFile {
  id: string;
  path: string; // 기준 폴더 기준, `/` 구분
  title: string;
  severity: "warn" | "fail";
  when?: "hasUI"; // 화면이 있는 프로젝트에만 요구
  template?: string; // 있으면 "바로 만들기" 후보
  claudeTask?: string; // 있으면 "Claude로 반영" 대상 (PR2)
  example?: string; // [예시 보기]에 보여 줄 내용 (없으면 template)
}

export interface ClaudeTask {
  title: string;
  targets: string[]; // Claude가 쓸 수 있는 파일
  prompt: string;
}

// 폴더 종류: 개발 저장소 / 문서·기획 폴더. 문서 폴더는 docs의 기준을 쓴다
export type FolderKind = "dev" | "docs";

export interface ClaudeMdRules {
  requiredSections: StandardSection[];
  task?: string; // 빠진 섹션·CLAUDE.md 없음에 쓰는 Claude 작업 (claudeTasks 키)
}

export interface Standard {
  name: string;
  version: string;
  guideUrl?: string; // 안내 문구에 붙일 사내 가이드 주소 (없으면 링크 없음)
  app?: { latestVersion: string; downloadUrl?: string; note?: string }; // 새 버전 알림
  env: { targets: string[] };
  claudeMd: { maxLines: number } & ClaudeMdRules;
  requiredFiles: StandardFile[];
  plugins: { marketplaces: Record<string, unknown>; required: string[] };
  uiDetection: { dependencies: string[]; files: string[] };
  score: { fail: number; warn: number };
  claudeTasks: Record<string, ClaudeTask>;
  // 문서·기획 폴더에서 claudeMd 섹션·requiredFiles·plugins.required 대신 쓰는 값
  docs: {
    claudeMd: ClaudeMdRules;
    requiredFiles: StandardFile[];
    plugins?: { required: string[] };
  };
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

const optString = (v: unknown) => v === undefined || typeof v === "string";

// Claude 작업 대상 경로. 허용 목록 문자열(Edit(/대상))에 그대로 들어가므로 쉼표·괄호·공백을 막는다
export function targetError(path: string): string | null {
  if (!/^[\p{L}\p{N}._\-/]+$/u.test(path))
    return `${path}: 글자·숫자·._-/ 만 쓸 수 있습니다 (공백·쉼표·괄호 불가)`;
  if (path.startsWith("/")) return `${path}: 기준 폴더 기준 상대 경로여야 합니다`;
  if (path.split("/").some((p) => p === "" || p === "." || p === ".."))
    return `${path}: 빈 칸, . , .. 경로 조각은 쓸 수 없습니다`;
  return null;
}

function check(cond: boolean, what: string): void {
  if (!cond) throw new Error(what);
}

function sections(v: unknown, where: string): StandardSection[] {
  check(
    Array.isArray(v) &&
      v.every(
        (s) =>
          isObject(s) &&
          typeof s.id === "string" &&
          typeof s.title === "string" &&
          isStringArray(s.aliases) &&
          optString(s.example),
      ),
    `${where} 항목은 id·title·aliases가 필요합니다`,
  );
  return v as StandardSection[];
}

function files(v: unknown, where: string): StandardFile[] {
  check(
    Array.isArray(v) &&
      v.every(
        (f) =>
          isObject(f) &&
          typeof f.id === "string" &&
          typeof f.path === "string" &&
          typeof f.title === "string" &&
          (f.severity === "warn" || f.severity === "fail") &&
          (f.when === undefined || f.when === "hasUI") &&
          optString(f.template) &&
          optString(f.claudeTask) &&
          optString(f.example) &&
          !String(f.path).split(/[\\/]/).includes(".."),
      ),
    `${where} 항목은 id·path·title·severity(warn|fail)가 필요하고 path에 ..를 쓸 수 없습니다`,
  );
  return v as StandardFile[];
}

function claudeMdRules(c: Record<string, unknown>, out: ClaudeMdRules, where: string): void {
  if (c.requiredSections !== undefined)
    out.requiredSections = sections(c.requiredSections, `${where}.requiredSections`);
  if (c.task !== undefined) {
    check(typeof c.task === "string", `${where}.task는 문자열이어야 합니다`);
    out.task = c.task as string;
  }
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
  if (o.guideUrl !== undefined) {
    check(
      typeof o.guideUrl === "string" && /^https?:\/\//.test(o.guideUrl),
      "guideUrl은 http(s) 주소여야 합니다",
    );
    out.guideUrl = o.guideUrl as string;
  }
  if (o.app !== undefined) {
    check(
      isObject(o.app) &&
        typeof o.app.latestVersion === "string" &&
        /^\d+\.\d+\.\d+$/.test(o.app.latestVersion) &&
        optString(o.app.downloadUrl) &&
        optString(o.app.note),
      "app은 latestVersion(예: 0.2.0)이 필요하고 downloadUrl·note는 문자열이어야 합니다",
    );
    out.app = o.app as Standard["app"];
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
    claudeMdRules(c, out.claudeMd, "claudeMd");
  }
  if (o.requiredFiles !== undefined) out.requiredFiles = files(o.requiredFiles, "requiredFiles");
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
      const targets = (t as { targets: string[] }).targets;
      check(targets.length > 0, `claudeTasks.${k}.targets가 비어 있습니다`);
      for (const p of targets) {
        const err = targetError(p);
        check(err === null, `claudeTasks.${k}.targets: ${err}`);
      }
      out.claudeTasks[k] = t as unknown as ClaudeTask;
    }
  }
  if (o.docs !== undefined) {
    check(isObject(o.docs), "docs는 객체여야 합니다");
    const d = o.docs as Record<string, unknown>;
    if (d.claudeMd !== undefined) {
      check(isObject(d.claudeMd), "docs.claudeMd는 객체여야 합니다");
      claudeMdRules(d.claudeMd as Record<string, unknown>, out.docs.claudeMd, "docs.claudeMd");
    }
    if (d.requiredFiles !== undefined)
      out.docs.requiredFiles = files(d.requiredFiles, "docs.requiredFiles");
    if (d.plugins !== undefined) {
      check(
        isObject(d.plugins) && isStringArray(d.plugins.required),
        "docs.plugins.required는 문자열 배열이어야 합니다",
      );
      out.docs.plugins = { required: (d.plugins as { required: string[] }).required };
    }
  }
  // CLAUDE.md 작업이 가리키는 Claude 작업이 있어야 한다
  for (const [where, task] of [
    ["claudeMd.task", out.claudeMd.task],
    ["docs.claudeMd.task", out.docs.claudeMd.task],
  ] as const) {
    if (task !== undefined)
      check(task in out.claudeTasks, `${where}의 "${task}"가 claudeTasks에 없습니다`);
  }
  return out;
}

// 폴더 종류에 맞는 기준: 문서 폴더는 CLAUDE.md 섹션·필수 파일·필수 플러그인을 docs 값으로 바꾼다
export function standardFor(standard: Standard, kind: FolderKind): Standard {
  if (kind === "dev") return standard;
  return {
    ...standard,
    claudeMd: { ...standard.claudeMd, ...standard.docs.claudeMd },
    requiredFiles: standard.docs.requiredFiles,
    plugins: standard.docs.plugins
      ? { ...standard.plugins, required: standard.docs.plugins.required }
      : standard.plugins,
  };
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

// 안내 문구 끝에 붙일 사내 가이드 링크 (표준에 guideUrl이 있을 때만)
export function guideSuffix(standard: Standard): string {
  return standard.guideUrl ? ` 사내 가이드: ${standard.guideUrl}` : "";
}
