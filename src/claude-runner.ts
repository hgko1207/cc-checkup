// "Claude로 반영" 실행기 (eng review R2·R5·R7·R8).
//
//   준비   실행 중인 작업 있음? ── 예 → busy
//          │ 아니오
//          작업 찾기(standard.claudeTasks[id]) → 대상 경로 검사
//          → 스냅샷(파일 목록·크기·수정 시각, node_modules·.git 제외) ── 20만 넘음 → too-large (실행 안 함)
//          → 대상 파일 백업(backup.ts createBackup — 앱이 죽어도 --undo로 복원)
//   실행   원본 폴더에서 claude -p --permission-mode dontAsk
//            --allowedTools "Read,Glob,Grep,Edit(/대상),Write(/대상)"  ← /로 시작해야 폴더 맨 위에 고정
//              (./대상은 하위 폴더의 같은 이름까지 허용됨 — claude 2.1.83 실제 실행으로 확인)
//            --disallowedTools "Bash,PowerShell,Read(<.env 대상>)" --strict-mcp-config
//            --no-session-persistence --output-format stream-json --verbose
//          지시문은 stdin으로 → stream-json 줄마다 진행 이벤트
//          중단(signal) 또는 10분 초과 → 프로세스 트리 종료
//   확인   다시 스냅샷 → 대상 밖 추가·변경·삭제?
//            중단·시간 초과·대상 밖 변경·실패·변경 없음 → 대상 파일을 백업대로 복원 (rolledBackAt)
//            대상만 바뀜 → ready: diff를 보여 주고 keep(유지, afterHash 기록) / discard(복원)
//
// 대상 밖 변경은 되돌리지 않고 목록으로 알린다: 스냅샷은 크기·시각만 갖고 있어(R7) 원본 내용이 없고,
// 새로 생긴 파일도 실행 중 사용자나 다른 프로그램(편집기, 개발 서버)이 만든 것일 수 있다.
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import {
  confirmBackup,
  createBackup,
  restoreBackup,
  type BackupOptions,
  type UndoTarget,
} from "./backup.js";
import { SCAN_LIMIT } from "./env-rules.js";
import { lineDiff } from "./fix.js";
import { targetError, type Standard } from "./standard.js";

export { targetError };

export const TIMEOUT_MS = 10 * 60 * 1000;
const SKIP_DIRS = new Set(["node_modules", ".git"]);

// ---- 대상 경로와 실행 인자 ----

export interface ArgsOptions {
  maxBudgetUsd?: number;
}

export function buildArgs(targets: string[], standard: Standard, opts: ArgsOptions = {}): string[] {
  const allowed = [
    "Read",
    "Glob",
    "Grep",
    ...targets.flatMap((t) => [`Edit(/${t})`, `Write(/${t})`]),
  ];
  const denied = ["Bash", "PowerShell", ...standard.env.targets.map((t) => `Read(${t})`)];
  const args = [
    "-p",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    allowed.join(","),
    "--disallowedTools",
    denied.join(","),
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  if (opts.maxBudgetUsd !== undefined) args.push("--max-budget-usd", String(opts.maxBudgetUsd));
  return args;
}

export function fillPrompt(prompt: string, vars: Record<string, string> = {}): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

// ---- claude 실행 파일 찾기 ----

export interface ClaudeCommand {
  command: string;
  args: string[]; // claude 인자 앞에 붙는 인자 (npm 설치본은 cli.js 경로)
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

// Windows의 npm 설치본(claude.cmd)은 shell 없이 실행할 수 없어, 그 안의 cli.js를 node로 직접 실행한다
export async function resolveClaude(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<ClaudeCommand> {
  if (platform !== "win32") return { command: "claude", args: [] };
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    const exe = join(dir, "claude.exe");
    if (await isFile(exe)) return { command: exe, args: [] };
    const cmd = join(dir, "claude.cmd");
    if (await isFile(cmd)) {
      const m = /"%dp0%\\([^"]+?\.js)"/i.exec(await readFile(cmd, "utf8"));
      if (!m?.[1]) throw new Error(`${cmd}의 형식을 알 수 없습니다`);
      const node = join(dir, "node.exe");
      return { command: (await isFile(node)) ? node : "node", args: [join(dir, m[1])] };
    }
  }
  throw new Error("claude 명령을 찾지 못했습니다. Claude Code를 설치했는지 확인하세요");
}

