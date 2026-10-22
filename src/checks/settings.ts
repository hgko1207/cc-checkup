import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileRule, isCovered, missingTargets, targetRule, type FileTool } from "../env-rules.js";
import type { Check, CheckContext, Finding, JsonFormat, SettingsRead } from "../types.js";

const RISKY_PREFIXES = ["git restore", "git reset", "git clean", "git push", "rm -rf", "rm -fr"];
const LIST_MAX = 5;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function stripBom(text: string): { text: string; bom: boolean } {
  return text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), bom: true } : { text, bom: false };
}

export function detectFormat(raw: string, bom: boolean): JsonFormat {
  const indented = /^([ \t]+)\S/m.exec(raw);
  const ws = indented?.[1] ?? "  ";
  return {
    bom,
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
    indent: ws.startsWith("\t") ? "\t" : ws,
    finalNewline: /\n$/.test(raw),
  };
}

// JSON 설정 파일을 읽는다. PowerShell 5.1이 붙인 BOM은 떼고 파싱한다
export async function readJsonSettings(filePath: string): Promise<SettingsRead> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return { state: "missing" };
  }
  const { text: raw, bom } = stripBom(text);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { state: "invalid", reason: `JSON 파싱 실패 (${(e as Error).message})` };
  }
  if (!isObject(data)) return { state: "invalid", reason: "최상위가 객체가 아닙니다" };

  let unwritable: string | undefined;
  const permissions = data.permissions;
  if (permissions !== undefined && !isObject(permissions)) {
    unwritable = "permissions가 객체가 아닙니다";
  } else if (
    isObject(permissions) &&
    permissions.deny !== undefined &&
    !Array.isArray(permissions.deny)
  ) {
    unwritable = "permissions.deny가 배열이 아닙니다";
  }
  return { state: "ok", raw, format: detectFormat(raw, bom), data, unwritable };
}

export function readSettings(repoDir: string): Promise<SettingsRead> {
  return readJsonSettings(join(repoDir, ".claude", "settings.json"));
}

function permissionsOf(settings: SettingsRead): Record<string, unknown> {
  if (settings.state !== "ok" || !isObject(settings.data.permissions)) return {};
  return settings.data.permissions;
}

function listNames(items: string[]): string {
  const shown = items.slice(0, LIST_MAX).join(", ");
  return items.length > LIST_MAX ? `${shown} 외 ${items.length - LIST_MAX}개` : shown;
}

const SCOPE_NOTE = "파일 도구·cat 등에는 적용, grep -r·스크립트는 못 막음";

// 진단 4·5: 기본 대상 6개와 실제 .env 파일이 deny 규칙에 덮이는가
function envDenyFinding(ctx: CheckContext, deny: string[], tool: FileTool): Finding {
  const read = tool === "Read";
  const id = read ? "settings/env-read-deny" : "settings/env-edit-deny";
  const verb = read ? "읽기" : "쓰기";
  const match = { baseDir: ctx.repoDir };
  const targets = ctx.standard.env.targets;
  const missing = missingTargets(deny, tool, match, targets);
  const uncovered = ctx.scan.envFiles.filter((f) => !isCovered(deny, tool, f, match));
  const denyRules = [
    ...new Set([
      ...missing.map((t) => targetRule(tool, t)),
      ...uncovered.map((f) => fileRule(tool, f)),
    ]),
  ];

  const problems: string[] = [];
  if (missing.length === targets.length) {
    problems.push(
      read
        ? "Claude가 파일 도구와 cat 같은 명령으로 .env를 읽을 수 있습니다 (읽기 차단 규칙 없음)"
        : "Claude가 .env 파일을 고쳐 쓸 수 있습니다 (쓰기 차단 규칙 없음)",
    );
  } else if (missing.length > 0) {
    problems.push(
      `기본 .env ${verb} 차단 ${targets.length}개 중 ${missing.length}개가 빠졌습니다: ${missing.join(", ")}`,
    );
  }
  if (uncovered.length > 0) {
    problems.push(`${verb} 차단에서 빠진 실제 파일: ${listNames(uncovered)}`);
  }
  if (ctx.scan.truncated) {
    problems.push("파일이 많아 일부 폴더만 확인했습니다 (20만 개 상한)");
  }

  if (problems.length === 0) {
    const extra = ctx.scan.envFiles.length > 0 ? ` + 실제 파일 ${ctx.scan.envFiles.length}개` : "";
    return {
      id,
      severity: "ok",
      message: `.env ${verb} 차단: 기본 ${targets.length}개${extra} (${SCOPE_NOTE})`,
    };
  }
  const severe = read && (missing.length === targets.length || uncovered.length > 0);
  return {
    id,
    severity: severe ? "fail" : "warn",
    message: problems.join(" / "),
    denyRules: denyRules.length > 0 ? denyRules : undefined,
  };
}

function riskyAllowFinding(allow: string[]): Finding {
  const risky = allow.filter(
    (r) => r === "Bash" || r === "Bash(*)" || RISKY_PREFIXES.some((p) => r.startsWith(`Bash(${p}`)),
  );
  if (risky.length === 0) {
    return { id: "settings/risky-allow", severity: "ok", message: "위험한 자동 허용 없음" };
  }
  return {
    id: "settings/risky-allow",
    severity: "warn",
    message: `묻지 않고 실행되는 위험 명령이 있습니다: ${risky.join(", ")}`,
    judgment:
      "permissions.allow의 위 규칙을 ask로 옮길지 결정하세요 (기존 허용을 바꾸는 변경이라 자동으로 고치지 않습니다)",
  };
}

