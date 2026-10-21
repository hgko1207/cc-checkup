import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeUndo, findUndoTarget, planUndo, type Manifest } from "../src/backup.js";
import {
  buildArgs,
  claudeEnv,
  installDirs,
  parseAuthStatus,
  compareSnapshots,
  fillPrompt,
  isClaudeRunning,
  parseStreamLine,
  resolveClaude,
  runClaudeTask,
  snapshot,
  targetError,
  type Progress,
  type RunResult,
  type RunnerOptions,
} from "../src/claude-runner.js";
import { mergeStandard, type Standard } from "../src/standard.js";
import { DEFAULT_STANDARD } from "../src/standard-default.js";
import { repoWith } from "./helpers.js";

const FAKE = join(process.cwd(), "test", "fixtures", "fake-claude.mjs");
const ORIGINAL = "# 앱\nnpm run test\n";

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function setup(mode: string, extraEnv: Record<string, string> = {}) {
  const repo = await repoWith({ "CLAUDE.md": ORIGINAL, "keep.txt": "그대로\n" });
  const home = await mkdtemp(join(tmpdir(), "cc-home-"));
  const log = join(home, "fake-log.json");
  const progress: Progress[] = [];
  const opts: RunnerOptions = {
    claude: { command: process.execPath, args: [FAKE] },
    env: { ...process.env, FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_LOG: log, ...extraEnv },
    backup: { home },
    onProgress: (p) => progress.push(p),
  };
  return { repo, home, log, progress, opts };
}

const req = (repoDir: string, taskId = "claudeMd", standard: Standard = DEFAULT_STANDARD) => ({
  repoDir,
  standard,
  taskId,
  vars: { missing: "하지 말 것" },
});

async function manifests(home: string): Promise<Manifest[]> {
  const root = join(home, ".cc-checkup", "backups");
  const out: Manifest[] = [];
  for (const name of await readdir(root))
    out.push(JSON.parse(await readFile(join(root, name, "manifest.json"), "utf8")) as Manifest);
  return out;
}

describe("실행 인자 (R2)", () => {
  it("dontAsk + 대상 파일만 편집, Bash·PowerShell·.env 읽기 금지, 세션 기록 없음", () => {
    const args = buildArgs(["CLAUDE.md", "docs/DESIGN.md"], DEFAULT_STANDARD, { maxBudgetUsd: 1 });
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args[0]).toBe("-p");
    expect(at("--permission-mode")).toBe("dontAsk");
    expect(at("--allowedTools")).toBe(
      "Read,Glob,Grep,Edit(/CLAUDE.md),Write(/CLAUDE.md),Edit(/docs/DESIGN.md),Write(/docs/DESIGN.md)",
    );
    const denied = at("--disallowedTools")?.split(",") ?? [];
    expect(denied).toEqual(
      expect.arrayContaining(["Bash", "PowerShell", "Read(.env)", "Read(.env.*.local)"]),
    );
    expect(args).toEqual(
      expect.arrayContaining(["--no-session-persistence", "--strict-mcp-config", "--verbose"]),
    );
    expect(at("--output-format")).toBe("stream-json");
    expect(at("--max-budget-usd")).toBe("1");
    expect(args.join(" ")).not.toMatch(/acceptEdits|bypassPermissions/);
  });

  it.each([
    ["CLAUDE.md", true],
    ["docs/DESIGN.md", true],
    ["한글.md", true],
    ["../x.md", false],
    ["/abs.md", false],
    ["a b.md", false],
    ["a,b.md", false],
    ["a(b).md", false],
    ["C:/x.md", false],
    ["a//b.md", false],
  ])("대상 %s → 허용 %s", (path, ok) => {
    expect(targetError(path) === null).toBe(ok);
  });

  it("지시문의 {{이름}}을 채우고 모르는 이름은 비운다", () => {
    expect(fillPrompt("빠진 것: {{missing}} / {{none}}", { missing: "규칙" })).toBe(
      "빠진 것: 규칙 / ",
    );
  });
});

