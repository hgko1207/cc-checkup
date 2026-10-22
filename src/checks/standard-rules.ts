// 사내 표준 정의 파일이 요구하는 항목: CLAUDE.md 필수 섹션, 필수 파일, 필수 플러그인.
// 기본 표준은 이 항목들을 비워 두므로(verify 섹션 제외) v0.3 진단 결과는 그대로다.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Standard, StandardFile } from "../standard.js";
import type { Check, Finding, SettingsRead } from "../types.js";
import { readClaudeMd } from "./claude-md.js";
import { withJosa } from "../josa.js";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

// 제목 줄(#으로 시작)에 별칭 중 하나가 들어 있으면 그 섹션이 있다고 본다 (대소문자 무시)
export function hasSection(text: string, aliases: string[]): boolean {
  const headings = text
    .split(/\r?\n/)
    .filter((l) => /^#{1,6}\s/.test(l))
    .map((l) => l.toLowerCase());
  return aliases.some((a) => headings.some((h) => h.includes(a.toLowerCase())));
}

// 화면이 있는 프로젝트인가: package.json 의존성이나 표준이 정한 파일로 판정
export async function hasUI(repoDir: string, standard: Standard): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(repoDir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const deps = {
      ...(isObject(pkg.dependencies) ? pkg.dependencies : {}),
      ...(isObject(pkg.devDependencies) ? pkg.devDependencies : {}),
    };
    if (standard.uiDetection.dependencies.some((d) => d in deps)) return true;
  } catch {
    // package.json이 없거나 깨졌으면 파일로만 판정
  }
  for (const f of standard.uiDetection.files) {
    if (await exists(join(repoDir, f))) return true;
  }
  return false;
}

async function sectionFindings(repoDir: string, standard: Standard): Promise<Finding[]> {
  const sections = standard.claudeMd.requiredSections.filter((s) => s.id !== "verify");
  if (sections.length === 0) return [];
  const found = await readClaudeMd(repoDir);
  if (found.length === 0) return []; // CLAUDE.md 없음은 claude-md 진단이 위험으로 알린다
  const text = found.map((f) => f.text).join("\n");
  const missing = sections.filter((s) => !hasSection(text, s.aliases));
  if (missing.length === 0) {
    return [
      {
        id: "claude-md/sections",
        severity: "ok",
        message: "CLAUDE.md에 사내 표준 필수 섹션이 모두 있습니다",
      },
    ];
  }
  const names = missing.map((s) => s.title).join(", ");
  return [
    {
      id: "claude-md/sections",
      severity: "warn",
      message: `CLAUDE.md가 사내 표준 필수 섹션을 빠뜨렸습니다: ${names}`,
      judgment: `CLAUDE.md에 ${names} 섹션을 채우세요 (점검 프로그램의 "Claude로 반영" 또는 Claude Code에서 직접)`,
      claudeTask: standard.claudeMd.task,
      claudeVars: { missing: names },
      example:
        missing
          .map((s) => s.example)
          .filter(Boolean)
          .join("\n\n") || undefined,
    },
  ];
}

async function fileFinding(
  repoDir: string,
  file: StandardFile,
  ui: boolean,
): Promise<Finding | null> {
  if (file.when === "hasUI" && !ui) return null;
  const id = `file/${file.id}`;
  if (await exists(join(repoDir, file.path))) {
    return { id, severity: "ok", message: `${file.title} 있음` };
  }
  const why = file.when === "hasUI" ? " (화면이 있는 프로젝트)" : "";
  const finding: Finding = {
    id,
    severity: file.severity,
    message: `${withJosa(file.title, "이", "가")} 없습니다${why}`,
  };
  const example = file.example ?? file.template;
  if (example !== undefined) finding.example = example;
  if (file.template !== undefined) {
    finding.createFile = { path: file.path, content: file.template };
  } else if (file.claudeTask !== undefined) {
    finding.claudeTask = file.claudeTask;
    finding.judgment = `${withJosa(file.title, "을", "를")} 만드세요 (점검 프로그램의 "Claude로 만들기" 또는 Claude Code에서 직접)`;
  } else {
    finding.judgment = `${file.path}를 만드세요`;
  }
  return finding;
}

function pluginFinding(settings: SettingsRead, standard: Standard): Finding | null {
  const required = standard.plugins.required;
  if (required.length === 0) return null;
  if (settings.state === "invalid") return null; // settings/missing 진단이 알린다
  const data = settings.state === "ok" ? settings.data : {};
  const enabled = data.enabledPlugins;
  const markets = data.extraKnownMarketplaces;
  const missing = required.filter((p) => !(isObject(enabled) && enabled[p] === true));
  if (missing.length === 0) {
    return {
      id: "plugins/required",
      severity: "ok",
      message: `사내 표준 플러그인이 켜져 있습니다: ${required.join(", ")}`,
    };
  }
  const message = `사내 표준 플러그인이 저장소 설정에 없습니다: ${missing.join(", ")}`;
  // 이미 false로 꺼 둔 플러그인을 켜거나 형식이 다른 값을 바꾸는 건 기존 값 변경이라 판단 필요 (R11 기준)
  const turnedOff = missing.filter((p) => isObject(enabled) && p in enabled);
  const badShape =
    (enabled !== undefined && !isObject(enabled)) ||
    (markets !== undefined && !isObject(markets)) ||
    (settings.state === "ok" && settings.unwritable !== undefined);
  if (turnedOff.length > 0 || badShape) {
    return {
      id: "plugins/required",
      severity: "warn",
      message,
      judgment: badShape
        ? ".claude/settings.json의 enabledPlugins·extraKnownMarketplaces 형식을 직접 고친 뒤 다시 점검하세요"
        : `꺼 둔 플러그인을 켤지 결정하세요: ${turnedOff.join(", ")} (기존 값을 바꾸는 변경이라 자동으로 고치지 않습니다)`,
    };
  }
  const existing = isObject(markets) ? markets : {};
  const marketplaces = Object.fromEntries(
    Object.entries(standard.plugins.marketplaces).filter(([k]) => !(k in existing)),
  );
  return {
    id: "plugins/required",
    severity: "warn",
    message,
    pluginFix: { marketplaces, enable: missing },
  };
}

export const checkStandardRules: Check = async ({ repoDir, settings, standard }) => {
  const findings: Finding[] = [];
  findings.push(...(await sectionFindings(repoDir, standard)));
  const ui = standard.requiredFiles.some((f) => f.when === "hasUI")
    ? await hasUI(repoDir, standard)
    : false;
  for (const file of standard.requiredFiles) {
    const f = await fileFinding(repoDir, file, ui);
    if (f) findings.push(f);
  }
  const p = pluginFinding(settings, standard);
  if (p) findings.push(p);
  return findings;
};