// ---- stream-json 진행 이벤트 ----

export type Progress =
  | { kind: "start"; model?: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; detail?: string }
  | { kind: "tool-error"; text: string }
  | { kind: "result"; ok: boolean; text?: string; costUsd?: number };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function contentOf(msg: unknown): unknown[] {
  return isObject(msg) && Array.isArray(msg.content) ? msg.content : [];
}

function toolDetail(input: unknown): string | undefined {
  if (!isObject(input)) return undefined;
  for (const key of ["file_path", "path", "pattern"]) {
    if (typeof input[key] === "string") return input[key] as string;
  }
  return undefined;
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v.map((x) => (isObject(x) && typeof x.text === "string" ? x.text : "")).join("");
  return "";
}

// 모르는 줄은 무시한다 (claude 버전마다 이벤트가 늘 수 있다)
export function parseStreamLine(line: string): Progress[] {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isObject(o)) return [];
  if (o.type === "system" && o.subtype === "init")
    return [{ kind: "start", model: typeof o.model === "string" ? o.model : undefined }];
  if (o.type === "assistant") {
    const out: Progress[] = [];
    for (const c of contentOf(o.message)) {
      if (!isObject(c)) continue;
      if (c.type === "text" && typeof c.text === "string" && c.text.trim() !== "")
        out.push({ kind: "text", text: c.text });
      if (c.type === "tool_use" && typeof c.name === "string")
        out.push({ kind: "tool", name: c.name, detail: toolDetail(c.input) });
    }
    return out;
  }
  if (o.type === "user") {
    return contentOf(o.message)
      .filter((c) => isObject(c) && c.type === "tool_result" && c.is_error === true)
      .map((c) => ({ kind: "tool-error", text: textOf((c as Record<string, unknown>).content) }));
  }
  if (o.type === "result") {
    return [
      {
        kind: "result",
        ok: o.is_error !== true && o.subtype === "success",
        text: typeof o.result === "string" ? o.result : undefined,
        costUsd: typeof o.total_cost_usd === "number" ? o.total_cost_usd : undefined,
      },
    ];
  }
  return [];
}

// ---- 스냅샷 (R7) ----

interface Snapshot {
  files: Map<string, { size: number; mtimeMs: number }>;
  truncated: boolean;
}

export async function snapshot(baseDir: string, limit = SCAN_LIMIT): Promise<Snapshot> {
  const files: Snapshot["files"] = new Map();
  let count = 0;
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(join(baseDir, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++count > limit) return { files, truncated: true };
      if (e.isSymbolicLink()) continue;
      const child = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(child);
      } else if (e.isFile()) {
        try {
          const s = await stat(join(baseDir, child));
          files.set(child, { size: s.size, mtimeMs: s.mtimeMs });
        } catch {
          // 그 사이 지워진 파일
        }
      }
    }
  }
  return { files, truncated: false };
}

export interface OutsideChange {
  path: string;
  change: "added" | "modified" | "deleted";
}

