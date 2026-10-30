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

// 저장소 밖 설정. 혼자 쓰면 보호로 인정하고, 팀이면 팀원에게는 적용되지 않는다고 알린다
type Scope = keyof CheckContext["other"];
const SCOPE_NAMES: Record<Scope, string> = {
  local: "개인 설정(settings.local.json)",
  user: "내 PC 전체 설정(~/.claude/settings.json)",
};
const TEAM_NOTE = "팀원에게는 적용되지 않습니다";

// 진단 4·5: 기본 대상 6개와 실제 .env 파일이 deny 규칙에 덮이는가
// where: 저장소 밖 설정에서 막혔을 때 그 이름 (통과 문장에 넣는다)
function envDenyFinding(
  ctx: CheckContext,
  deny: string[],
  tool: FileTool,
  where?: string,
): Finding {
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
  const hasEnv = ctx.scan.envFiles.length > 0;
  if (missing.length === targets.length && !hasEnv) {
    // 아직 .env가 없는 폴더: 지금 새는 것은 없으니 예방 차원의 주의로 알린다
    problems.push(
      read
        ? "아직 .env 파일은 없지만, 생기면 Claude가 읽을 수 있습니다 (읽기 차단 규칙 없음). 미리 막아 두세요"
        : "아직 .env 파일은 없지만, 생기면 Claude가 고칠 수 있습니다 (쓰기 차단 규칙 없음). 미리 막아 두세요",
    );
  } else if (missing.length === targets.length) {
    problems.push(
      read
        ? "Claude가 비밀 설정 파일(.env)을 읽을 수 있습니다 (읽기 차단 규칙 없음)"
        : "Claude가 비밀 설정 파일(.env)을 고칠 수 있습니다 (쓰기 차단 규칙 없음)",
    );
  } else if (missing.length > 0) {
    problems.push(
      `기본 .env ${verb} 차단 ${targets.length}개 중 ${missing.length}개가 빠졌습니다: ${missing.join(", ")}`,
    );
  }
  if (uncovered.length > 0) {
    problems.push(`${verb} 차단이 안 된 .env 파일: ${listNames(uncovered)}`);
  }
  if (ctx.scan.truncated) {
    problems.push("파일이 많아 일부 폴더만 확인했습니다 (20만 개 상한)");
  }

  if (problems.length === 0) {
    const extra = ctx.scan.envFiles.length > 0 ? ` + 실제 파일 ${ctx.scan.envFiles.length}개` : "";
    return {
      id,
      severity: "ok",
      message: `.env ${verb} 차단: 기본 ${targets.length}개${extra}${where ? `, ${where}에서 막음` : ""} (${SCOPE_NOTE})`,
    };
  }
  // 위험: 실제 .env가 있는데 읽기 차단이 없거나, 차단에서 빠진 실제 .env가 있을 때
  const severe = read && ((missing.length === targets.length && hasEnv) || uncovered.length > 0);
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

// Bash 명령 전에 실행되는 훅 또는 team-ai 플러그인이 있는가
function guardOf(settings: SettingsRead): "hook" | "kit" | null {
  const data = settings.state === "ok" ? settings.data : {};
  const plugins = isObject(data.enabledPlugins) ? data.enabledPlugins : {};
  if (Object.entries(plugins).some(([k, v]) => k.startsWith("team-ai@") && v === true))
    return "kit";
  const hooks = isObject(data.hooks) ? data.hooks : {};
  const pre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  return pre.some((h) => isObject(h) && matcherHitsBash(h.matcher)) ? "hook" : null;
}

function hooksFinding(settings: SettingsRead, kind: CheckContext["kind"]): Finding {
  const data = settings.state === "ok" ? settings.data : {};
  const guard = guardOf(settings);
  const hasKit = guard === "kit";
  if (guard !== null) {
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
      notApplicable: true,
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
  const others = (Object.keys(SCOPE_NAMES) as Scope[]).map((scope) => ({
    scope,
    read: ctx.other[scope],
    permissions: permissionsOf(ctx.other[scope]),
  }));
  const otherDeny = others.flatMap((o) => stringArray(o.permissions.deny));
  const where = (scopes: Scope[]) => scopes.map((s) => SCOPE_NAMES[s]).join(", ");
  const denyScopes = others.filter((o) => stringArray(o.permissions.deny).length > 0);
  const solo = ctx.usage === "solo";

  if (solo && settings.state === "missing") {
    // 혼자 쓰면 저장소 밖 설정만으로도 충분하다. 실제 보호 여부는 아래 항목들이 따로 본다
    const used = others.filter((o) => o.read.state === "ok").map((o) => o.scope);
    if (used.length > 0)
      findings[0] = {
        id: "settings/missing",
        severity: "ok",
        message: `저장소 설정 파일은 없지만 ${where(used)}을 씁니다`,
      };
  }

  for (const tool of ["Read", "Edit"] as const) {
    const own = envDenyFinding(ctx, deny, tool);
    const all = envDenyFinding(ctx, [...deny, ...otherDeny], tool);
    const elsewhere = own.severity !== "ok" && all.severity === "ok";
    const scopes = where(denyScopes.map((o) => o.scope));
    if (solo)
      findings.push(elsewhere ? envDenyFinding(ctx, [...deny, ...otherDeny], tool, scopes) : all);
    else
      findings.push(
        elsewhere
          ? { ...own, message: `${own.message}. ${scopes}에서는 막혀 있지만 ${TEAM_NOTE}` }
          : own,
      );
  }

  const allow = stringArray(permissions.allow);
  // 혼자 쓰면 내 PC 전체 설정의 허용도 이 저장소에서 그대로 실행된다
  findings.push(
    riskyAllowFinding(
      solo ? [...allow, ...others.flatMap((o) => stringArray(o.permissions.allow))] : allow,
    ),
  );

  const bypass = bypassFinding(permissions);
  const bypassElsewhere = others.filter(
    (o) => o.permissions.disableBypassPermissionsMode === "disable",
  );
  if (bypass.severity !== "ok" && bypassElsewhere.length > 0) {
    const scopes = where(bypassElsewhere.map((o) => o.scope));
    findings.push(
      solo
        ? {
            id: "settings/bypass",
            severity: "ok",
            message: `권한 우회 모드가 ${scopes}에서 막혀 있습니다`,
          }
        : { ...bypass, message: `${bypass.message}. ${scopes}에서는 막혀 있지만 ${TEAM_NOTE}` },
    );
  } else findings.push(bypass);

  const hooks = hooksFinding(settings, ctx.kind);
  const guarded = others.filter((o) => guardOf(o.read) !== null);
  if (hooks.severity !== "ok" && !hooks.notApplicable && guarded.length > 0) {
    const scopes = where(guarded.map((o) => o.scope));
    findings.push(
      solo
        ? {
            id: "hooks/present",
            severity: "ok",
            message: `${scopes}에 위험 명령 전에 실행되는 훅이 있습니다`,
          }
        : { ...hooks, message: `${hooks.message}. ${scopes}에는 있지만 ${TEAM_NOTE}` },
    );
  } else findings.push(hooks);
  return findings;
};
