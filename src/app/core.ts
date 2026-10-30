// 설치형 앱의 main 쪽 처리 (eng review R1). Electron을 불러오지 않아 단위 테스트로 확인한다.
//
//   화면 ──invoke──▶ main.ts (보낸 쪽 확인) ──▶ AppCore.메서드(입력 검증)
//                                                 ├─ 폴더: 선택 창·최근 목록에서 고른 것만 (allowed)
//                                                 ├─ 진단·고치기·되돌리기: 기존 엔진 그대로
//                                                 └─ Claude로 반영: claude-runner (진행은 emit으로 화면에)
//
// 바로 고치기와 되돌리기는 "미리 보기 → 적용" 두 단계다. 적용 때 다시 계산해 미리 본 것과 다르면 거절한다.
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import {
  applyWithBackup,
  executeUndo,
  findUndoTarget,
  normalizeBase,
  planUndo,
  type BackupOptions,
  type UndoTarget,
} from "../backup.js";
import { runGit, type GitRunner } from "../checks/git.js";
import {
  claudeEnv,
  isClaudeRunning,
  parseAuthStatus,
  resolveClaude,
  runClaudeTask,
  type RunResult,
  type RunnerOptions,
} from "../claude-runner.js";
import { diagnose, type Diagnosis } from "../diagnose.js";
import { HOOK_DIR } from "../hook-template.js";
import { score } from "../score.js";
import {
  applyAll,
  lineDiff,
  planFixes,
  SETTINGS_PATH,
  type FixCandidate,
  type FixPlan,
} from "../fix.js";
import { commitGuide, formatMarkdown, writeReport } from "../report.js";
import { detailFor } from "../details.js";
import {
  describeStandard,
  loadStandard,
  type FolderKind,
  type LoadedStandard,
} from "../standard.js";
import type { Finding } from "../types.js";
import type { Usage } from "../usage.js";
import type {
  AppEvent,
  AppState,
  Area,
  AreaView,
  ClaudeAction,
  ClaudeStatus,
  ClaudeView,
  CommitView,
  PushView,
  CriterionView,
  DiagnosisView,
  FindingView,
  FixView,
  RecentFolder,
  UndoView,
} from "./api.js";

const RECENT_MAX = 10;
export const COMMIT_MESSAGE = "chore: Claude Code 팀 설정 추가";

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? "";
}

// git 실패를 사람 말로: 이름·이메일 설정이 없을 때가 가장 흔하다
function gitError(what: string, stderr: string): string {
  if (/tell me who you are|user\.email|user\.name/i.test(stderr))
    return `이 PC에 git 사용자 이름·이메일이 설정돼 있지 않아 커밋하지 못했습니다. 모르면 팀 담당자에게 물어보세요.\n개발자: 터미널에서 git config --global user.name, user.email을 설정한 뒤 다시 시도하세요.\n원문: ${firstLine(stderr)}`;
  return `${what}에 실패했습니다. 모르면 팀 담당자에게 물어보세요.\n개발자: 터미널에서 직접 커밋해 보세요.\n원문: ${firstLine(stderr) || "원인 모름"}`;
}
// push 실패를 사람 말로: 로그인·권한, 원격에 새 커밋이 있는 경우가 흔하다
function pushError(stderr: string): string {
  if (
    /Authentication failed|could not read Username|Permission denied|403|terminal prompts disabled/i.test(
      stderr,
    )
  )
    return `팀 저장소에 로그인돼 있지 않거나 올릴 권한이 없습니다. 모르면 팀 담당자에게 물어보세요.\n개발자: 터미널에서 git push로 로그인한 뒤 다시 시도하세요.\n원문: ${firstLine(stderr)}`;
  if (/rejected|non-fast-forward|fetch first/i.test(stderr))
    return `다른 사람이 먼저 올린 변경이 있어 보내지 못했습니다. 모르면 팀 담당자에게 물어보세요.\n개발자: 터미널에서 git pull로 받은 뒤 다시 시도하세요.\n원문: ${firstLine(stderr)}`;
  return `팀 저장소에 올리지 못했습니다. 모르면 팀 담당자에게 물어보세요.\n개발자: 터미널에서 직접 git push 해 보세요.\n원문: ${firstLine(stderr) || "원인 모름"}`;
}

export interface CoreDeps {
  dataDir: string; // 최근 폴더·설정 저장 위치 (Electron userData)
  pickDirectory: () => Promise<string | null>;
  pickStandardFile: () => Promise<string | null>;
  pickSaveFile: (defaultName: string) => Promise<string | null>;
  emit: (e: AppEvent) => void;
  backup?: BackupOptions;
  runner?: Pick<RunnerOptions, "claude" | "env" | "timeoutMs" | "platform" | "scanLimit">;
  runGit?: GitRunner;
  checkClaude?: () => Promise<ClaudeStatus>;
  appVersion?: string; // 새 버전 알림 비교용
  openExternal?: (url: string) => Promise<void>; // http(s) 주소 열기
  showItem?: (path: string) => void; // 파일 탐색기에서 보기
  openPath?: (path: string) => Promise<void>; // 폴더를 탐색기로 열기
}

interface Config {
  standardPath?: string;
}

export class InputError extends Error {}

