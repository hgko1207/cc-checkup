import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppEvent, ClaudeView } from "../src/app/api.js";
import { CHANNELS, EVENT_CHANNEL } from "../src/app/channels.js";
import { AppCore, InputError, areaOf, type CoreDeps } from "../src/app/core.js";
import { fakeGit, repoWith } from "./helpers.js";

const FAKE = join(process.cwd(), "test", "fixtures", "fake-claude.mjs");
const EXAMPLE = join(process.cwd(), "standard", "example-company.json");

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

interface Setup {
  core: AppCore;
  deps: CoreDeps;
  repo: string;
  events: AppEvent[];
  picks: (string | null)[];
}

async function setup(files: Record<string, string> = { "CLAUDE.md": "# 앱\nnpm run test\n" }) {
  const repo = await repoWith(files);
  const dataDir = await mkdtemp(join(tmpdir(), "cc-data-"));
  const events: AppEvent[] = [];
  const picks: (string | null)[] = [repo];
  const deps: CoreDeps = {
    dataDir,
    pickDirectory: async () => picks.shift() ?? null,
    pickStandardFile: async () => picks.shift() ?? null,
    pickSaveFile: async () => picks.shift() ?? null,
    emit: (e) => events.push(e),
    backup: { home: await mkdtemp(join(tmpdir(), "cc-home-")) },
    runGit: fakeGit({ code: 1, stderr: "error: pathspec did not match any file(s) known to git" }),
    checkClaude: async () => ({ ok: true, version: "fake" }),
    runner: {
      claude: { command: process.execPath, args: [FAKE] },
      env: { ...process.env, FAKE_CLAUDE_MODE: "edit" },
    },
  };
  const core = new AppCore(deps);
  await core.init();
  const s: Setup = { core, deps, repo, events, picks };
  return s;
}

