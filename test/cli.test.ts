import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type CliDeps } from "../src/cli.js";
import { parseSelection } from "../src/prompt.js";
import { LANDING_URL, REPORT_MARKER } from "../src/report.js";
import { fakeGit, repoWith, settingsJson } from "./helpers.js";

const S = ".claude/settings.json";

async function deps(
  answers: string[],
  interactive = true,
  gitCode = 1,
): Promise<CliDeps & { out: string[] }> {
  const out: string[] = [];
  return {
    out,
    interactive,
    ask: async (q) => {
      out.push(q);
      return answers.shift() ?? "";
    },
    log: (l) => out.push(l),
    backup: { home: await mkdtemp(join(tmpdir(), "cc-home-")) },
    runGit: fakeGit(
      gitCode === 0
        ? { code: 0 }
        : {
            code: 1,
            stderr:
              "error: pathspec '.claude/settings.json' did not match any file(s) known to git",
          },
    ),
  };
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

describe("parseSelection", () => {
  it.each([
    ["", 2, []],
    ["a", 2, [1, 2]],
    ["2,1", 2, [1, 2]],
    ["1, 1", 2, [1]],
    ["3", 2, null],
    ["x", 2, null],
  ])("%j → %j", (input, max, expected) => {
    expect(parseSelection(input, max)).toEqual(expected);
  });
});

describe("cc-checkup 흐름", () => {
  it("비TTY에서는 묻지 않고 아무 파일도 쓰지 않는다", async () => {
    const repo = await repoWith({});
    const d = await deps([], false);
    const code = await run([repo], d);
    expect(code).toBe(1);
    expect(await exists(join(repo, S))).toBe(false);
    expect(d.out.join("\n")).toContain("터미널에서 직접 실행하면");
    expect(d.out.some((l) => l.includes("[y/N]"))).toBe(false);
  });

  it("엔터(건너뛰기)·N이면 쓰지 않는다", async () => {
    for (const answers of [[""], ["a", "n"], ["a", ""]]) {
      const repo = await repoWith({});
      await run([repo], await deps(answers));
      expect(await exists(join(repo, S))).toBe(false);
    }
  });

  it("a → diff → y면 새 settings.json을 만들고 git add 안내 (R10)", async () => {
    const repo = await repoWith({});
    const d = await deps(["a", "y"]);
    expect(await run([repo], d)).toBe(0);
    const written = JSON.parse(await readFile(join(repo, S), "utf8"));
    expect(written.permissions.deny).toContain("Read(**/.env)");
    expect(written.permissions.disableBypassPermissionsMode).toBe("disable");
    const text = d.out.join("\n");
    expect(text).toContain("+++ .claude/settings.json");
    expect(text).toContain("npx cc-checkup --undo");
    expect(text).toContain("git add .claude/settings.json");
  });

  it("추적 중인 파일을 고치면 변경 커밋 안내", async () => {
    const repo = await repoWith({ [S]: settingsJson({ deny: [] }) });
    const d = await deps(["2", "y"], true, 0);
    await run([repo], d);
    expect(d.out.join("\n")).toContain("변경을 커밋해야");
  });

  it("고친 뒤 --undo로 되돌리면 원래 파일 그대로", async () => {
    const before = settingsJson({ deny: ["Read(x)"] });
    const repo = await repoWith({ [S]: before });
    const d = await deps(["a", "y", "y"]);
    await run([repo], d);
    expect(await readFile(join(repo, S), "utf8")).not.toBe(before);
    expect(await run([repo, "--undo"], d)).toBe(0);
    expect(await readFile(join(repo, S), "utf8")).toBe(before);
    expect(await run([repo, "--undo"], d)).toBe(0);
    expect(d.out.at(-1)).toBe("이 폴더에서 되돌릴 기록이 없습니다");
  });

  it("--undo는 비TTY에서 쓰지 않는다", async () => {
    const repo = await repoWith({});
    const d = await deps(["a", "y"]);
    await run([repo], d);
    const nd = { ...d, interactive: false };
    expect(await run([repo, "--undo"], nd)).toBe(1);
    expect(await exists(join(repo, S))).toBe(true);
  });

  it("settings.json이 깨졌으면 고치기 후보 없이 판단 필요만", async () => {
    const repo = await repoWith({ [S]: "{oops" });
    const d = await deps([]);
    await run([repo], d);
    const text = d.out.join("\n");
    expect(text).not.toContain("바로 고칠 수 있는 것");
    expect(text).toContain("JSON 문법을 고친 뒤");
  });

  it("알 수 없는 옵션은 종료 코드 2", async () => {
    expect(await run(["--fix"], await deps([]))).toBe(2);
  });
});

describe("--report (R2, R6)", () => {
  it("질문 없이 UTF-8 리포트만 쓰고 설정 파일은 쓰지 않는다", async () => {
    const repo = await repoWith({ ".env": "SECRET=1" });
    const report = join(repo, "checkup.md");
    const d = await deps([], true);
    await run([repo, "--report", report], d);
    const md = await readFile(report, "utf8");
    expect(md.split("\n")[0]).toBe(REPORT_MARKER);
    expect(md.trimEnd().split("\n").at(-1)).toContain(LANDING_URL);
    expect(md).toContain("## 위험");
    expect(md).not.toContain("SECRET=1"); // 내용은 읽지 않는다
    expect(await exists(join(repo, S))).toBe(false);
    expect(d.out.some((l) => l.includes("[y/N]") || l.includes("적용할 번호"))).toBe(false);
  });

  it("우리 리포트는 덮어쓰고, 표식 없는 파일은 거부(종료 코드 2)", async () => {
    const repo = await repoWith({});
    const report = join(repo, "checkup.md");
    await run([repo, "--report", report], await deps([]));
    await run([repo, `--report=${report}`], await deps([]));
    const readme = join(repo, "README.md");
    await writeFile(readme, "# 내 문서\n");
    const d = await deps([]);
    expect(await run([repo, "--report", readme], d)).toBe(2);
    expect(await readFile(readme, "utf8")).toBe("# 내 문서\n");
    expect(d.out.join("\n")).toContain("덮어쓰지 않습니다");
  });

  it("남는 위험에 셸 범위와 하위 폴더 설정을 적는다 (R13, R15)", async () => {
    const repo = await repoWith({ "apps/web/.claude/settings.json": "{}" });
    const report = join(repo, "r.md");
    await run([repo, "--report", report], await deps([]));
    const md = await readFile(report, "utf8");
    expect(md).toContain("grep -r");
    expect(md).toContain("이 폴더에서 Claude Code를 시작해야");
    expect(md).toContain("apps/web/.claude/settings.json");
  });
});
