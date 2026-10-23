import { execFile } from "node:child_process";
import { join } from "node:path";
import type { Check, Finding, GitTracking } from "../types.js";
import { readJsonSettings } from "./settings.js";

export interface GitResult {
  code: number | null;
  stderr: string;
  stdout?: string;
  error?: { code?: string | number | null; killed?: boolean };
}
export type GitRunner = (args: string[], cwd: string, timeoutMs?: number) => Promise<GitResult>;

export const runGit: GitRunner = (args, cwd, timeoutMs = 10_000) =>
  new Promise((resolve) => {
    execFile(
      "git",
      args,
      // 비밀번호를 터미널에서 묻다 멈추지 않게 한다 (창으로 묻는 자격 증명 관리자는 그대로)
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
        resolve({
          code,
          stderr: String(stderr),
          stdout: String(stdout),
          error: error ?? undefined,
        });
      },
    );
  });

// .claude/settings.json이 git에 추적되는가. 실행에 실패하면 tracked=null(확인 불가)과 원인
export async function gitTracking(repoDir: string, run: GitRunner = runGit): Promise<GitTracking> {
  const r = await run(["ls-files", "--error-unmatch", "--", ".claude/settings.json"], repoDir);
  if (r.code === 0) return { tracked: true };
  if (r.error?.code === "ENOENT") {
    return { tracked: null, reason: "git이 설치돼 있지 않거나 PATH에 없습니다" };
  }
  if (r.error?.killed) return { tracked: null, reason: "git 실행 시간이 초과됐습니다" };
  if (/dubious ownership/i.test(r.stderr)) {
    return { tracked: null, reason: "폴더 소유자가 달라 git이 거부했습니다 (safe.directory)" };
  }
  if (/not a git repository/i.test(r.stderr))
    return { tracked: null, reason: "git 저장소가 아닙니다" };
  if (/did not match any file/i.test(r.stderr)) return { tracked: false };
  const first = r.stderr.trim().split(/\r?\n/)[0] ?? "";
  return { tracked: null, reason: `git 실행 실패${first ? `: ${first}` : ""}` };
}

function protectiveRules(data: Record<string, unknown> | undefined): string[] {
  const permissions = data?.permissions;
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions))
    return [];
  const p = permissions as Record<string, unknown>;
  const deny = Array.isArray(p.deny)
    ? p.deny.filter((x): x is string => typeof x === "string")
    : [];
  return p.disableBypassPermissionsMode === "disable"
    ? [...deny, "disableBypassPermissionsMode"]
    : deny;
}

// 진단 3: 팀 설정이 커밋돼 있는가, 보호 규칙이 개인 설정에만 있지 않은가
export const checkGit: Check = async ({ repoDir, settings, git, kind }) => {
  const findings: Finding[] = [];
  if (settings.state !== "missing") {
    if (git.tracked === true) {
      findings.push({
        id: "settings/committed",
        severity: "ok",
        message: ".claude/settings.json이 git에 커밋돼 팀원 전원에게 적용됩니다",
      });
    } else if (git.tracked === false) {
      findings.push({
        id: "settings/committed",
        severity: "fail",
        message: ".claude/settings.json이 git에 커밋되지 않아 팀원에게 적용되지 않습니다",
        judgment: "git add .claude/settings.json 후 커밋하세요",
        needsCommit: true,
      });
    } else if (kind === "docs" && git.reason === "git 저장소가 아닙니다") {
      // 문서 폴더는 git 없이 쓰는 경우가 많다. 팀 공유는 폴더 공유로 한다고 보고 넘어간다
      findings.push({
        id: "settings/committed",
        severity: "ok",
        message:
          "git 저장소가 아닌 문서 폴더라 커밋 확인을 건너뜁니다 (폴더를 공유하면 설정도 함께 적용됩니다)",
      });
    } else {
      findings.push({
        id: "settings/committed",
        severity: "warn",
        message: `settings.json 커밋 여부를 확인할 수 없습니다: ${git.reason ?? "원인 모름"}`,
      });
    }
  }

  const local = await readJsonSettings(join(repoDir, ".claude", "settings.local.json"));
  const team = protectiveRules(settings.state === "ok" ? settings.data : undefined);
  const localOnly = protectiveRules(local.state === "ok" ? local.data : undefined).filter(
    (r) => !team.includes(r),
  );
  if (localOnly.length > 0) {
    findings.push({
      id: "settings/committed",
      severity: "fail",
      message: `보호 규칙이 개인 설정(settings.local.json)에만 있어 팀원마다 다릅니다: ${localOnly.join(", ")}`,
      judgment:
        "settings.local.json의 보호 규칙을 팀 공유 설정(settings.json)으로 옮길지 결정하세요 (개인 설정을 바꾸고 옮기는 변경이라 자동으로 고치지 않습니다)",
    });
  }
  return findings;
};