describe("IPC 채널 (R1)", () => {
  it("preload는 정해진 채널만 쓴다", async () => {
    const src = await readFile(join("src", "app", "preload.cts"), "utf8");
    const used = [...src.matchAll(/"(cc:[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(new Set(used)).toEqual(new Set([...Object.values(CHANNELS), EVENT_CHANNEL]));
  });

  it("창 보안 설정과 CSP", async () => {
    const src = await readFile(join("src", "app", "main.ts"), "utf8");
    for (const s of [
      "contextIsolation: true",
      "sandbox: true",
      "nodeIntegration: false",
      'setWindowOpenHandler(() => ({ action: "deny" }))',
      "default-src 'self'",
    ])
      expect(src).toContain(s);
    const html = await readFile(join("src", "app", "ui", "index.html"), "utf8");
    expect(html).toContain("default-src 'self'");
    const ui = await readFile(join("src", "app", "ui", "app.ts"), "utf8");
    expect(ui).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe("폴더 경로 검증", () => {
  it("선택 창에서 고른 폴더만 진단한다", async () => {
    const { core, repo } = await setup();
    await expect(core.diagnose(repo)).rejects.toThrow(InputError);
    expect(await core.pickFolder()).toBe(repo);
    expect((await core.diagnose(repo)).path).toBe(repo);
  });

  it.each([[123], [""], [null], [{}], ["x".repeat(5000)]])("잘못된 값 %j는 거절", async (v) => {
    const { core } = await setup();
    await expect(core.diagnose(v)).rejects.toThrow(InputError);
  });

  it("최근 목록은 다음 실행에도 허용되고 점수를 기억한다", async () => {
    const { core, deps, repo } = await setup();
    await core.pickFolder();
    const view = await core.diagnose(repo);
    const again = new AppCore(deps);
    await again.init();
    const state = await again.getState();
    expect(state.recent[0]).toMatchObject({ path: repo, score: view.score });
    expect(await again.pickFolder(repo)).toBe(repo);
  });

  it("최근 목록에 없는 경로를 최근으로 열 수 없다", async () => {
    const { core } = await setup();
    await expect(core.pickFolder(tmpdir())).rejects.toThrow("허용되지 않은 폴더");
  });

  it("선택 창을 닫으면 null, 폴더가 아니면 거절", async () => {
    const { core, picks, repo } = await setup();
    picks.splice(0, 1, null);
    expect(await core.pickFolder()).toBeNull();
    picks.push(join(repo, "CLAUDE.md"));
    await expect(core.pickFolder()).rejects.toThrow("폴더가 아닙니다");
  });
});

describe("진단 화면 데이터", () => {
  it("영역별로 묶고 고치기·Claude 버튼을 연결한다", async () => {
    const { core, deps, picks, repo } = await setup({ "CLAUDE.md": "# 앱\nnpm run test\n" });
    picks.push(EXAMPLE);
    await core.pickFolder();
    await core.pickStandard();
    const v = await core.diagnose(repo, "dev");
    expect(v.standard).toContain("사내 Claude 표준");
    const all = v.areas.flatMap((a) => a.findings.map((f) => ({ ...f, area: a.area })));
    const byId = (id: string) => all.find((f) => f.id === id);
    expect(byId("settings/missing")?.area).toBe("security");
    expect(byId("claude-md/sections")).toMatchObject({
      area: "team",
      claudeLabel: "Claude로 반영",
    });
    expect(byId("file/plan")).toMatchObject({ area: "docs", fixLabel: "바로 만들기" });
    expect(byId("plugins/required")).toMatchObject({ area: "plugins", fixLabel: "설치하기" });
    expect(all.filter((f) => f.severity === "ok").every((f) => f.fixNo === undefined)).toBe(true);
    expect(v.counts.fail + v.counts.warn + v.counts.ok).toBe(all.length);
    expect(v.canUndo).toBe(false);
    void deps;
  });

  it.each([
    ["settings/bypass", "security"],
    ["hooks/present", "security"],
    ["claude-md", "team"],
    ["file/design", "docs"],
    ["plugins/required", "plugins"],
  ])("%s → %s", (id, area) => {
    expect(areaOf(id)).toBe(area);
  });

  it("표준 파일을 기본으로 되돌린다", async () => {
    const { core, picks } = await setup();
    picks.splice(0, 1, EXAMPLE);
    expect((await core.pickStandard()).standard).toContain("공유 파일");
    expect((await core.pickStandard(true)).standard).toBe("기본 표준 1.0.0 (기본 내장)");
  });
});

describe("바로 고치기·되돌리기 (미리 보기 → 적용)", () => {
  it("미리 보기 없이 적용할 수 없다", async () => {
    const { core, repo } = await setup();
    await core.pickFolder();
    await expect(core.fix(repo, [1], true)).rejects.toThrow("미리 본 내용");
  });

  it.each([[[]], ["1"], [[1.5]], [[99]]])("잘못된 번호 %j는 거절", async (nos) => {
    const { core, repo } = await setup();
    await core.pickFolder();
    await expect(core.fix(repo, nos, false)).rejects.toThrow(InputError);
  });

  it("미리 보기 → 적용 → 되돌리기 왕복", async () => {
    const { core, repo } = await setup();
    await core.pickFolder();
    const before = await core.diagnose(repo);
    const nos = before.fixes.map((f) => f.no);
    const preview = await core.fix(repo, nos, false);
    expect(preview.kind).toBe("preview");
    if (preview.kind === "preview") expect(preview.previews[0]?.isNew).toBe(true);
    const applied = await core.fix(repo, nos, true);
    expect(applied).toMatchObject({
      kind: "applied",
      files: [
        ".claude/settings.json",
        ".claude/hooks/cc-guard/block-dangerous-bash.cjs",
        ".claude/hooks/cc-guard/lib.cjs",
      ],
    });
    if (applied.kind === "applied") expect(applied.commitHint).toContain("git add");
    const after = await core.diagnose(repo);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.canUndo).toBe(true);

    await expect(core.undo(repo, true)).rejects.toThrow("미리 본 되돌리기");
    const u = await core.undo(repo, false);
    expect(u.kind).toBe("preview");
    expect((await core.undo(repo, true)).kind).toBe("done");
    expect(await exists(join(repo, ".claude"))).toBe(false);
    expect((await core.undo(repo, false)).kind).toBe("none");
  });

  it("미리 본 뒤 상태가 바뀌면 적용을 거절", async () => {
    const { core, repo } = await setup();
    await core.pickFolder();
    const { fixes } = await core.diagnose(repo);
    await core.fix(repo, [1], false);
    await core.fix(
      repo,
      fixes.map((f) => f.no),
      false,
    ); // 다른 미리 보기로 덮음
    await expect(core.fix(repo, [1], true)).rejects.toThrow("미리 본 내용");
  });
});

describe("Claude로 반영 (가짜 claude)", () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  it("실행 → 진행 이벤트 → 확인 대기 중 다른 반영 막기 → 적용", async () => {
    const { core, deps, repo, events } = await setup({ "CLAUDE.md": "# 앱\nnpm run test\n" });
    await core.pickFolder();
    await core.pickStandard(true);
    const r: ClaudeView = await core.claude({ type: "start", path: repo, taskId: "claudeMd" });
    cleanups.push(() => core.claude({ type: "discard" }));
    expect(r.status).toBe("ready");
    expect(r.diffs[0]?.path).toBe("CLAUDE.md");
    expect(events.some((e) => e.progress.kind === "tool")).toBe(true);
    expect((await core.getState()).running).toBe(true);
    await expect(core.fix(repo, [1], false)).rejects.toThrow("Claude 작업");
    expect((await core.claude({ type: "start", path: repo, taskId: "claudeMd" })).status).toBe(
      "busy",
    );

    expect((await core.claude({ type: "keep" })).status).toBe("kept");
    expect((await core.getState()).running).toBe(false);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toContain("## 하지 말 것");
    expect((await core.diagnose(repo)).canUndo).toBe(true);
    const log = await readFile(join(deps.dataDir, "claude-decisions.jsonl"), "utf8");
    expect(JSON.parse(log.trim())).toMatchObject({
      path: repo,
      taskId: "claudeMd",
      decision: "keep",
    });
  });

  it("취소하면 원래대로", async () => {
    const { core, repo } = await setup();
    await core.pickFolder();
    await core.claude({ type: "start", path: repo, taskId: "claudeMd" });
    expect((await core.claude({ type: "discard" })).status).toBe("discarded");
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe("# 앱\nnpm run test\n");
  });

  it("허용 안 된 폴더·잘못된 동작은 거절, 할 일 없으면 error 상태", async () => {
    const { core, repo } = await setup();
    await expect(core.claude({ type: "start", path: repo, taskId: "claudeMd" })).rejects.toThrow(
      "허용되지 않은 폴더",
    );
    await expect(core.claude({ type: "rm" })).rejects.toThrow(InputError);
    await expect(core.claude(null)).rejects.toThrow(InputError);
    expect((await core.claude({ type: "stop" })).status).toBe("error");
    expect((await core.claude({ type: "keep" })).status).toBe("error");
  });
});

describe("리포트 저장", () => {
  it("고른 파일에 마크다운으로 저장, 창을 닫으면 null", async () => {
    const { core, repo, picks } = await setup();
    await core.pickFolder();
    const file = join(await mkdtemp(join(tmpdir(), "cc-rep-")), "r.md");
    picks.push(file);
    expect(await core.saveReport(repo)).toBe(file);
    expect(await readFile(file, "utf8")).toContain("<!-- cc-checkup report -->");
    expect(await core.saveReport(repo)).toBeNull();
  });
});

describe("폴더 종류 선택", () => {
  it("자동 판별 → 직접 고르면 기억 → 자동으로 되돌리기", async () => {
    const { core, deps, repo } = await setup({ "기획.md": "# 기획\n" });
    await core.pickFolder();
    const auto = await core.diagnose(repo);
    expect(auto).toMatchObject({ kind: "docs", kindAuto: true });
    expect(auto.kindReason).toContain("문서 파일");

    const dev = await core.diagnose(repo, "dev");
    expect(dev).toMatchObject({ kind: "dev", kindAuto: false });
    // 다음 실행에도 기억한다
    const again = new AppCore(deps);
    await again.init();
    expect((await again.getState()).recent[0]?.kind).toBe("dev");
    expect((await again.diagnose(repo)).kind).toBe("dev");

    expect(await again.diagnose(repo, "auto")).toMatchObject({ kind: "docs", kindAuto: true });
    await expect(again.diagnose(repo, "web")).rejects.toThrow("폴더 종류");
  });
});

describe("자세히·예시", () => {
  it("문제 항목에는 설명과 예시가 붙고 통과 항목에는 예시가 없다", async () => {
    const { core, repo } = await setup({ "CLAUDE.md": "# 앱\n" });
    await core.pickFolder();
    const all = (await core.diagnose(repo, "dev")).areas.flatMap((a) => a.findings);
    const verify = all.find((f) => f.id === "claude-md/verify");
    expect(verify?.detail?.why).toContain("검증 명령");
    expect(verify?.example).toContain("## 검증 명령");
    const env = all.find((f) => f.id === "settings/env-read-deny");
    expect(env?.detail?.limit).toContain("grep -r");
    expect(all.filter((f) => f.severity === "ok").every((f) => f.example === undefined)).toBe(true);
    const hook = all.find((f) => f.id === "hooks/present");
    expect(hook?.fixLabel).toBe("바로 고치기");
  });
});

describe("새 버전 알림·Claude 다시 확인", () => {
  async function coreWith(standard: object, extra: Partial<CoreDeps> = {}) {
    const { deps } = await setup();
    const file = join(await mkdtemp(join(tmpdir(), "cc-std-")), "s.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, JSON.stringify(standard));
    const opened: string[] = [];
    const core = new AppCore({
      ...deps,
      appVersion: "0.1.0",
      pickStandardFile: async () => file,
      openExternal: async (u) => void opened.push(`url:${u}`),
      showItem: (p) => void opened.push(`item:${p}`),
      ...extra,
    });
    await core.init();
    await core.pickStandard();
    return { core, opened };
  }

  it("표준의 latestVersion이 더 새로우면 알리고, 위치를 연다(실행하지 않고 탐색기에서 보기)", async () => {
    const share = String.raw`\\fileserver\tools\CC Checkup Setup 0.2.0.exe`;
    const { core, opened } = await coreWith({
      app: { latestVersion: "0.2.0", downloadUrl: share, note: "문서 폴더 모드 추가" },
    });
    expect((await core.getState()).update).toEqual({
      current: "0.1.0",
      latest: "0.2.0",
      downloadUrl: share,
      note: "문서 폴더 모드 추가",
    });
    await core.openUpdate();
    expect(opened).toEqual([`item:${share}`]);
  });

  it("같거나 옛 버전이면 알리지 않고, 상대 경로는 열지 않는다", async () => {
    expect(
      (await (await coreWith({ app: { latestVersion: "0.1.0" } })).core.getState()).update,
    ).toBeUndefined();
    const { core } = await coreWith({ app: { latestVersion: "1.0.0", downloadUrl: "setup.exe" } });
    await expect(core.openUpdate()).rejects.toThrow("열 수 없는 위치");
  });

  it("http 주소는 브라우저로 연다", async () => {
    const { core, opened } = await coreWith({
      app: { latestVersion: "0.1.1", downloadUrl: "https://intra.example.com/cc" },
    });
    await core.openUpdate();
    expect(opened).toEqual(["url:https://intra.example.com/cc"]);
  });

  it("getState(true)는 Claude 설치·로그인을 다시 확인한다", async () => {
    let n = 0;
    const { core } = await coreWith(
      {},
      { checkClaude: async () => ({ ok: true, loggedIn: n++ > 0, version: "x" }) },
    );
    expect((await core.getState()).claude.loggedIn).toBe(false);
    expect((await core.getState(true)).claude.loggedIn).toBe(true);
    await expect(core.getState("yes")).rejects.toThrow(InputError);
  });
});