describe("stream-json 진행", () => {
  it.each([
    ['{"type":"system","subtype":"init","model":"m"}', [{ kind: "start", model: "m" }]],
    [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"안녕"},{"type":"tool_use","name":"Read","input":{"file_path":"a.ts"}}]}}',
      [
        { kind: "text", text: "안녕" },
        { kind: "tool", name: "Read", detail: "a.ts" },
      ],
    ],
    [
      '{"type":"user","message":{"content":[{"type":"tool_result","is_error":true,"content":"denied"}]}}',
      [{ kind: "tool-error", text: "denied" }],
    ],
    [
      '{"type":"result","subtype":"success","is_error":false,"result":"끝","total_cost_usd":0.2}',
      [{ kind: "result", ok: true, text: "끝", costUsd: 0.2 }],
    ],
    [
      '{"type":"result","subtype":"error_during_execution","is_error":true}',
      [{ kind: "result", ok: false, text: undefined, costUsd: undefined }],
    ],
    ["not json", []],
    ['{"type":"stream_event"}', []],
  ])("%s", (line, expected) => {
    expect(parseStreamLine(line)).toEqual(expected);
  });
});

// Windows 경로 구분자로 파일을 찾으므로 Windows에서만 돈다 (macOS·Linux는 아래 describe)
describe.skipIf(process.platform !== "win32")("claude 찾기 (Windows)", () => {
  it("npm 설치본(claude.cmd)이면 node로 cli.js를 직접 실행", async () => {
    const dir = await repoWith({
      "claude.cmd":
        '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n',
    });
    const c = await resolveClaude({ PATH: dir }, "win32");
    expect(c.command).toBe("node");
    expect(c.args).toEqual([join(dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js")]);
  });

  it("claude.exe가 있으면 그것을 쓴다", async () => {
    const dir = await repoWith({ "claude.exe": "", "claude.cmd": "" });
    expect(await resolveClaude({ PATH: dir }, "win32")).toEqual({
      command: join(dir, "claude.exe"),
      args: [],
    });
  });

  it("없으면 설치 안내 오류", async () => {
    const empty = await repoWith({});
    await expect(
      resolveClaude({ PATH: empty, USERPROFILE: empty, HOME: empty }, "win32"),
    ).rejects.toThrow("설치");
  });

  it("PATH에 없어도 네이티브 설치 위치(~/.local/bin)에서 찾는다", async () => {
    const home = await repoWith({ ".local/bin/claude.exe": "" });
    const empty = await repoWith({});
    expect((await resolveClaude({ PATH: empty, USERPROFILE: home }, "win32")).command).toBe(
      join(home, ".local", "bin", "claude.exe"),
    );
  });
});

describe("claude 찾기 (macOS·Linux)", () => {
  it("PATH가 비어 있는 설치형 앱에서도 홈의 설치 위치를 찾는다", async () => {
    const c = await resolveClaude({ PATH: "", HOME: "/home/u" }, "linux").catch((e: Error) => e);
    // 테스트 PC에는 /home/u가 없으니 오류지만, 찾은 후보 목록에 홈 위치가 있어야 한다
    expect(c).toBeInstanceOf(Error);
    expect(installDirs({ HOME: "/home/u" }, "darwin")).toEqual(
      expect.arrayContaining(["/home/u/.local/bin", "/opt/homebrew/bin", "/usr/local/bin"]),
    );
  });

  it("claude를 띄울 때 node를 찾을 수 있게 PATH 앞에 설치 폴더를 붙인다", () => {
    const env = claudeEnv(
      { PATH: "/usr/bin", HOME: "/home/u" },
      { command: "/opt/homebrew/bin/claude", args: [] },
      "darwin",
    );
    expect(env.PATH?.split(":")[0]).toBe("/opt/homebrew/bin");
    expect(env.PATH).toContain("/usr/bin");
    expect(claudeEnv({ PATH: "x" }, { command: "c", args: [] }, "win32")).toEqual({ PATH: "x" });
  });
});

describe("로그인 확인 (claude auth status)", () => {
  it.each([
    [
      '{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.c","subscriptionType":"max"}',
      { loggedIn: true, account: "a@b.c", plan: "max" },
    ],
    ['{"loggedIn":false}', { loggedIn: false, account: undefined, plan: undefined }],
    ["Logged in as a@b.c", null],
    ['{"status":"ok"}', null],
  ])("%s", (text, expected) => {
    expect(parseAuthStatus(text)).toEqual(expected);
  });
});

describe("스냅샷 비교 (R7)", () => {
  it("대상 밖의 추가·변경·삭제만 잡고 node_modules·.git은 보지 않는다", async () => {
    const repo = await repoWith({
      "CLAUDE.md": "a",
      "a.txt": "a",
      "b.txt": "b",
      "node_modules/x/i.js": "x",
    });
    const before = await snapshot(repo);
    await writeFile(join(repo, "CLAUDE.md"), "바뀜");
    await writeFile(join(repo, "a.txt"), "길게 바뀜");
    await writeFile(join(repo, "c.txt"), "c");
    await writeFile(join(repo, "node_modules/x/i.js"), "길게 바뀜");
    const { rm } = await import("node:fs/promises");
    await rm(join(repo, "b.txt"));
    expect(compareSnapshots(before, await snapshot(repo), ["CLAUDE.md"])).toEqual([
      { path: "a.txt", change: "modified" },
      { path: "b.txt", change: "deleted" },
      { path: "c.txt", change: "added" },
    ]);
  });
});

describe("runClaudeTask (가짜 claude)", () => {
  // 테스트가 중간에 실패해도 ready 상태의 잠금을 남기지 않는다
  const pending: RunResult[] = [];
  const run = async (...a: Parameters<typeof runClaudeTask>) => {
    const r = await runClaudeTask(...a);
    pending.push(r);
    return r;
  };
  afterEach(async () => {
    for (const r of pending.splice(0)) await r.discard?.();
  });

  it("대상만 바뀌면 ready + diff, 지시문은 stdin으로, keep하면 --undo로 되돌릴 수 있다", async () => {
    const { repo, home, log, progress, opts } = await setup("edit");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("ready");
    expect(r.diffs.map((d) => d.path)).toEqual(["CLAUDE.md"]);
    expect(r.diffs[0]?.diff).toContain("+ ## 하지 말 것");
    expect(progress.map((p) => p.kind)).toEqual(["start", "text", "tool", "result"]);

    const sent = JSON.parse(await readFile(log, "utf8")) as { args: string[]; prompt: string };
    expect(sent.args).toEqual(buildArgs(["CLAUDE.md"], DEFAULT_STANDARD));
    expect(sent.prompt).toContain("빠진 필수 섹션(하지 말 것)");

    expect(isClaudeRunning()).toBe(true); // keep/discard 전까지 다른 실행을 막는다
    await r.keep?.();
    expect(isClaudeRunning()).toBe(false);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toContain("## 하지 말 것");

    const target = await findUndoTarget(repo, { home });
    expect(target?.manifest.files[0]?.afterHash).not.toBe("");
    const items = await planUndo(repo, target!);
    expect(items[0]?.modifiedSince).toBe(false);
    await executeUndo(repo, target!, items, { home });
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
  });

  it("discard하면 원래대로 돌리고 백업은 rolledBackAt", async () => {
    const { repo, home, opts } = await setup("edit");
    const r = await run(req(repo), opts);
    expect(await r.discard?.()).toEqual([]);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect((await manifests(home))[0]?.rolledBackAt).toBeDefined();
    expect(isClaudeRunning()).toBe(false);
  });

  it("새 폴더의 대상은 취소하면 폴더까지 지운다", async () => {
    const standard = mergeStandard(DEFAULT_STANDARD, {
      claudeTasks: { doc: { title: "문서", targets: ["docs/DESIGN.md"], prompt: "써라" } },
    });
    const { repo, opts } = await setup("edit", { FAKE_CLAUDE_TARGET: "docs/DESIGN.md" });
    const r = await run(req(repo, "doc", standard), opts);
    expect(r.status).toBe("ready");
    expect(r.diffs[0]?.before).toBeNull();
    await r.discard?.();
    expect(await exists(join(repo, "docs"))).toBe(false);
  });

  it("아무것도 안 바꾸면 unchanged", async () => {
    const { repo, opts } = await setup("noop");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("unchanged");
    expect(isClaudeRunning()).toBe(false);
  });

  it("모르는 출력 줄은 무시한다", async () => {
    const { repo, opts } = await setup("garbage");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("ready");
    await r.discard?.();
  });

  it("대상 밖이 바뀌면 반영하지 않고 대상만 되돌리며 대상 밖 파일은 건드리지 않는다", async () => {
    const { repo, opts } = await setup("outside");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("outside");
    expect(r.outside).toEqual([
      { path: "keep.txt", change: "modified" },
      { path: "src/other.ts", change: "added" },
    ]);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect(await exists(join(repo, "src/other.ts"))).toBe(true);
    expect(isClaudeRunning()).toBe(false);
  });

  it("실패 종료면 error + stderr 끝부분, 대상 복원", async () => {
    const { repo, opts } = await setup("fail");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("error");
    expect(r.message).toContain("boom");
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
  });

  it("result가 오류면 종료 코드 0이어도 error", async () => {
    const { repo, opts } = await setup("error-result");
    const r = await run(req(repo), opts);
    expect(r.status).toBe("error");
    expect(r.message).toContain("예산 초과");
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
  });

  it("시간 제한을 넘으면 하위 프로세스까지 끝내고 복원 (R8)", async () => {
    const pidFile = join(await mkdtemp(join(tmpdir(), "cc-pid-")), "pid");
    const { repo, opts } = await setup("hang", { FAKE_CLAUDE_CHILD_PID: pidFile });
    const r = await run(req(repo), { ...opts, timeoutMs: 1500 });
    expect(r.status).toBe("timeout");
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    const childPid = Number(await readFile(pidFile, "utf8"));
    await new Promise((d) => setTimeout(d, 300));
    expect(alive(childPid)).toBe(false);
  }, 15_000);

  it("중단하면 cancelled + 복원, 실행 중에는 다른 실행을 막는다", async () => {
    const pidFile = join(await mkdtemp(join(tmpdir(), "cc-pid-")), "pid");
    const { repo, opts } = await setup("hang", { FAKE_CLAUDE_CHILD_PID: pidFile });
    const ac = new AbortController();
    const second: Promise<RunResult>[] = [];
    const r = await run(req(repo), {
      ...opts,
      signal: ac.signal,
      onProgress: (p) => {
        if (p.kind === "text" && p.text === "기다리는 중") {
          second.push(run(req(repo), opts));
          ac.abort();
        }
      },
    });
    expect(r.status).toBe("cancelled");
    expect((await second[0])?.status).toBe("busy");
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect(isClaudeRunning()).toBe(false);
  }, 15_000);

  it("파일이 상한을 넘으면 claude를 실행하지 않는다", async () => {
    const { repo, log, opts } = await setup("edit");
    const r = await run(req(repo), { ...opts, scanLimit: 1 });
    expect(r.status).toBe("too-large");
    expect(await exists(log)).toBe(false);
  });

  it("claude를 띄우지 못하면 error, 백업은 rolledBackAt", async () => {
    const { repo, home, opts } = await setup("edit");
    const r = await run(req(repo), {
      ...opts,
      claude: { command: join(home, "없는-claude.exe"), args: [] },
    });
    expect(r.status).toBe("error");
    expect(r.message).toContain("실행하지 못했습니다");
    expect((await manifests(home))[0]?.rolledBackAt).toBeDefined();
  });

  it("표준에 없는 작업이나 잘못된 대상은 실행 전에 거절", async () => {
    const { repo, log, opts } = await setup("edit");
    expect((await run(req(repo, "nope"), opts)).status).toBe("error");
    // 표준 파일 검사(mergeStandard)를 거치지 않은 표준이 와도 실행 전에 막는다
    const bad: Standard = structuredClone(DEFAULT_STANDARD);
    bad.claudeTasks.x = { title: "x", targets: ["a b.md"], prompt: "p" };
    expect((await run(req(repo, "x", bad), opts)).message).toContain("공백");
    expect(await exists(log)).toBe(false);
  });
});
