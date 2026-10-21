import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStandardRules, hasSection, hasUI } from "../src/checks/standard-rules.js";
import { diagnose } from "../src/diagnose.js";
import { score } from "../src/score.js";
import { loadStandard, mergeStandard, type Standard } from "../src/standard.js";
import { DEFAULT_STANDARD } from "../src/standard-default.js";
import type { Finding } from "../src/types.js";
import { ctxFor, fakeGit, repoWith, settingsJson } from "./helpers.js";

async function company(): Promise<Standard> {
  return (await loadStandard(join("standard", "example-company.json"))).standard;
}

async function run(files: Record<string, string>, standard?: Standard): Promise<Finding[]> {
  return checkStandardRules(
    await ctxFor(await repoWith(files), { tracked: true }, standard ?? (await company())),
  );
}

const byId = (fs: Finding[], id: string) => fs.find((f) => f.id === id);

describe("기본 표준은 새 항목을 요구하지 않는다", () => {
  it("빈 저장소에서도 표준 규칙 결과가 없다", async () => {
    expect(await run({}, DEFAULT_STANDARD)).toEqual([]);
  });
});

describe("CLAUDE.md 필수 섹션", () => {
  it.each([
    ["## 코딩 규칙", ["규칙"], true],
    ["### Coding Rules", ["coding rules"], true],
    ["본문에만 코딩 규칙", ["규칙"], false],
  ])("%s / %j → %s", (text, aliases, expected) => {
    expect(hasSection(text, aliases)).toBe(expected);
  });

  it("빠진 섹션을 모아 warn + Claude 작업 연결", async () => {
    const f = byId(await run({ "CLAUDE.md": "# 앱\n## 코딩 규칙\n" }), "claude-md/sections");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toContain("하지 말 것");
    expect(f?.message).not.toContain("코딩 규칙");
    expect(f?.claudeTask).toBe("claudeMd");
  });

  it("두 위치를 합쳐 본다", async () => {
    const f = byId(
      await run({ "CLAUDE.md": "## 코딩 규칙\n", ".claude/CLAUDE.md": "## 하지 말 것\n" }),
      "claude-md/sections",
    );
    expect(f?.severity).toBe("ok");
  });

  it("CLAUDE.md가 없으면 섹션 진단은 하지 않는다 (claude-md 진단이 위험으로 알림)", async () => {
    expect(byId(await run({}), "claude-md/sections")).toBeUndefined();
  });
});

describe("필수 파일", () => {
  it("plan.md가 없으면 템플릿 만들기 후보", async () => {
    const f = byId(await run({}), "file/plan");
    expect(f?.severity).toBe("warn");
    expect(f?.createFile?.path).toBe("plan.md");
  });

  it("plan.md가 있으면 ok", async () => {
    expect(byId(await run({ "plan.md": "# plan" }), "file/plan")?.severity).toBe("ok");
  });

  it("화면 없는 프로젝트는 DESIGN.md를 요구하지 않는다", async () => {
    expect(
      byId(
        await run({ "package.json": JSON.stringify({ dependencies: { express: "1" } }) }),
        "file/design",
      ),
    ).toBeUndefined();
  });

  it("화면 있는 프로젝트에 DESIGN.md가 없으면 Claude 작업으로", async () => {
    const f = byId(
      await run({ "package.json": JSON.stringify({ devDependencies: { react: "19" } }) }),
      "file/design",
    );
    expect(f?.severity).toBe("warn");
    expect(f?.claudeTask).toBe("design");
    expect(f?.createFile).toBeUndefined();
  });

  it.each([
    [{ "package.json": JSON.stringify({ dependencies: { vue: "3" } }) }, true],
    [{ "index.html": "<html>" }, true],
    [{ "pubspec.yaml": "name: app" }, true],
    [{ "package.json": "{oops" }, false],
    [{}, false],
  ])("hasUI %j → %s", async (files, expected) => {
    expect(await hasUI(await repoWith(files), DEFAULT_STANDARD)).toBe(expected);
  });
});

describe("필수 플러그인 (R4)", () => {
  it("설정이 없으면 마켓플레이스·플러그인 추가 후보", async () => {
    const f = byId(await run({}), "plugins/required");
    expect(f?.severity).toBe("warn");
    expect(f?.pluginFix?.enable).toEqual(["team-ai@team-ai-kit"]);
    expect(Object.keys(f?.pluginFix?.marketplaces ?? {})).toEqual(["team-ai-kit"]);
  });

  it("이미 켜져 있으면 ok", async () => {
    const files = {
      ".claude/settings.json": settingsJson(
        {},
        { enabledPlugins: { "team-ai@team-ai-kit": true } },
      ),
    };
    expect(byId(await run(files), "plugins/required")?.severity).toBe("ok");
  });

  it("false로 꺼 둔 플러그인은 판단 필요 (기존 값 변경)", async () => {
    const files = {
      ".claude/settings.json": settingsJson(
        {},
        { enabledPlugins: { "team-ai@team-ai-kit": false } },
      ),
    };
    const f = byId(await run(files), "plugins/required");
    expect(f?.pluginFix).toBeUndefined();
    expect(f?.judgment).toContain("꺼 둔 플러그인");
  });

  it("이미 있는 마켓플레이스는 다시 넣지 않는다", async () => {
    const files = {
      ".claude/settings.json": settingsJson(
        {},
        {
          extraKnownMarketplaces: { "team-ai-kit": { source: { source: "directory", path: "x" } } },
        },
      ),
    };
    expect(byId(await run(files), "plugins/required")?.pluginFix?.marketplaces).toEqual({});
  });

  it("enabledPlugins 형식이 틀리면 판단 필요", async () => {
    const files = { ".claude/settings.json": settingsJson({}, { enabledPlugins: ["team-ai"] }) };
    expect(byId(await run(files), "plugins/required")?.judgment).toContain("형식");
  });
});

describe("점수 (T3)", () => {
  it("전부 통과면 100, 위험·주의만큼 깎고 0 아래로 가지 않는다", () => {
    const ok: Finding = { id: "a", severity: "ok", message: "" };
    const warn: Finding = { id: "b", severity: "warn", message: "" };
    const fail: Finding = { id: "c", severity: "fail", message: "" };
    expect(score([ok, ok], DEFAULT_STANDARD)).toBe(100);
    expect(score([warn, fail], DEFAULT_STANDARD)).toBe(80);
    expect(score(Array(10).fill(fail), DEFAULT_STANDARD)).toBe(0);
    expect(score([warn], mergeStandard(DEFAULT_STANDARD, { score: { fail: 30, warn: 10 } }))).toBe(
      90,
    );
  });

  it("diagnose가 점수와 표준을 함께 돌려준다", async () => {
    const d = await diagnose(await repoWith({}), { runGit: fakeGit({ code: 1 }) });
    expect(d.standard.source).toBe("default");
    expect(d.score).toBeLessThan(100);
  });
});
