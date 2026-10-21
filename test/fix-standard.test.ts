import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type CliDeps } from "../src/cli.js";
import { readSettings } from "../src/checks/settings.js";
import { diagnose } from "../src/diagnose.js";
import { applyAll, applyFixes, planFixes, type FixCandidate } from "../src/fix.js";
import { loadStandard } from "../src/standard.js";
import { fakeGit, repoWith, settingsJson } from "./helpers.js";

const EXAMPLE = join(process.cwd(), "standard", "example-company.json");
const plugins = {
  marketplaces: { "team-ai-kit": { source: { source: "github", repo: "org/team-ai-kit" } } },
  enable: ["team-ai@team-ai-kit"],
};
const pluginFix: FixCandidate = { no: 1, title: "", denyRules: [], bypass: false, plugins };

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

describe("설치하기: 플러그인 설정 더하기만 (R4)", () => {
  it("없는 파일이면 마켓플레이스와 enabledPlugins로 새로 만든다", async () => {
    const change = applyFixes(await readSettings(await repoWith({})), [pluginFix]);
    expect(JSON.parse(change.after)).toEqual({
      extraKnownMarketplaces: plugins.marketplaces,
      enabledPlugins: { "team-ai@team-ai-kit": true },
    });
  });

  it("기존 키는 그대로 두고 빠진 것만 더한다", async () => {
    const before = settingsJson(
      { deny: ["Read(x)"] },
      {
        enabledPlugins: { "other@m": true },
        extraKnownMarketplaces: { m: { source: { source: "github", repo: "a/b" } } },
      },
    );
    const change = applyFixes(
      await readSettings(await repoWith({ ".claude/settings.json": before })),
      [pluginFix],
    );
    const after = JSON.parse(change.after);
    expect(after.enabledPlugins).toEqual({ "other@m": true, "team-ai@team-ai-kit": true });
    expect(Object.keys(after.extraKnownMarketplaces)).toEqual(["m", "team-ai-kit"]);
    expect(after.permissions).toEqual({ deny: ["Read(x)"] });
    // 기존 줄은 그대로 남는다
    for (const line of before.trimEnd().split("\n").slice(0, 4))
      expect(change.after).toContain(line);
  });
});

describe("planFixes·applyAll: 표준 후보", () => {
  it("예시 표준으로 빈 저장소를 보면 차단 규칙·우회·플러그인·plan.md 후보가 나온다", async () => {
    const d = await diagnose(await repoWith({ "CLAUDE.md": "# 앱\nnpm run test\n" }), {
      runGit: fakeGit({ code: 1 }),
      standard: await loadStandard(EXAMPLE),
    });
    const titles = planFixes(d).candidates.map((c) => c.title);
    expect(titles.some((t) => t.includes("플러그인"))).toBe(true);
    expect(titles.some((t) => t.includes("plan.md 만들기"))).toBe(true);
  });

  it("settings.json이 깨져도 파일 만들기 후보는 남는다", async () => {
    const d = await diagnose(await repoWith({ ".claude/settings.json": "{oops" }), {
      runGit: fakeGit({ code: 1 }),
      standard: await loadStandard(EXAMPLE),
    });
    const plan = planFixes(d);
    // 깨진 settings.json은 settings/missing의 판단 필요로 알리고, 설정 고치기 후보는 만들지 않는다
    expect(d.findings.find((f) => f.id === "settings/missing")?.judgment).toBeDefined();
    expect(plan.candidates.map((c) => c.createFile?.path)).toEqual(["plan.md"]);
  });

  it("applyAll은 설정 한 개 + 새 파일들을 돌려준다", async () => {
    const settings = await readSettings(await repoWith({}));
    const changes = applyAll(settings, [
      pluginFix,
      {
        no: 2,
        title: "",
        denyRules: [],
        bypass: false,
        createFile: { path: "plan.md", content: "# plan" },
      },
    ]);
    expect(changes.map((c) => c.path)).toEqual([".claude/settings.json", "plan.md"]);
    expect(changes[1]?.content).toBe("# plan\n");
  });
});

describe("CLI --standard", () => {
  async function deps(answers: string[]): Promise<CliDeps & { out: string[] }> {
    const out: string[] = [];
    return {
      out,
      interactive: true,
      ask: async () => answers.shift() ?? "",
      log: (l) => out.push(l),
      backup: { home: await mkdtemp(join(tmpdir(), "cc-home-")) },
      runGit: fakeGit({
        code: 1,
        stderr: "error: pathspec did not match any file(s) known to git",
      }),
    };
  }

  it("표준 이름·점수를 보여 주고, 고치기로 설정+plan.md를 함께 만들고 되돌리면 둘 다 사라진다", async () => {
    const repo = await repoWith({
      "CLAUDE.md": "# 앱\nnpm run test\n## 코딩 규칙\n## 하지 말 것\n",
    });
    const d = await deps(["a", "y", "y"]);
    expect(await run([repo, "--standard", EXAMPLE], d)).toBe(0);
    const text = d.out.join("\n");
    expect(text).toContain("사내 표준: 사내 Claude 표준 (예시) 0.1.0");
    expect(text).toContain("사내 표준 대비 점수:");
    expect(text).toContain(
      "git add .claude/settings.json .claude/hooks/cc-guard/block-dangerous-bash.cjs .claude/hooks/cc-guard/lib.cjs plan.md",
    );
    expect(
      JSON.parse(await readFile(join(repo, ".claude/settings.json"), "utf8")).enabledPlugins,
    ).toEqual({
      "team-ai@team-ai-kit": true,
    });
    expect(await exists(join(repo, "plan.md"))).toBe(true);

    expect(await run([repo, "--undo"], d)).toBe(0);
    expect(await exists(join(repo, "plan.md"))).toBe(false);
    expect(await exists(join(repo, ".claude"))).toBe(false);
  });

  it("표준 파일이 잘못되면 경고하고 기본 표준으로 진단", async () => {
    const d = await deps([]);
    await run([await repoWith({}), "--standard=nope.json"], { ...d, interactive: false });
    const text = d.out.join("\n");
    expect(text).toContain("기본 표준으로 진단합니다");
    expect(text).toContain("사내 표준: 기본 표준 1.0.0 (기본 내장)");
  });

  it("--standard 뒤에 값이 없으면 종료 코드 2", async () => {
    expect(await run(["--standard"], await deps([]))).toBe(2);
  });
});
