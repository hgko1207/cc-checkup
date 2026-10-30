import { homedir } from "node:os";
import { join } from "node:path";
import { checkClaudeMd } from "./checks/claude-md.js";
import { checkGit, gitTracking, runGit, type GitRunner } from "./checks/git.js";
import { checkSettings, readJsonSettings, readSettings } from "./checks/settings.js";
import { checkStandardRules } from "./checks/standard-rules.js";
import { scanRepo } from "./env-rules.js";
import { score } from "./score.js";
import { detectKind, type KindGuess } from "./kind.js";
import { detectUsage, type Usage, type UsageGuess } from "./usage.js";
import { loadStandard, standardFor, type FolderKind, type LoadedStandard } from "./standard.js";
import type { Check, CheckContext, Finding } from "./types.js";

// 새 진단은 여기에 등록한다 (출력 순서)
const CHECKS: Check[] = [checkClaudeMd, checkSettings, checkGit, checkStandardRules];

export interface Diagnosis {
  ctx: CheckContext;
  findings: Finding[];
  standard: LoadedStandard;
  score: number;
  kind: FolderKind;
  kindGuess: KindGuess; // 자동 판별 결과 (사용자가 바꿨어도 남긴다)
  usage: Usage;
  usageGuess: UsageGuess; // 자동 추천 결과 (사용자가 바꿨어도 남긴다)
}

export interface DiagnoseOptions {
  runGit?: GitRunner;
  scanLimit?: number;
  standard?: LoadedStandard; // 없으면 기본 표준
  kind?: FolderKind | "auto"; // 없으면 개발 저장소(v0.3과 같음), auto면 자동 판별
  usage?: Usage | "auto"; // 없으면 팀(CLI와 같음), auto면 자동 추천
  home?: string; // 내 PC 전체 설정을 찾을 홈 폴더 (없으면 os.homedir(), 테스트에서 바꾼다)
}

export async function diagnose(repoDir: string, opts: DiagnoseOptions = {}): Promise<Diagnosis> {
  const loaded = opts.standard ?? (await loadStandard());
  const [settings, local, user, scan, git, kindGuess] = await Promise.all([
    readSettings(repoDir),
    readJsonSettings(join(repoDir, ".claude", "settings.local.json")),
    readJsonSettings(join(opts.home ?? homedir(), ".claude", "settings.json")),
    scanRepo(repoDir, opts.scanLimit),
    gitTracking(repoDir, opts.runGit),
    detectKind(repoDir),
  ]);
  const kind = opts.kind === "auto" ? kindGuess.kind : (opts.kind ?? "dev");
  const usageGuess = await detectUsage(repoDir, git, opts.runGit ?? runGit);
  const usage = opts.usage === "auto" ? usageGuess.usage : (opts.usage ?? "team");
  const forKind = standardFor(loaded.standard, kind);
  // 혼자 쓰는 저장소는 팀원에게 설치를 안내하는 사내 플러그인을 보지 않는다
  const standard =
    usage === "solo" ? { ...forKind, plugins: { ...forKind.plugins, required: [] } } : forKind;
  const other = { local, user };
  const ctx: CheckContext = { repoDir, settings, other, scan, git, standard, kind, usage };
  const findings: Finding[] = [];
  for (const check of CHECKS) findings.push(...(await check(ctx)));
  return {
    ctx,
    findings,
    standard: loaded,
    score: score(findings, standard),
    kind,
    kindGuess,
    usage,
    usageGuess,
  };
}
