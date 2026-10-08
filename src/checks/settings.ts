import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Check, Finding } from "../types.js";

const RISKY_PREFIXES = ["git restore", "git reset", "git clean", "git push", "rm -rf"];

function hasEnvRule(rules: string[], tool: "Read" | "Edit"): boolean {
  const prefix = `${tool}(`;
  return rules.some((r) => r.startsWith(prefix) && r.includes(".env"));
}

function findRiskyAllows(rules: string[]): string[] {
  return rules.filter((r) => {
    if (r === "Bash" || r === "Bash(*)") return true;
    for (const prefix of RISKY_PREFIXES) {
      if (r.startsWith(`Bash(${prefix}`)) return true;
    }
    return false;
  });
}

interface SettingsJson {
  permissions?: {
    allow?: string[];
    deny?: string[];
    disableBypassPermissionsMode?: string;
  };
}

export const checkSettings: Check = async (repoDir) => {
  const filePath = join(repoDir, ".claude", "settings.json");

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [
      {
        id: "settings/missing",
        severity: "fail",
        message: ".claude/settings.json이 없습니다.",
        fix: "팀 권한 설정 파일을 만드세요: .claude/settings.json",
      },
    ];
  }

  let settings: SettingsJson;
  try {
    settings = JSON.parse(raw) as SettingsJson;
  } catch {
    return [
      {
        id: "settings/missing",
        severity: "fail",
        message: ".claude/settings.json 파싱에 실패했습니다.",
        fix: "JSON 문법을 확인하세요.",
      },
    ];
  }

  const findings: Finding[] = [];
  const deny = settings.permissions?.deny ?? [];
  const allow = settings.permissions?.allow ?? [];

  // settings/env-read-deny
  if (hasEnvRule(deny, "Read")) {
    findings.push({
      id: "settings/env-read-deny",
      severity: "ok",
      message: ".env Read 차단 규칙 있음",
    });
  } else {
    findings.push({
      id: "settings/env-read-deny",
      severity: "fail",
      message: ".env 파일 읽기가 차단되지 않았습니다.",
      fix: 'permissions.deny에 "Read(**/.env)" 규칙을 추가하세요.',
    });
  }

  // settings/env-edit-deny
  if (hasEnvRule(deny, "Edit")) {
    findings.push({
      id: "settings/env-edit-deny",
      severity: "ok",
      message: ".env Edit 차단 규칙 있음",
    });
  } else {
    findings.push({
      id: "settings/env-edit-deny",
      severity: "warn",
      message: ".env 파일 쓰기가 차단되지 않았습니다.",
      fix: 'permissions.deny에 "Edit(**/.env)" 규칙을 추가하세요.',
    });
  }

  // settings/risky-allow
  const risky = findRiskyAllows(allow);
  if (risky.length > 0) {
    findings.push({
      id: "settings/risky-allow",
      severity: "warn",
      message: `위험한 자동 허용이 있습니다: ${risky.join(", ")}`,
      fix: "위험한 명령은 allow 대신 ask로 옮기세요.",
    });
  } else {
    findings.push({ id: "settings/risky-allow", severity: "ok", message: "위험한 자동 허용 없음" });
  }

  // settings/bypass-disabled
  if (settings.permissions?.disableBypassPermissionsMode === "disable") {
    findings.push({
      id: "settings/bypass-disabled",
      severity: "ok",
      message: "권한 우회 모드 비활성화됨",
    });
  } else {
    findings.push({
      id: "settings/bypass-disabled",
      severity: "warn",
      message: "권한 우회 모드가 비활성화되지 않았습니다.",
      fix: 'permissions에 "disableBypassPermissionsMode": "disable"를 추가하세요.',
    });
  }

  return findings;
};