function bypassFinding(permissions: Record<string, unknown>): Finding {
  const value = permissions.disableBypassPermissionsMode;
  if (value === "disable") {
    return { id: "settings/bypass", severity: "ok", message: "권한 우회 모드가 막혀 있습니다" };
  }
  if (value === undefined) {
    return {
      id: "settings/bypass",
      severity: "warn",
      message: "권한 우회 모드가 막혀 있지 않습니다",
      bypassFix: true,
    };
  }
  return {
    id: "settings/bypass",
    severity: "warn",
    message: `권한 우회 모드 설정 값이 "disable"이 아닙니다 (현재 ${JSON.stringify(value)})`,
    judgment: `permissions.disableBypassPermissionsMode를 ${JSON.stringify(value)}에서 "disable"로 바꿀지 결정하세요 (기존 값을 바꾸는 변경이라 자동으로 고치지 않습니다)`,
  };
}

// matcher가 Bash 도구에 맞는가: 비었거나 *, 아니면 정규식 전체 일치
export function matcherHitsBash(matcher: unknown): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test("Bash");
  } catch {
    return false;
  }
}

function hooksFinding(settings: SettingsRead, kind: CheckContext["kind"]): Finding {
  const data = settings.state === "ok" ? settings.data : {};
  const hooks = isObject(data.hooks) ? data.hooks : {};
  const pre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const hasBashHook = pre.some((h) => isObject(h) && matcherHitsBash(h.matcher));
  const plugins = isObject(data.enabledPlugins) ? data.enabledPlugins : {};
  const hasKit = Object.entries(plugins).some(([k, v]) => k.startsWith("team-ai@") && v === true);
  if (hasBashHook || hasKit) {
    return {
      id: "hooks/present",
      severity: "ok",
      message: hasKit
        ? "team-ai 플러그인이 켜져 있습니다 (훅 내용은 확인하지 않음)"
        : "Bash 명령 전에 실행되는 훅이 있습니다 (내용은 확인하지 않음)",
    };
  }
  // 문서·기획 폴더는 Claude가 git·삭제 명령을 쓸 일이 드물어 선택 사항으로 둔다 (점수에 넣지 않음)
  if (kind === "docs")
    return {
      id: "hooks/present",
      severity: "ok",
      message: "위험 명령 차단 훅은 문서 폴더에서 선택 사항입니다",
    };
  const message = "위험 명령(강제 푸시, rm -rf 등)을 막는 훅이 없습니다";
  // 훅을 더할 자리가 예상과 다르면(hooks·PreToolUse 형식) 기존 값을 바꿔야 해서 판단 필요
  const shapeOk =
    settings.state === "missing" ||
    (settings.state === "ok" &&
      !settings.unwritable &&
      (data.hooks === undefined ||
        (isObject(data.hooks) &&
          (data.hooks.PreToolUse === undefined || Array.isArray(data.hooks.PreToolUse)))));
  if (!shapeOk)
    return {
      id: "hooks/present",
      severity: "warn",
      message,
      judgment:
        ".claude/settings.json의 hooks 형식을 직접 고친 뒤 다시 점검하세요 (자동으로 고치지 않습니다)",
    };
  return { id: "hooks/present", severity: "warn", message, hookFix: true };
}

// 진단 2·4·5·6·7·8
export const checkSettings: Check = async (ctx) => {
  const { settings } = ctx;
  if (settings.state === "invalid") {
    return [
      {
        id: "settings/missing",
        severity: "fail",
        message: `.claude/settings.json을 읽을 수 없습니다: ${settings.reason}`,
        judgment:
          ".claude/settings.json의 JSON 문법을 고친 뒤 다시 실행하세요 (자동 고치기는 이 파일을 쓰지 않습니다)",
      },
    ];
  }

  const findings: Finding[] = [];
  if (settings.state === "missing") {
    findings.push({
      id: "settings/missing",
      severity: "fail",
      message: ".claude/settings.json이 없어 팀 공통 권한 설정이 없습니다",
    });
  } else if (settings.unwritable) {
    findings.push({
      id: "settings/missing",
      severity: "fail",
      message: `.claude/settings.json 구조가 예상과 다릅니다: ${settings.unwritable}`,
      judgment: `.claude/settings.json을 직접 고치세요: ${settings.unwritable} (자동 고치기는 이 파일을 쓰지 않습니다)`,
    });
  } else {
    findings.push({
      id: "settings/missing",
      severity: "ok",
      message: ".claude/settings.json 있음",
    });
  }

  const permissions = permissionsOf(settings);
  const deny = stringArray(permissions.deny);
  findings.push(envDenyFinding(ctx, deny, "Read"));
  findings.push(envDenyFinding(ctx, deny, "Edit"));
  findings.push(riskyAllowFinding(stringArray(permissions.allow)));
  findings.push(bypassFinding(permissions));
  findings.push(hooksFinding(settings, ctx.kind));
  return findings;
};
