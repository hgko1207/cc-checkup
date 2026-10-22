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
import type { GitRunner } from "../checks/git.js";
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
import { applyAll, lineDiff, planFixes, type FixCandidate, type FixPlan } from "../fix.js";
import { commitGuide, formatMarkdown, writeReport } from "../report.js";
import { detailFor } from "../details.js";
import {
  describeStandard,
  loadStandard,
  type FolderKind,
  type LoadedStandard,
} from "../standard.js";
import type { Finding } from "../types.js";
import type {
  AppEvent,
  AppState,
  Area,
  AreaView,
  ClaudeAction,
  ClaudeStatus,
  ClaudeView,
  DiagnosisView,
  FindingView,
  FixView,
  RecentFolder,
  UndoView,
} from "./api.js";

const RECENT_MAX = 10;

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
}

interface Config {
  standardPath?: string;
}

export class InputError extends Error {}

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
    return candidates.find((c) => c.denyRules.length > 0 || c.bypass || c.hook);
  return candidates.find(
    (c) =>
      (f.denyRules?.length && c.denyRules.length > 0) ||
      (f.bypassFix && c.bypass) ||
      (f.hookFix && c.hook) ||
      (f.pluginFix && c.plugins) ||
      (f.createFile && c.createFile?.path === f.createFile.path),
  );
}

export function toView(
  diag: Diagnosis,
  plan: FixPlan,
  canUndo: boolean,
  kindAuto = true,
): DiagnosisView {
  const counts = { ok: 0, warn: 0, fail: 0 };
  const byArea = new Map<Area, FindingView[]>();
  const order = { fail: 0, warn: 1, ok: 2 };
  for (const f of diag.findings) {
    counts[f.severity]++;
    const fix = fixFor(f, plan.candidates);
    const view: FindingView = {
      id: f.id,
      severity: f.severity,
      message: f.message,
      judgment: f.judgment,
      detail: detailFor(f.id),
      example: f.severity === "ok" ? undefined : f.example || undefined,
    };
    if (fix) {
      view.fixNo = fix.no;
      view.fixLabel = fix.createFile ? "바로 만들기" : fix.plugins ? "설치하기" : "바로 고치기";
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
  return {
    path: diag.ctx.repoDir,
    score: diag.score,
    standard: describeStandard(diag.standard),
    kind: diag.kind,
    kindAuto,
    kindReason: diag.kindGuess.reason,
    counts,
    areas,
    fixes: plan.candidates.map((c) => ({ no: c.no, title: c.title })),
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
        this.recent.push({ path: r.path, score: r.score, at: String(r.at), kind });
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
      throw new InputError("허용되지 않은 폴더입니다. [폴더 열기]로 선택하세요");
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

  // kind: undefined면 기존 선택 유지, null이면 자동 판별로 되돌림
  private async remember(path: string, score?: number, kind?: FolderKind | null): Promise<void> {
    const k = this.key(path);
    const prev = this.entry(path);
    const next: RecentFolder = { path, score: score ?? prev?.score, at: new Date().toISOString() };
    const chosen = kind === undefined ? prev?.kind : (kind ?? undefined);
    if (chosen) next.kind = chosen;
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

  // 폴더 종류는 사용자가 고른 값, 없으면 자동 판별
  private async run(path: string): Promise<{ diag: Diagnosis; plan: FixPlan }> {
    const diag = await diagnose(path, {
      runGit: this.deps.runGit,
      standard: await this.standard(),
      kind: this.entry(path)?.kind ?? "auto",
    });
    return { diag, plan: planFixes(diag) };
  }

  async diagnose(v: unknown, kindIn?: unknown): Promise<DiagnosisView> {
    const path = this.folder(v);
    if (kindIn !== undefined) {
      if (kindIn !== "auto" && kindIn !== "dev" && kindIn !== "docs")
        throw new InputError("폴더 종류 값이 잘못됐습니다");
      await this.remember(path, undefined, kindIn === "auto" ? null : kindIn);
    }
    const { diag, plan } = await this.run(path);
    await this.remember(path, diag.score);
    const canUndo = (await findUndoTarget(path, this.deps.backup)) !== null;
    return toView(diag, plan, canUndo, this.entry(path)?.kind === undefined);
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

  async saveReport(v: unknown): Promise<string | null> {
    const path = this.folder(v);
    const { diag, plan } = await this.run(path);
    const file = await this.deps.pickSaveFile(`cc-checkup-${basename(path) || "report"}.md`);
    if (file === null) return null;
    await writeReport(file, formatMarkdown(diag, plan));
    return file;
  }
}