// 화면에 보여 줄 오류 문장: 무엇이 안 됐는지와 다음에 할 일 (Node 오류 코드를 사람 말로)
export function friendlyError(e: unknown): string {
  if (e instanceof InputError) return e.message;
  const err = e as NodeJS.ErrnoException;
  const where = err.path ? ` (${err.path})` : "";
  switch (err.code) {
    case "EACCES":
    case "EPERM":
      return `파일에 쓸 권한이 없습니다${where}. 읽기 전용 폴더이거나 다른 계정의 파일인지 확인한 뒤 다시 시도하세요.`;
    case "EBUSY":
      return `다른 프로그램이 파일을 쓰고 있습니다${where}. 편집기나 동기화 프로그램을 닫고 다시 시도하세요.`;
    case "ENOENT":
      return `파일이나 폴더를 찾지 못했습니다${where}. 폴더가 옮겨졌다면 ‘폴더 열기’로 다시 고르세요.`;
    case "ENOSPC":
      return "디스크 공간이 부족합니다. 공간을 확보한 뒤 다시 시도하세요.";
    default:
      return `처리하지 못했습니다: ${err.message ?? String(e)}. ‘다시 점검’을 누른 뒤 다시 시도하세요.`;
  }
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v.length === 0 || v.length > 4096)
    throw new InputError(`${what} 값이 잘못됐습니다`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new InputError(`${what} 값이 잘못됐습니다`);
  return v;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const AREA_TITLES: Record<Area, string> = {
  security: "보안",
  team: "팀 표준 (CLAUDE.md)",
  docs: "문서·구조",
  plugins: "스킬·플러그인",
};

export function areaOf(id: string): Area {
  if (id.startsWith("claude-md")) return "team";
  if (id.startsWith("file/")) return "docs";
  if (id.startsWith("plugins/")) return "plugins";
  return "security";
}

function fixFor(f: Finding, candidates: FixCandidate[]): FixCandidate | undefined {
  if (f.severity === "ok") return undefined;
  // settings.json이 없으면 차단 규칙·우회 막기·훅 고치기가 그 파일을 만든다
  if (f.id === "settings/missing" && !f.judgment)
    return candidates.find((c) => c.denyRules.length > 0 || c.bypass || c.hook || c.plugins);
  return candidates.find(
    (c) =>
      (f.denyRules?.length && c.denyRules.length > 0) ||
      (f.bypassFix && c.bypass) ||
      (f.hookFix && c.hook) ||
      (f.pluginFix && c.plugins) ||
      (f.createFile && c.createFile?.path === f.createFile.path),
  );
}

// 고치기를 적용했을 때의 예상 점수. 해결되는 항목은 통과로 보고, settings.json을 새로 만들면
// 생기는 "커밋 여부" 진단(checks/git.ts와 같은 규칙)을 더한다
export function expectedScore(diag: Diagnosis, chosen: FixCandidate[]): number {
  const findings: Finding[] = diag.findings.map((f) =>
    fixFor(f, chosen) ? { ...f, severity: "ok" } : f,
  );
  const createsSettings =
    diag.ctx.settings.state === "missing" &&
    chosen.some((c) => c.denyRules.length > 0 || c.bypass || c.plugins || c.hook);
  if (createsSettings && diag.usage === "team") {
    const { tracked, reason } = diag.ctx.git;
    const skip = diag.kind === "docs" && reason === "git 저장소가 아닙니다";
    if (tracked === false)
      findings.push({ id: "settings/committed", severity: "fail", message: "" });
    else if (tracked === null && !skip)
      findings.push({ id: "settings/committed", severity: "warn", message: "" });
  }
  return score(findings, diag.ctx.standard);
}

// 고친 뒤 settings.json까지 커밋했을 때의 점수. 커밋으로 풀리는 항목이 있거나 생길 때만 (git 저장소)
export function committedScore(diag: Diagnosis, chosen: FixCandidate[]): number | undefined {
  if (diag.usage === "solo" || diag.ctx.git.tracked !== false) return undefined;
  const findings: Finding[] = diag.findings.map((f) =>
    f.needsCommit || fixFor(f, chosen) ? { ...f, severity: "ok" } : f,
  );
  const s = score(findings, diag.ctx.standard);
  const before = chosen.length > 0 ? expectedScore(diag, chosen) : diag.score;
  return s > before ? s : undefined;
}

const SEVERITY_NAME = { fail: "위험", warn: "주의" } as const;

// [점검 기준] 화면: 지금 표준·폴더 종류에서 보는 항목 전체와 이 폴더의 결과.
// 진단 결과가 없는 항목은 아직 확인 전(다른 항목이 먼저 풀려야 봄)이거나 해당 없음이다
export function criteriaFor(diag: Diagnosis): CriterionView[] {
  const std = diag.ctx.standard;
  const shared = diag.standard.source === "shared";
  const pen = (s: "fail" | "warn") => `${SEVERITY_NAME[s]} −${std.score[s]}`;
  const out: CriterionView[] = [];
  const add = (
    c: Omit<CriterionView, "status" | "company"> & { company?: boolean },
    missing: Pick<CriterionView, "status" | "note">,
  ) => {
    const found = diag.findings.filter((f) => f.id === c.id);
    let result: Pick<CriterionView, "status" | "note"> = missing;
    if (found.some((f) => f.notApplicable))
      result = { status: "na", note: "이 폴더 종류에서는 보지 않습니다" };
    else if (found.length > 0)
      result = {
        status: found.some((f) => f.severity === "fail")
          ? "fail"
          : found.some((f) => f.severity === "warn")
            ? "warn"
            : "ok",
      };
    out.push({ ...c, company: c.company ?? false, ...result });
  };
  const notYet = { status: "pending" as const, note: "지금은 확인하지 않았습니다" };

  add(
    {
      id: "settings/missing",
      group: "보안",
      title: "팀 공용 설정 파일",
      rule: ".claude/settings.json이 폴더에 있습니다",
      penalty: pen("fail"),
    },
    notYet,
  );
  add(
    {
      id: "settings/env-read-deny",
      group: "보안",
      title: ".env 읽기 차단",
      rule: `.env 기본 이름 ${std.env.targets.length}가지와 폴더 안 실제 .env 파일을 Claude가 읽지 못하게 막습니다`,
      penalty: pen("fail"),
      penaltyNote: `.env가 아직 없으면 ${pen("warn")}`,
    },
    notYet,
  );
  add(
    {
      id: "settings/env-edit-deny",
      group: "보안",
      title: ".env 쓰기 차단",
      rule: "같은 파일을 Claude가 고치거나 새로 쓰지 못하게 막습니다",
      penalty: pen("warn"),
    },
    notYet,
  );
  add(
    {
      id: "settings/risky-allow",
      group: "보안",
      title: "위험한 자동 허용 없음",
      rule: "강제 푸시·rm -rf·Bash 전체 같은 명령을 묻지 않고 실행하게 허용하지 않습니다",
      penalty: pen("warn"),
    },
    notYet,
  );
  add(
    {
      id: "settings/bypass",
      group: "보안",
      title: "권한 우회 모드 막기",
      rule: "확인 없이 모든 명령을 실행하는 모드를 켤 수 없게 해 둡니다",
      penalty: pen("warn"),
    },
    notYet,
  );
  add(
    {
      id: "hooks/present",
      group: "보안",
      title: "위험 명령 차단 훅",
      rule: "강제 푸시·rm -rf를 실행 직전에 멈추는 훅이 등록돼 있습니다",
      penalty: pen("warn"),
    },
    notYet,
  );
  add(
    {
      id: "settings/committed",
      group: "팀 공유",
      title: "설정이 git에 커밋됨",
      rule: "settings.json이 커밋돼 팀원 모두에게 같게 적용됩니다. 보호 규칙이 개인 설정(settings.local.json)에만 있으면 안 됩니다",
      penalty: pen("fail"),
      penaltyNote: `커밋 여부를 확인할 수 없으면 ${pen("warn")}`,
    },
    { status: "pending", note: "설정 파일이 생기면 확인합니다" },
  );
  add(
    {
      id: "claude-md",
      group: "CLAUDE.md",
      title: "CLAUDE.md",
      rule: `CLAUDE.md 또는 .claude/CLAUDE.md가 있고 ${std.claudeMd.maxLines}줄 이하입니다`,
      penalty: `없으면 ${pen("fail")}`,
      penaltyNote: `길면 ${pen("warn")}`,
    },
    notYet,
  );
  const noClaudeMd = { status: "pending" as const, note: "CLAUDE.md가 생기면 확인합니다" };
  if (std.claudeMd.requiredSections.some((s) => s.id === "verify"))
    add(
      {
        id: "claude-md/verify",
        group: "CLAUDE.md",
        title: "검증 명령",
        rule: "검증 섹션이나 테스트·린트·타입체크 실행 명령이 적혀 있습니다",
        penalty: pen("warn"),
      },
      noClaudeMd,
    );
  const sections = std.claudeMd.requiredSections.filter((s) => s.id !== "verify");
  if (sections.length > 0)
    add(
      {
        id: "claude-md/sections",
        group: "CLAUDE.md",
        title: "필수 섹션",
        rule: sections.map((s) => s.title).join(", "),
        penalty: pen("warn"),
        company: shared,
      },
      noClaudeMd,
    );
  for (const file of std.requiredFiles)
    add(
      {
        id: `file/${file.id}`,
        group: "필수 파일",
        title: file.path,
        rule: file.when === "hasUI" ? `${file.title} · 화면이 있는 프로젝트만 봅니다` : file.title,
        penalty: pen(file.severity),
        company: shared,
      },
      file.when === "hasUI"
        ? { status: "na", note: "화면이 없는 프로젝트라 보지 않습니다" }
        : notYet,
    );
  if (std.plugins.required.length > 0)
    add(
      {
        id: "plugins/required",
        group: "플러그인",
        title: "사내 플러그인",
        rule: `저장소 설정에서 켜 둡니다: ${std.plugins.required.join(", ")}`,
        penalty: pen("warn"),
        company: shared,
      },
      { status: "pending", note: "settings.json을 읽을 수 있으면 확인합니다" },
    );
  return out;
}

export function toView(
  diag: Diagnosis,
  plan: FixPlan,
  canUndo: boolean,
  kindAuto = true,
  usageAuto = true,
): DiagnosisView {
  const counts = { ok: 0, warn: 0, fail: 0 };
  const byArea = new Map<Area, FindingView[]>();
  const order = { fail: 0, warn: 1, ok: 2 };
  for (const f of diag.findings) {
    if (!f.notApplicable) counts[f.severity]++; // 해당 없음은 통과로 세지 않는다
    const fix = fixFor(f, plan.candidates);
    const view: FindingView = {
      id: f.id,
      severity: f.severity,
      message: f.message,
      judgment: f.judgment,
      detail: detailFor(f.id),
      notApplicable: f.notApplicable,
      needsCommit: f.needsCommit,
      example: f.severity === "ok" ? undefined : f.example || undefined,
    };
    if (fix) {
      view.fixNo = fix.no;
      view.fixLabel = fix.createFile
        ? "바로 만들기"
        : fix.plugins
          ? "플러그인 설정 추가"
          : "바로 고치기";
    }
    if (f.severity !== "ok" && f.claudeTask && diag.standard.standard.claudeTasks[f.claudeTask]) {
      view.claudeTask = f.claudeTask;
      // 없는 파일을 새로 쓰면 "만들기", 있는 파일을 고치면 "반영"
      view.claudeLabel =
        f.id.startsWith("file/") || f.id === "claude-md" ? "Claude로 만들기" : "Claude로 반영";
      view.claudeTargets = diag.standard.standard.claudeTasks[f.claudeTask]?.targets;
    }
    const area = areaOf(f.id);
    byArea.set(area, [...(byArea.get(area) ?? []), view]);
  }
  const areas: AreaView[] = (Object.keys(AREA_TITLES) as Area[])
    .filter((a) => byArea.has(a))
    .map((a) => ({
      area: a,
      title: AREA_TITLES[a],
      findings: (byArea.get(a) ?? []).sort((x, y) => order[x.severity] - order[y.severity]),
    }));
  // 같은 고치기를 여러 항목이 나눠 쓰면(예: .env 차단 규칙) 화면에 먼저 나오는 항목에만 버튼을 둔다
  const shown = new Set<number>();
  for (const f of areas.flatMap((a) => a.findings)) {
    if (f.fixNo === undefined) continue;
    if (shown.has(f.fixNo)) {
      f.fixSharedWith = f.fixNo;
      delete f.fixNo;
      delete f.fixLabel;
    } else shown.add(f.fixNo);
  }
  return {
    path: diag.ctx.repoDir,
    score: diag.score,
    standard: describeStandard(diag.standard),
    standardName: `${diag.standard.standard.name} ${diag.standard.standard.version}`,
    standardSource: diag.standard.source,
    kind: diag.kind,
    kindAuto,
    kindReason: diag.kindGuess.reason,
    kindGuess: diag.kindGuess.kind,
    usage: diag.usage,
    usageAuto,
    usageReason: diag.usageGuess.reason,
    usageGuess: diag.usageGuess.usage,
    counts,
    areas,
    fixes: plan.candidates.map((c) => ({ no: c.no, title: c.title })),
    weights: diag.ctx.standard.score,
    expectedScore: plan.candidates.length > 0 ? expectedScore(diag, plan.candidates) : undefined,
    committedScore: committedScore(diag, plan.candidates),
    criteria: criteriaFor(diag),
    blocked: plan.blocked,
    canUndo,
  };
}

function claudeView(r: RunResult): ClaudeView {
  return {
    status: r.status,
    message: r.message,
    diffs: r.diffs.map((d) => ({ path: d.path, diff: d.diff })),
    outside: r.outside,
  };
}

function runClaudeCli(c: { command: string; args: string[] }, args: string[]): Promise<string> {
  return new Promise((done, fail) => {
    execFile(
      c.command,
      [...c.args, ...args],
      { timeout: 15_000, windowsHide: true, env: claudeEnv(process.env, c) },
      (err, out) => (err ? fail(err) : done(out.trim())),
    );
  });
}

// 설치(버전)와 로그인(claude auth status)을 확인한다. 로그인 확인이 안 되는 버전이면 loggedIn은 비운다
export async function defaultCheckClaude(): Promise<ClaudeStatus> {
  let c;
  let version: string;
  try {
    c = await resolveClaude();
    version = await runClaudeCli(c, ["--version"]);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  try {
    const auth = parseAuthStatus(await runClaudeCli(c, ["auth", "status"]));
    if (auth) return { ok: true, version, ...auth };
  } catch (e) {
    // 로그아웃 상태면 종료 코드가 0이 아니어도 JSON을 내놓는다
    const out = (e as { stdout?: string }).stdout;
    const auth = out ? parseAuthStatus(out) : null;
    if (auth) return { ok: true, version, ...auth };
  }
  return { ok: true, version };
}

// "1.2.3" 비교: a가 더 새로우면 양수
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export class AppCore {
  private allowed = new Map<string, string>(); // 정규화 경로 → 원래 경로
  private recent: RecentFolder[] = [];
  private config: Config = {};
  private claudeStatus: ClaudeStatus = { ok: false, error: "확인 중" };
  private fixPreview: { key: string; nos: number[]; titles: string[] } | null = null;
  private undoPreview: { key: string; backupDir: string } | null = null;
  private commitPreview: { key: string; files: string[] } | null = null;
  private pushPreview: { key: string; branch: string; target: string } | null = null;
  private unpushed = new Set<string>(); // 앱이 커밋했지만 아직 push하지 않은 폴더
  // 폴더별로 앱이 쓴 파일 (커밋 대상 후보). 앱을 다시 켜면 settings.json만 본다
  private written = new Map<string, Set<string>>();
  private claudeRun: {
    abort: AbortController;
    pending: RunResult | null;
    path: string;
    taskId: string;
  } | null = null;

  constructor(private deps: CoreDeps) {}

  async init(): Promise<void> {
    await mkdir(this.deps.dataDir, { recursive: true });
    this.config = await readJson<Config>(join(this.deps.dataDir, "config.json"), {});
    const recent = await readJson<unknown>(join(this.deps.dataDir, "recent.json"), []);
    if (Array.isArray(recent)) {
      for (const r of recent as RecentFolder[]) {
        if (typeof r?.path !== "string" || !isAbsolute(r.path)) continue;
        const kind = r.kind === "dev" || r.kind === "docs" ? r.kind : undefined;
        const usage = r.usage === "solo" || r.usage === "team" ? r.usage : undefined;
        this.recent.push({ path: r.path, score: r.score, at: String(r.at), kind, usage });
        this.allowed.set(this.key(r.path), r.path);
      }
    }
    this.claudeStatus = await (this.deps.checkClaude ?? defaultCheckClaude)();
  }

  private key(path: string): string {
    return normalizeBase(path, this.deps.runner?.platform).normalized;
  }

  // 선택 창이나 최근 목록에서 고른 폴더만 쓴다
  private folder(v: unknown): string {
    const path = str(v, "폴더");
    const found = this.allowed.get(this.key(path));
    if (found === undefined)
      throw new InputError("허용되지 않은 폴더입니다. ‘폴더 열기’로 선택하세요");
    return found;
  }

  private async standard(): Promise<LoadedStandard> {
    return loadStandard(this.config.standardPath);
  }

  private async saveRecent(): Promise<void> {
    await writeFile(
      join(this.deps.dataDir, "recent.json"),
      JSON.stringify(this.recent, null, 2) + "\n",
    );
  }

  private entry(path: string): RecentFolder | undefined {
    const k = this.key(path);
    return this.recent.find((r) => this.key(r.path) === k);
  }

  // kind·usage: undefined면 기존 선택 유지, null이면 자동 판별로 되돌림
  private async remember(
    path: string,
    score?: number,
    kind?: FolderKind | null,
    usage?: Usage | null,
  ): Promise<void> {
    const k = this.key(path);
    const prev = this.entry(path);
    const next: RecentFolder = { path, score: score ?? prev?.score, at: new Date().toISOString() };
    const chosen = kind === undefined ? prev?.kind : (kind ?? undefined);
    if (chosen) next.kind = chosen;
    const chosenUsage = usage === undefined ? prev?.usage : (usage ?? undefined);
    if (chosenUsage) next.usage = chosenUsage;
    this.recent = [next, ...this.recent.filter((r) => this.key(r.path) !== k)].slice(0, RECENT_MAX);
    this.allowed.set(k, path);
    await this.saveRecent();
  }

  async getState(refresh?: unknown): Promise<AppState> {
    if (refresh !== undefined && bool(refresh, "refresh"))
      this.claudeStatus = await (this.deps.checkClaude ?? defaultCheckClaude)();
    const loaded = await this.standard();
    const state: AppState = {
      recent: this.recent,
      standard: describeStandard(loaded),
      standardInfo: {
        name: loaded.standard.name,
        version: loaded.standard.version,
        file: loaded.source === "shared" && loaded.path ? basename(loaded.path) : undefined,
        path: loaded.source === "shared" ? loaded.path : undefined,
        guideUrl: loaded.standard.guideUrl,
      },
      standardError: loaded.error,
      claude: this.claudeStatus,
      running: isClaudeRunning(),
    };
    const app = loaded.standard.app;
    const current = this.deps.appVersion;
    if (app && current && compareVersions(app.latestVersion, current) > 0)
      state.update = {
        current,
        latest: app.latestVersion,
        downloadUrl: app.downloadUrl,
        note: app.note,
      };
    return state;
  }

  // 새 버전 위치 열기: http(s)는 브라우저로, 파일·공유 폴더 경로는 탐색기에서 보여 준다 (실행하지 않음)
  async openUpdate(): Promise<void> {
    const url = (await this.getState()).update?.downloadUrl;
    if (!url) throw new InputError("사내 표준 파일에 새 버전 위치(app.downloadUrl)가 없습니다");
    if (/^https?:\/\//i.test(url)) await this.deps.openExternal?.(url);
    else if (isAbsolute(url) || url.startsWith("\\\\")) this.deps.showItem?.(url);
    else throw new InputError(`열 수 없는 위치입니다: ${url}`);
  }

  async showFolder(v: unknown): Promise<void> {
    await this.deps.openPath?.(this.folder(v));
  }

  async openGuide(): Promise<void> {
    const url = (await this.standard()).standard.guideUrl;
    if (!url) throw new InputError("사내 표준 파일에 가이드 주소(guideUrl)가 없습니다");
    await this.deps.openExternal?.(url);
  }

  async pickFolder(recent?: unknown): Promise<string | null> {
    let path: string | null;
    if (recent !== undefined) path = this.folder(recent);
    else path = await this.deps.pickDirectory();
    if (path === null) return null;
    const s = await stat(path).catch(() => null);
    if (!s?.isDirectory()) throw new InputError(`폴더가 아닙니다: ${path}`);
    await this.remember(path);
    return path;
  }

  async pickStandard(reset?: unknown): Promise<AppState> {
    if (reset !== undefined && bool(reset, "reset")) {
      delete this.config.standardPath;
    } else {
      const path = await this.deps.pickStandardFile();
      if (path === null) return this.getState();
      this.config.standardPath = path;
    }
    await writeFile(
      join(this.deps.dataDir, "config.json"),
      JSON.stringify(this.config, null, 2) + "\n",
    );
    return this.getState();
  }

  // 폴더 종류·사용 방식은 사용자가 고른 값, 없으면 자동 판별
  private async run(path: string): Promise<{ diag: Diagnosis; plan: FixPlan }> {
    const diag = await diagnose(path, {
      runGit: this.deps.runGit,
      standard: await this.standard(),
      kind: this.entry(path)?.kind ?? "auto",
      usage: this.entry(path)?.usage ?? "auto",
    });
    return { diag, plan: planFixes(diag) };
  }

  async diagnose(v: unknown, kindIn?: unknown, usageIn?: unknown): Promise<DiagnosisView> {
    const path = this.folder(v);
    if (kindIn !== undefined) {
      if (kindIn !== "auto" && kindIn !== "dev" && kindIn !== "docs")
        throw new InputError("폴더 종류 값이 잘못됐습니다");
      await this.remember(path, undefined, kindIn === "auto" ? null : kindIn);
    }
    if (usageIn !== undefined) {
      if (usageIn !== "auto" && usageIn !== "solo" && usageIn !== "team")
        throw new InputError("사용 방식 값이 잘못됐습니다");
      await this.remember(path, undefined, undefined, usageIn === "auto" ? null : usageIn);
    }
    const { diag, plan } = await this.run(path);
    // 직접 고른 값이 자동 판별과 같으면 직접 지정을 풀고 자동으로 둔다
    const chosen = this.entry(path)?.kind;
    const chosenUsage = this.entry(path)?.usage;
    await this.remember(
      path,
      diag.score,
      chosen && chosen === diag.kindGuess.kind ? null : undefined,
      chosenUsage && chosenUsage === diag.usageGuess.usage ? null : undefined,
    );
    const target = await findUndoTarget(path, this.deps.backup);
    const canUndo = target !== null && !(await this.undoCommitted(path, target));
    const view = toView(
      diag,
      plan,
      canUndo,
      this.entry(path)?.kind === undefined,
      this.entry(path)?.usage === undefined,
    );
    const pushPending = await this.pushState(path);
    if (pushPending) view.pushPending = pushPending;
    return view;
  }

  private notRunning(): void {
    if (isClaudeRunning())
      throw new InputError("Claude 작업이 끝나거나 확인(적용·취소)한 뒤에 할 수 있습니다");
  }

  async fix(v: unknown, nosIn: unknown, applyIn: unknown): Promise<FixView> {
    const path = this.folder(v);
    const apply = bool(applyIn, "apply");
    if (!Array.isArray(nosIn) || nosIn.length === 0 || !nosIn.every((n) => Number.isInteger(n)))
      throw new InputError("고칠 항목 번호가 잘못됐습니다");
    const nos = [...new Set(nosIn as number[])].sort((a, b) => a - b);
    this.notRunning();
    const { diag, plan } = await this.run(path);
    const chosen = plan.candidates.filter((c) => nos.includes(c.no));
    if (chosen.length !== nos.length)
      throw new InputError("없는 고치기 항목입니다. 다시 점검하세요");
    const titles = chosen.map((c) => c.title);
    const key = this.key(path);

    if (!apply) {
      const changes = applyAll(diag.ctx.settings, chosen);
      this.fixPreview = { key, nos, titles };
      return {
        kind: "preview",
        previews: changes.map((c) => {
          const diff = lineDiff(c.before, c.after, c.path);
          return {
            path: c.path,
            diff,
            isNew: c.before === null,
            added: diff.split("\n").filter((l) => l.startsWith("+ ")).length,
            note: c.path.startsWith(`${HOOK_DIR}/`)
              ? "team-ai-kit 위험 명령 차단 훅 원본 그대로 복사"
              : chosen.some((x) => x.createFile?.path === c.path)
                ? "사내 표준 템플릿"
                : undefined,
          };
        }),
        items: chosen.map((c) => ({ no: c.no, title: c.title })),
        resolves: diag.findings.filter((f) => fixFor(f, chosen) !== undefined).length,
        expectedScore: expectedScore(diag, chosen),
      };
    }
    const p = this.fixPreview;
    if (
      !p ||
      p.key !== key ||
      p.nos.join() !== nos.join() ||
      p.titles.join("\n") !== titles.join("\n")
    )
      throw new InputError("미리 본 내용과 지금 상태가 다릅니다. 바뀔 내용을 다시 확인하세요");
    this.fixPreview = null;
    const changes = applyAll(diag.ctx.settings, chosen);
    this.noteWritten(
      key,
      changes.map((c) => c.path),
    );
    const { backupDir } = await applyWithBackup(
      path,
      changes.map((c) => ({ path: c.path, content: c.content })),
      this.deps.backup,
    );
    return {
      kind: "applied",
      files: changes.map((c) => c.path),
      backupDir,
      commitHint:
        diag.kind === "docs" && diag.ctx.git.tracked === null
          ? "이 폴더를 함께 쓰는 팀원에게도 적용됩니다 (git 저장소가 아님)"
          : commitGuide(diag, changes),
    };
  }

  async claude(action: unknown): Promise<ClaudeView> {
    const a = action as ClaudeAction;
    const empty = { diffs: [], outside: [] };
    switch (a?.type) {
      case "start": {
        const path = this.folder(a.path);
        const taskId = str(a.taskId, "작업");
        if (this.claudeRun)
          return { status: "busy", message: "이미 실행 중인 Claude 작업이 있습니다", ...empty };
        const { diag } = await this.run(path);
        const finding = diag.findings.find((f) => f.claudeTask === taskId && f.severity !== "ok");
        const abort = new AbortController();
        this.claudeRun = { abort, pending: null, path, taskId };
        let r: RunResult;
        try {
          r = await runClaudeTask(
            { repoDir: path, standard: diag.standard.standard, taskId, vars: finding?.claudeVars },
            {
              ...this.deps.runner,
              backup: this.deps.backup,
              signal: abort.signal,
              onProgress: (progress) => this.deps.emit({ type: "progress", progress }),
            },
          );
        } catch (e) {
          this.claudeRun = null;
          throw e;
        }
        if (r.status === "ready") this.claudeRun.pending = r;
        else this.claudeRun = null;
        return claudeView(r);
      }
      case "stop":
        if (!this.claudeRun || this.claudeRun.pending)
          return { status: "error", message: "실행 중인 Claude 작업이 없습니다", ...empty };
        this.claudeRun.abort.abort();
        return { status: "stopping", message: "중단하는 중입니다", ...empty };
      case "keep":
      case "discard": {
        const run = this.claudeRun;
        const pending = run?.pending;
        if (!run || !pending)
          return { status: "error", message: "확인할 Claude 결과가 없습니다", ...empty };
        this.claudeRun = null;
        await this.logDecision(run.path, run.taskId, a.type);
        if (a.type === "keep") {
          await pending.keep?.();
          this.noteWritten(
            this.key(run.path),
            pending.diffs.map((d) => d.path),
          );
          return {
            status: "kept",
            message: "적용했습니다. 되돌리기로 되돌릴 수 있습니다",
            ...empty,
          };
        }
        const problems = (await pending.discard?.()) ?? [];
        return {
          status: "discarded",
          message:
            problems.length === 0
              ? "취소하고 원래대로 되돌렸습니다"
              : `일부 파일을 되돌리지 못했습니다: ${problems.join("; ")}`,
          ...empty,
        };
      }
      default:
        throw new InputError("알 수 없는 Claude 동작입니다");
    }
  }

  // 반영 품질 지표(적용 / (적용+취소), 설계 Success Criteria)용 로컬 기록. 파일 내용은 남기지 않는다
  private async logDecision(path: string, taskId: string, decision: "keep" | "discard") {
    const line = JSON.stringify({ at: new Date().toISOString(), path, taskId, decision });
    await appendFile(join(this.deps.dataDir, "claude-decisions.jsonl"), line + "\n").catch(
      () => {},
    );
  }

  async undo(v: unknown, applyIn: unknown): Promise<UndoView> {
    const path = this.folder(v);
    const apply = bool(applyIn, "apply");
    this.notRunning();
    const target: UndoTarget | null = await findUndoTarget(path, this.deps.backup);
    if (target === null) return { kind: "none" };
    const items = await planUndo(path, target);
    const key = this.key(path);
    if (!apply) {
      this.undoPreview = { key, backupDir: target.backupDir };
      return {
        kind: "preview",
        createdAt: target.manifest.createdAt,
        items: items.map((i) => ({
          path: i.path,
          existedBefore: i.existedBefore,
          modifiedSince: i.modifiedSince,
          alreadyOriginal: i.alreadyOriginal,
        })),
      };
    }
    if (this.undoPreview?.key !== key || this.undoPreview.backupDir !== target.backupDir)
      throw new InputError("미리 본 되돌리기와 지금 상태가 다릅니다. 다시 확인하세요");
    this.undoPreview = null;
    const result = await executeUndo(path, target, items, this.deps.backup);
    return { kind: "done", ok: result.ok, statuses: result.statuses };
  }

  private noteWritten(key: string, paths: string[]): void {
    const set = this.written.get(key) ?? new Set<string>();
    for (const p of paths) set.add(p.replace(/\\/g, "/"));
    this.written.set(key, set);
  }

  // 앱에서 커밋하기: 앱이 쓴 파일(과 settings.json) 중 git이 바뀌었다고 보는 것만 커밋한다.
  // `git commit -- 파일`이라 사용자가 따로 스테이징해 둔 변경은 이 커밋에 섞이지 않는다. push는 하지 않는다
  async commit(v: unknown, applyIn: unknown): Promise<CommitView> {
    const path = this.folder(v);
    const apply = bool(applyIn, "apply");
    this.notRunning();
    const git = this.deps.runGit ?? runGit;
    const key = this.key(path);
    const prefix = await git(["rev-parse", "--show-prefix"], path);
    if (prefix.code !== 0)
      return { kind: "none", reason: "git 저장소가 아니라 커밋할 수 없습니다" };
    const base = (prefix.stdout ?? "").trim();
    const candidates = [...new Set([...(this.written.get(key) ?? []), SETTINGS_PATH])].filter(
      (p) => p !== "" && !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split("/").includes(".."),
    );
    const st = await git(
      ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...candidates],
      path,
    );
    if (st.code !== 0) throw new InputError(`git 상태를 읽지 못했습니다: ${firstLine(st.stderr)}`);
    const changed: string[] = [];
    const parts = (st.stdout ?? "").split("\0");
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i] ?? "";
      if (e.length < 4) continue;
      const file = e.slice(3);
      if (e[0] === "R" || e[0] === "C") i++; // 이름 바꾸기는 원래 이름이 다음 칸에 온다
      const rel = base && file.startsWith(base) ? file.slice(base.length) : file;
      if (candidates.includes(rel)) changed.push(rel);
    }
    const files = [...new Set(changed)].sort();
    if (files.length === 0)
      return {
        kind: "none",
        reason: "커밋할 변경이 없습니다. 이미 커밋했다면 ‘다시 점검’을 누르세요",
      };
    if (!apply) {
      this.commitPreview = { key, files };
      return { kind: "preview", files, message: COMMIT_MESSAGE };
    }
    const p = this.commitPreview;
    if (p?.key !== key || p.files.join("\n") !== files.join("\n"))
      throw new InputError("확인한 파일과 지금 상태가 다릅니다. 커밋할 파일을 다시 확인하세요");
    this.commitPreview = null;
    const add = await git(["add", "--", ...files], path);
    if (add.code !== 0) throw new InputError(gitError("git add", add.stderr));
    // 커밋 훅(린트 등)이 돌 수 있어 넉넉히 기다린다
    const c = await git(["commit", "-m", COMMIT_MESSAGE, "--", ...files], path, 120_000);
    if (c.code !== 0) throw new InputError(gitError("커밋", c.stderr));
    const set = this.written.get(key);
    for (const f of files) set?.delete(f);
    this.unpushed.add(key);
    return { kind: "done", files, message: COMMIT_MESSAGE };
  }

  // 마지막 반영이 이미 커밋됐는가: 그 파일들이 git에 추적되고 바뀐 것이 없으면 커밋된 것
  // (커밋한 뒤 되돌리기는 커밋된 파일을 지우는 새 변경만 남기므로 버튼을 숨긴다)
  private async undoCommitted(path: string, target: UndoTarget): Promise<boolean> {
    const git = this.deps.runGit ?? runGit;
    const files = target.manifest.files.map((f) => f.path);
    if (files.length === 0) return false;
    const tracked = await git(["ls-files", "--", ...files], path);
    if (tracked.code !== 0) return false; // git 저장소가 아니면 판단하지 않는다
    const listed = (tracked.stdout ?? "").split(/\r?\n/).filter(Boolean).length;
    if (listed < files.length) return false;
    const st = await git(["status", "--porcelain", "--", ...files], path);
    return st.code === 0 && (st.stdout ?? "").trim() === "";
  }

  // 앱이 한 커밋이 아직 원격에 없는가 (push 전). 앱이 커밋한 폴더만 본다
  private async pushState(path: string): Promise<{ branch: string; target: string | null } | null> {
    const key = this.key(path);
    if (!this.unpushed.has(key)) return null;
    const git = this.deps.runGit ?? runGit;
    const head = await git(["rev-parse", "--abbrev-ref", "HEAD"], path);
    const branch = (head.stdout ?? "").trim();
    if (head.code !== 0 || !branch) return null;
    const up = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path);
    if (up.code !== 0) return { branch, target: null };
    const ahead = await git(["rev-list", "--count", "@{u}..HEAD"], path);
    if (ahead.code === 0 && (ahead.stdout ?? "").trim() === "0") {
      this.unpushed.delete(key);
      return null;
    }
    return { branch, target: (up.stdout ?? "").trim() || null };
  }

  // 팀원에게 보내기: 지금 브랜치를 원격에 push한다 (미리 보기 → push). 추적 브랜치가 없으면 -u로 만든다
  async push(v: unknown, applyIn: unknown): Promise<PushView> {
    const path = this.folder(v);
    const apply = bool(applyIn, "apply");
    this.notRunning();
    const git = this.deps.runGit ?? runGit;
    const key = this.key(path);
    const head = await git(["rev-parse", "--abbrev-ref", "HEAD"], path);
    if (head.code !== 0) return { kind: "none", reason: "git 저장소가 아니라 push할 수 없습니다" };
    const branch = (head.stdout ?? "").trim();
    if (branch === "HEAD")
      return {
        kind: "none",
        reason: "브랜치가 아닌 상태(detached HEAD)라 push할 수 없습니다. 터미널에서 확인하세요",
      };
    const up = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path);
    let target: string;
    let remote: string | null = null;
    let ahead: number | null;
    if (up.code === 0) {
      target = (up.stdout ?? "").trim();
      const n = await git(["rev-list", "--count", "@{u}..HEAD"], path);
      ahead = n.code === 0 ? Number((n.stdout ?? "").trim()) : null;
      if (ahead === 0) {
        this.unpushed.delete(key);
        return { kind: "none", reason: `이미 ${target}에 올라가 있습니다` };
      }
    } else {
      const remotes = await git(["remote"], path);
      const names = (remotes.stdout ?? "").split(/\r?\n/).filter(Boolean);
      remote = names.includes("origin") ? "origin" : names.length === 1 ? (names[0] ?? null) : null;
      if (remote === null)
        return {
          kind: "none",
          reason:
            names.length === 0
              ? "원격 저장소(remote)가 연결돼 있지 않아 push할 수 없습니다"
              : "원격 저장소가 여러 개라 어디로 보낼지 정할 수 없습니다. 터미널에서 push하세요",
        };
      target = `${remote}/${branch}`;
      const n = await git(["rev-list", "--count", "HEAD", "--not", "--remotes"], path);
      ahead = n.code === 0 ? Number((n.stdout ?? "").trim()) : null;
    }
    if (!apply) {
      this.pushPreview = { key, branch, target };
      const range = remote === null ? ["@{u}..HEAD"] : ["HEAD", "--not", "--remotes"];
      const log = await git(["log", "--format=%h%x09%s", "-n", "20", ...range], path);
      const commits = (log.stdout ?? "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [sha = "", ...rest] = line.split("\t");
          const subject = rest.join("\t");
          return { sha, subject, mine: subject === COMMIT_MESSAGE };
        });
      return { kind: "preview", branch, target, ahead, newBranch: remote !== null, commits };
    }
    const p = this.pushPreview;
    if (p?.key !== key || p.branch !== branch || p.target !== target)
      throw new InputError("확인한 내용과 지금 상태가 다릅니다. 다시 확인하세요");
    this.pushPreview = null;
    const r = await git(remote ? ["push", "-u", remote, branch] : ["push"], path, 120_000);
    if (r.code !== 0) throw new InputError(pushError(r.stderr));
    this.unpushed.delete(key);
    return { kind: "done", target };
  }

  async saveReport(v: unknown): Promise<string | null> {
    const path = this.folder(v);
    const { diag, plan } = await this.run(path);
    const file = await this.deps.pickSaveFile(`cc-checkup-${basename(path) || "report"}.md`);
    if (file === null) return null;
    await writeReport(file, formatMarkdown(diag, plan));
    return file;
  }
}