export function compareSnapshots(
  before: Snapshot,
  after: Snapshot,
  targets: string[],
): OutsideChange[] {
  const inTarget = new Set(targets);
  const out: OutsideChange[] = [];
  for (const [path, a] of after.files) {
    if (inTarget.has(path)) continue;
    const b = before.files.get(path);
    if (!b) out.push({ path, change: "added" });
    else if (b.size !== a.size || b.mtimeMs !== a.mtimeMs) out.push({ path, change: "modified" });
  }
  for (const path of before.files.keys()) {
    if (!inTarget.has(path) && !after.files.has(path)) out.push({ path, change: "deleted" });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

// ---- 실행 ----

export interface TargetDiff {
  path: string;
  before: string | null;
  after: string | null;
  diff: string;
}

export type RunStatus =
  | "ready" // 대상 파일만 바뀜 → keep/discard 대기
  | "unchanged"
  | "busy"
  | "too-large"
  | "error"
  | "cancelled"
  | "timeout"
  | "outside";

export interface RunResult {
  status: RunStatus;
  message: string;
  diffs: TargetDiff[];
  outside: OutsideChange[];
  restoreProblems: string[]; // 대상 파일을 되돌리지 못한 경우
  keep?: () => Promise<void>;
  discard?: () => Promise<string[]>;
}

export interface RunRequest {
  repoDir: string;
  standard: Standard;
  taskId: string;
  vars?: Record<string, string>; // 지시문의 {{이름}} 자리
}

export interface RunnerOptions {
  claude?: ClaudeCommand; // 없으면 resolveClaude()
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  scanLimit?: number;
  maxBudgetUsd?: number;
  signal?: AbortSignal; // 중단 버튼
  onProgress?: (p: Progress) => void;
  backup?: BackupOptions;
  platform?: NodeJS.Platform;
}

let active = false; // 한 번에 1개만 (R8). ready 상태는 keep/discard 전까지 실행 중으로 본다

export function isClaudeRunning(): boolean {
  return active;
}

function result(status: RunStatus, message: string, extra: Partial<RunResult> = {}): RunResult {
  return { status, message, diffs: [], outside: [], restoreProblems: [], ...extra };
}

async function killTree(pid: number | undefined, platform: NodeJS.Platform): Promise<void> {
  if (pid === undefined) return;
  if (platform === "win32") {
    await new Promise<void>((done) => {
      const k = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      k.on("close", () => done());
      k.on("error", () => done());
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL"); // detached로 띄워 프로세스 그룹 전체
    } catch {
      // 이미 끝남
    }
  }
}

interface ProcessOutcome {
  code: number | null;
  stopped?: "cancelled" | "timeout";
  spawnError?: string;
  stderr: string;
  final?: Extract<Progress, { kind: "result" }>;
}

function runProcess(
  claude: ClaudeCommand,
  args: string[],
  prompt: string,
  repoDir: string,
  opts: RunnerOptions,
  platform: NodeJS.Platform,
): Promise<ProcessOutcome> {
  return new Promise((resolveOutcome) => {
    const outcome: ProcessOutcome = { code: null, stderr: "" };
    let finished = false;
    const child = spawn(claude.command, [...claude.args, ...args], {
      cwd: repoDir,
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: platform !== "win32",
    });
    let closing: Promise<void> | null = null;
    const stop = (why: "cancelled" | "timeout") => {
      if (finished || outcome.stopped) return;
      outcome.stopped = why;
      closing = killTree(child.pid, platform);
    };
    const timer = setTimeout(() => stop("timeout"), opts.timeoutMs ?? TIMEOUT_MS);
    const onAbort = () => stop("cancelled");
    opts.signal?.addEventListener("abort", onAbort);
    if (opts.signal?.aborted) onAbort();

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      void Promise.resolve(closing).then(() => resolveOutcome(outcome));
    };

    child.on("error", (e) => {
      outcome.spawnError = e.message;
      finish();
    });
    child.on("close", (code) => {
      outcome.code = code;
      finish();
    });
    child.stdin.on("error", () => {
      // 일찍 끝난 프로세스에 쓰다 난 EPIPE는 close에서 처리
    });
    child.stdin.end(prompt);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      if (outcome.stderr.length < 10_000) outcome.stderr += d;
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      for (const p of parseStreamLine(line)) {
        if (p.kind === "result") outcome.final = p;
        opts.onProgress?.(p);
      }
    });
  });
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

const STOPPED_MESSAGE = {
  cancelled: "중단했습니다",
  timeout: "시간 제한(10분)을 넘어 중단했습니다",
};

export async function runClaudeTask(req: RunRequest, opts: RunnerOptions = {}): Promise<RunResult> {
  if (active) return result("busy", "이미 실행 중인 Claude 작업이 있습니다");
  active = true;
  let keepActive = false;
  try {
    return await runLocked(req, opts, () => {
      keepActive = true;
      return () => {
        active = false;
      };
    });
  } finally {
    if (!keepActive) active = false;
  }
}

async function runLocked(
  req: RunRequest,
  opts: RunnerOptions,
  holdLock: () => () => void,
): Promise<RunResult> {
  const { repoDir, standard } = req;
  const platform = opts.platform ?? process.platform;
  const task = standard.claudeTasks[req.taskId];
  if (!task) return result("error", `표준에 없는 Claude 작업입니다: ${req.taskId}`);
  const targets = [...new Set(task.targets)];
  const bad = targets.map(targetError).filter((e): e is string => e !== null);
  if (targets.length === 0) bad.push("대상 파일이 없습니다");
  if (bad.length > 0) return result("error", `작업 대상이 잘못됐습니다: ${bad.join("; ")}`);

  const limit = opts.scanLimit ?? SCAN_LIMIT;
  const before = await snapshot(repoDir, limit);
  if (before.truncated)
    return result(
      "too-large",
      `파일이 ${limit.toLocaleString()}개를 넘어 실행 전후 비교를 할 수 없습니다. Claude 실행을 막았습니다`,
    );

  let claude: ClaudeCommand;
  try {
    claude = opts.claude ?? (await resolveClaude(opts.env, platform));
  } catch (e) {
    return result("error", (e as Error).message);
  }

  const backup: UndoTarget = await createBackup(repoDir, targets, opts.backup);
  const originals = new Map<string, string | null>();
  for (const t of targets) originals.set(t, await readText(join(repoDir, t)));

  const proc = await runProcess(
    claude,
    buildArgs(targets, standard, { maxBudgetUsd: opts.maxBudgetUsd }),
    fillPrompt(task.prompt, req.vars),
    repoDir,
    opts,
    platform,
  );

  const after = await snapshot(repoDir, limit);
  const outside = compareSnapshots(before, after, targets);
  const restore = async (status: RunStatus, message: string): Promise<RunResult> => {
    const restoreProblems = await restoreBackup(repoDir, backup, opts.backup);
    const tail =
      restoreProblems.length > 0
        ? ` 대상 파일 일부를 되돌리지 못했습니다: ${restoreProblems.join("; ")}`
        : "";
    return result(status, message + tail, { outside, restoreProblems });
  };

  if (proc.stopped)
    return restore(
      proc.stopped,
      `${STOPPED_MESSAGE[proc.stopped]}. 대상 파일을 원래대로 되돌렸습니다.`,
    );
  if (outside.length > 0)
    return restore(
      "outside",
      `대상 밖 파일 ${outside.length}개가 바뀌어 반영하지 않고 대상 파일을 되돌렸습니다. ` +
        "대상 밖 파일은 실행 중 다른 프로그램이 바꿨을 수도 있어 그대로 두었습니다. 목록을 확인하세요.",
    );
  if (proc.spawnError) return restore("error", `claude를 실행하지 못했습니다: ${proc.spawnError}`);
  if (proc.code !== 0 || !proc.final?.ok) {
    const why = proc.final?.text ?? proc.stderr.trim().split(/\r?\n/).slice(-5).join("\n");
    return restore(
      "error",
      `Claude 실행이 실패했습니다 (종료 코드 ${proc.code ?? "없음"})${why ? `: ${why}` : ""}`,
    );
  }

  const diffs: TargetDiff[] = [];
  for (const t of targets) {
    const b = originals.get(t) ?? null;
    const a = await readText(join(repoDir, t));
    if (a !== b) diffs.push({ path: t, before: b, after: a, diff: lineDiff(b, a, t) });
  }
  if (diffs.length === 0) return restore("unchanged", "Claude가 바꾼 내용이 없습니다");

  const release = holdLock();
  let settled = false;
  return result(
    "ready",
    `${diffs.map((d) => d.path).join(", ")}이(가) 바뀌었습니다. 확인 후 적용하거나 취소하세요`,
    {
      diffs,
      keep: async () => {
        if (settled) return;
        settled = true;
        try {
          await confirmBackup(repoDir, backup);
        } finally {
          release();
        }
      },
      discard: async () => {
        if (settled) return [];
        settled = true;
        try {
          return await restoreBackup(repoDir, backup, opts.backup);
        } finally {
          release();
        }
      },
    },
  );
}
