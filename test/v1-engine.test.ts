import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type CliDeps } from "../src/cli.js";
import { readSettings } from "../src/checks/settings.js";
import { diagnose } from "../src/diagnose.js";
import { applyAll, planFixes, type FixCandidate } from "../src/fix.js";
import { HOOK_ENTRY, hookFiles } from "../src/hook-template.js";
import { detectKind } from "../src/kind.js";
import { formatMarkdown } from "../src/report.js";
import { loadStandard, mergeStandard, standardFor } from "../src/standard.js";
import { DEFAULT_STANDARD } from "../src/standard-default.js";
import { fakeGit, repoWith, settingsJson } from "./helpers.js";

const notGit = fakeGit({ code: 128, stderr: "fatal: not a git repository" });
const byId = (d: { findings: { id: string }[] }, id: string) => d.findings.find((f) => f.id === id);

describe("폴더 종류 자동 판별", () => {
  it.each([
    [{ "package.json": "{}" }, "dev"],
    [{ "pom.xml": "" }, "dev"],
    [{ "App.sln": "" }, "dev"],
    [{ "a.py": "", "b.py": "", "README.md": "" }, "dev"],
    [{ "기획서.md": "", "회의록/0101.md": "", "자료/시장.pdf": "" }, "docs"],
    [{ "notes.txt": "", "x.js": "" }, "docs"],
    [{}, "docs"],
  ])("%j → %s", async (files, kind) => {
    expect((await detectKind(await repoWith(files))).kind).toBe(kind);
  });

  it("진단은 기본이 개발 저장소, auto면 판별 결과", async () => {
    const repo = await repoWith({ "기획.md": "# 기획" });
    expect((await diagnose(repo, { runGit: notGit })).kind).toBe("dev");
    const d = await diagnose(repo, { runGit: notGit, kind: "auto" });
    expect(d.kind).toBe("docs");
    expect(d.kindGuess.reason).toContain("문서 파일");
  });
});

describe("문서·기획 폴더 기준", () => {
  it("문서 섹션을 요구하고 검증 명령은 보지 않으며, git이 아니어도 위험이 아니다", async () => {
    const repo = await repoWith({ "CLAUDE.md": "# 기획 폴더\n\n## 폴더 목적\n기획서 모음\n" });
    const d = await diagnose(repo, { runGit: notGit, kind: "docs" });
    expect(byId(d, "claude-md/verify")).toBeUndefined();
    const sections = d.findings.find((f) => f.id === "claude-md/sections");
    expect(sections?.message).toContain("폴더 구조");
    expect(sections?.message).not.toContain("폴더 목적");
    expect(sections?.claudeTask).toBe("claudeMdDocs");
    expect(sections?.example).toContain("## 폴더 구조");
  });

  it("문서 폴더 + git 아님이면 커밋 확인을 건너뛴다 (개발 저장소는 확인 불가 주의)", async () => {
    const repo = await repoWith({ ".claude/settings.json": "{}" });
    const docs = await diagnose(repo, { runGit: notGit, kind: "docs" });
    expect(docs.findings.find((f) => f.id === "settings/committed")?.severity).toBe("ok");
    const dev = await diagnose(repo, { runGit: notGit, kind: "dev" });
    expect(dev.findings.find((f) => f.id === "settings/committed")?.severity).toBe("warn");
  });

  it("standardFor는 docs 값으로 바꾸고 원래 표준은 두며, docs.plugins가 있으면 그것을 쓴다", () => {
    const s = mergeStandard(DEFAULT_STANDARD, {
      plugins: { required: ["a@m"] },
      docs: { plugins: { required: [] } },
    });
    expect(standardFor(s, "docs").plugins.required).toEqual([]);
    expect(standardFor(s, "dev").plugins.required).toEqual(["a@m"]);
    expect(standardFor(s, "docs").claudeMd.task).toBe("claudeMdDocs");
    expect(s.claudeMd.task).toBe("claudeMd");
  });
});

describe("CLAUDE.md 없음·검증 명령 없음도 Claude 작업", () => {
  it("없으면 Claude로 만들기 + 필수 섹션 이름 + 예시", async () => {
    const d = await diagnose(await repoWith({}), { runGit: notGit });
    const f = d.findings.find((x) => x.id === "claude-md");
    expect(f).toMatchObject({ claudeTask: "claudeMd", claudeVars: { missing: "검증 명령" } });
    expect(f?.example).toContain("## 검증 명령");
    expect(f?.judgment).not.toContain("http");
  });

  it("검증 명령이 없으면 Claude로 반영", async () => {
    const d = await diagnose(await repoWith({ "CLAUDE.md": "# 앱\n" }), { runGit: notGit });
    expect(d.findings.find((x) => x.id === "claude-md/verify")).toMatchObject({
      claudeTask: "claudeMd",
      claudeVars: { missing: "검증 명령" },
    });
  });
});

describe("표준 파일 새 항목", () => {
  it.each([
    [{ guideUrl: "ftp://x" }, "guideUrl"],
    [{ app: { latestVersion: "1.0" } }, "latestVersion"],
    [{ docs: { claudeMd: { task: "없는작업" } } }, "claudeTasks에 없습니다"],
    [
      { claudeMd: { requiredSections: [{ id: "a", title: "A", aliases: [], example: 1 }] } },
      "id·title·aliases",
    ],
  ])("%j는 거절 (%s)", (input, msg) => {
    expect(() => mergeStandard(DEFAULT_STANDARD, input)).toThrow(msg);
  });

  it("guideUrl이 있으면 안내 문구와 리포트에 붙는다", async () => {
    const dir = await repoWith({
      "s.json": JSON.stringify({ guideUrl: "https://wiki.example.com/claude" }),
    });
    const standard = await loadStandard(join(dir, "s.json"));
    const d = await diagnose(await repoWith({}), { runGit: notGit, standard });
    expect(d.findings.find((f) => f.id === "claude-md")?.judgment).toContain(
      "사내 가이드: https://wiki.example.com/claude",
    );
    expect(formatMarkdown(d, planFixes(d))).toContain(
      "사내 가이드: https://wiki.example.com/claude",
    );
  });

  it("예시 사내 표준 파일은 여전히 형식이 맞다", async () => {
    expect((await loadStandard(join("standard", "example-company.json"))).error).toBeUndefined();
  });
});

