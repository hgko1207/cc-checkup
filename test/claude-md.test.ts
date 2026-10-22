import { describe, expect, it } from "vitest";
import { MAX_LINES, checkClaudeMd, hasVerifyCommand } from "../src/checks/claude-md.js";
import type { Finding } from "../src/types.js";
import { ctxFor, repoWith } from "./helpers.js";

async function run(files: Record<string, string>): Promise<Finding[]> {
  return checkClaudeMd(await ctxFor(await repoWith(files)));
}

describe("진단 1 CLAUDE.md (R8)", () => {
  it("두 위치 모두 없으면 fail", async () => {
    const [f] = await run({});
    expect(f?.id).toBe("claude-md");
    expect(f?.severity).toBe("fail");
  });

  it("루트만 있어도 ok", async () => {
    const [f] = await run({ "CLAUDE.md": "# 프로젝트\n" });
    expect(f?.severity).toBe("ok");
    expect(f?.message).toBe("CLAUDE.md 1줄 (기준 200줄 이하)");
  });

  it(".claude/CLAUDE.md만 있어도 ok", async () => {
    const [f] = await run({ ".claude/CLAUDE.md": "# 프로젝트\n" });
    expect(f?.severity).toBe("ok");
    expect(f?.message).toContain(".claude/CLAUDE.md");
  });

  it("둘 다 있으면 각각 길이를 본다", async () => {
    const findings = await run({
      "CLAUDE.md": "a\n",
      ".claude/CLAUDE.md": "x\n".repeat(MAX_LINES + 1),
    });
    const md = findings.filter((f) => f.id === "claude-md");
    expect(md.map((f) => f.severity)).toEqual(["ok", "warn"]);
  });

  it(`${MAX_LINES}줄은 ok, 넘으면 warn`, async () => {
    expect((await run({ "CLAUDE.md": "x\n".repeat(MAX_LINES) }))[0]?.severity).toBe("ok");
    expect((await run({ "CLAUDE.md": "x\n".repeat(MAX_LINES + 1) }))[0]?.severity).toBe("warn");
  });
});

describe("진단 9 검증 명령", () => {
  it.each([
    "npm run test",
    "pnpm lint",
    "yarn typecheck",
    "./gradlew build",
    "mvn verify",
    "pytest -q",
    "go test ./...",
    "cargo test",
    "dotnet test",
    "## 검증 방법",
    "## Verify",
  ])("%s 있으면 인정", (text) => {
    expect(hasVerifyCommand(text)).toBe(true);
  });

  it("명령이 없으면 warn", async () => {
    const findings = await run({ "CLAUDE.md": "# 프로젝트\n설명만 있음\n" });
    expect(findings.find((f) => f.id === "claude-md/verify")?.severity).toBe("warn");
  });

  it("두 파일을 합쳐서 찾는다", async () => {
    const findings = await run({
      "CLAUDE.md": "# 프로젝트\n",
      ".claude/CLAUDE.md": "npm run test\n",
    });
    expect(findings.find((f) => f.id === "claude-md/verify")?.severity).toBe("ok");
  });
});
