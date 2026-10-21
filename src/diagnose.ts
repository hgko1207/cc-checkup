import { checkClaudeMd } from "./checks/claude-md.js";
import { checkGit, gitTracking, type GitRunner } from "./checks/git.js";
import { checkSettings, readSettings } from "./checks/settings.js";
import { checkStandardRules } from "./checks/standard-rules.js";
import { scanRepo } from "./env-rules.js";
import { score } from "./score.js";
import { loadStandard, type LoadedStandard } from "./standard.js";
import type { Check, CheckContext, Finding } from "./types.js";

// 새 진단은 여기에 등록한다 (출력 순서)
const CHECKS: Check[] = [checkClaudeMd, checkSettings, checkGit, checkStandardRules];

export interface Diagnosis {
  ctx: CheckContext;
  findings: Finding[];
  standard: LoadedStandard;
  score: number;
}

export interface DiagnoseOptions {
  runGit?: GitRunner;
  scanLimit?: number;
  standard?: LoadedStandard; // 없으면 기본 표준
}

export async function diagnose(repoDir: string, opts: DiagnoseOptions = {}): Promise<Diagnosis> {
  const loaded = opts.standard ?? (await loadStandard());
  const [settings, scan, git] = await Promise.all([
    readSettings(repoDir),
    scanRepo(repoDir, opts.scanLimit),
    gitTracking(repoDir, opts.runGit),
  ]);
  const ctx: CheckContext = { repoDir, settings, scan, git, standard: loaded.standard };
  const findings: Finding[] = [];
  for (const check of CHECKS) findings.push(...(await check(ctx)));
  return { ctx, findings, standard: loaded, score: score(findings, loaded.standard) };
}