describe("위험 명령 차단 훅 바로 고치기", () => {
  const hookOnly = (files = hookFiles()): FixCandidate => ({
    no: 1,
    title: "",
    denyRules: [],
    bypass: false,
    hook: { files },
  });

  it("hooks가 없으면 hooks.PreToolUse를 만들고 훅 파일 두 개를 더한다", async () => {
    const settings = await readSettings(
      await repoWith({ ".claude/settings.json": settingsJson({}) }),
    );
    const changes = applyAll(settings, [hookOnly()]);
    expect(changes.map((c) => c.path)).toEqual([
      ".claude/settings.json",
      ".claude/hooks/cc-guard/block-dangerous-bash.cjs",
      ".claude/hooks/cc-guard/lib.cjs",
    ]);
    expect(JSON.parse(changes[0]!.after).hooks).toEqual({ PreToolUse: [HOOK_ENTRY] });
  });

  it("기존 PreToolUse 배열에 항목만 더하고 다른 훅은 그대로 둔다", async () => {
    const other = { matcher: "Edit", hooks: [{ type: "command", command: "echo hi" }] };
    const before = settingsJson({}, { hooks: { PreToolUse: [other], PostToolUse: [] } });
    const settings = await readSettings(await repoWith({ ".claude/settings.json": before }));
    const after = JSON.parse(applyAll(settings, [hookOnly([])])[0]!.after);
    expect(after.hooks.PreToolUse).toEqual([other, HOOK_ENTRY]);
    expect(after.hooks.PostToolUse).toEqual([]);
  });

  it("hooks는 있고 PreToolUse가 없으면 그 안에 더한다", async () => {
    const before = settingsJson({}, { hooks: { Stop: [] } });
    const settings = await readSettings(await repoWith({ ".claude/settings.json": before }));
    const after = JSON.parse(applyAll(settings, [hookOnly([])])[0]!.after);
    expect(after.hooks).toEqual({ Stop: [], PreToolUse: [HOOK_ENTRY] });
  });

  it("hooks 형식이 다르면 판단 필요, 고친 뒤에는 통과", async () => {
    const bad = await diagnose(
      await repoWith({ ".claude/settings.json": settingsJson({}, { hooks: [] }) }),
      { runGit: notGit },
    );
    const f = bad.findings.find((x) => x.id === "hooks/present");
    expect(f?.hookFix).toBeUndefined();
    expect(f?.judgment).toContain("hooks 형식");

    const repo = await repoWith({});
    const d = await diagnose(repo, { runGit: notGit });
    const plan = planFixes(d);
    const hookNo = plan.candidates.find((c) => c.hook)!.no;
    for (const c of applyAll(
      d.ctx.settings,
      plan.candidates.filter((c) => c.no === hookNo),
    ))
      await writeFile(join(repo, c.path), c.content, { flag: "w" }).catch(async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(join(repo, c.path, ".."), { recursive: true });
        await writeFile(join(repo, c.path), c.content);
      });
    const again = await diagnose(repo, { runGit: notGit });
    expect(again.findings.find((x) => x.id === "hooks/present")?.severity).toBe("ok");
  });

  it("이미 있는 훅 파일은 덮어쓰지 않는다", async () => {
    const repo = await repoWith({ ".claude/hooks/cc-guard/lib.cjs": "// 내 수정" });
    const plan = planFixes(await diagnose(repo, { runGit: notGit }));
    expect(plan.candidates.find((c) => c.hook)?.hook?.files.map((f) => f.path)).toEqual([
      ".claude/hooks/cc-guard/block-dangerous-bash.cjs",
    ]);
  });

  it("넣은 훅이 강제 푸시·rm -rf /를 막고 일반 명령은 통과시킨다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cc-hook-"));
    for (const f of hookFiles()) await writeFile(join(dir, f.path.split("/").pop()!), f.content);
    const runHook = (command: string) =>
      spawnSync(process.execPath, [join(dir, "block-dangerous-bash.cjs")], {
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      });
    expect(runHook("git push --force origin main").status).toBe(2);
    expect(runHook("rm -rf /").status).toBe(2);
    expect(runHook("npm run test").status).toBe(0);
    expect(String(runHook("rm -rf ~").stderr)).toContain("팀 안전 규칙");
  });
});

describe("CLI --kind", () => {
  const deps = (): CliDeps & { out: string[] } => {
    const out: string[] = [];
    return {
      out,
      interactive: false,
      ask: async () => "",
      log: (l) => out.push(l),
      runGit: notGit,
    };
  };

  it("docs로 지정하면 문서 폴더 기준으로 진단한다", async () => {
    const d = deps();
    await run([await repoWith({ "CLAUDE.md": "# x\n" }), "--kind", "docs"], d);
    expect(d.out.join("\n")).toContain("폴더 종류: 문서·기획 폴더");
  });

  it("잘못된 값은 종료 코드 2", async () => {
    expect(await run(["--kind", "web"], deps())).toBe(2);
  });
});
