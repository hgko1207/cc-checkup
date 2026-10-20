import { checkClaudeMd } from "./checks/claude-md.js";
import { checkGit, gitTracking, type GitRunner } from "./checks/git.js";
import { checkSettings, readSettings } from "./checks/settings.js";
import { scanRepo } from "./env-rules.js";
import type { Check, CheckContext, Finding } from "./types.js";

// 새 진단은 여기에 등록한다 (출력 순서)
const CHECKS: Check[] = [checkClaudeMd, checkSettings, checkGit];

export interface Diagnosis {
  ctx: CheckContext;
  findings: Finding[];
}

export interface DiagnoseOptions {
  runGit?: GitRunner;
  scanLimit?: number;
}

export async function diagnose(repoDir: string, opts: DiagnoseOptions = {}): Promise<Diagnosis> {
  const [settings, scan, git] = await Promise.all([
    readSettings(repoDir),
    scanRepo(repoDir, opts.scanLimit),
    gitTracking(repoDir, opts.runGit),
  ]);
  const ctx: CheckContext = { repoDir, settings, scan, git };
  const findings: Finding[] = [];
  for (const check of CHECKS) findings.push(...(await check(ctx)));
  return { ctx, findings };
}
