import { describe, expect, it } from "vitest";
import {
  MAX_LINES,
  checkClaudeMd,
  hasVerifyCommand,
  importPaths,
} from "../src/checks/claude-md.js";
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

describe("@import (Claude Code가 CLAUDE.md에서 가져오는 파일, 예: @AGENTS.md)", () => {
  const verify = (fs: Finding[]) => fs.find((f) => f.id === "claude-md/verify")?.severity;

  it("가져온 AGENTS.md의 검증 명령을 인정하고, 길이는 CLAUDE.md 자체로 센다", async () => {
    const findings = await run({
      "CLAUDE.md": "@AGENTS.md\n",
      "AGENTS.md": "# 앱\n\n## 검증 명령\n\n1. npm run test\n",
    });
    expect(verify(findings)).toBe("ok");
    expect(findings[0]?.message).toBe("CLAUDE.md 1줄 (기준 200줄 이하)");
  });

  it("코드 펜스·인라인 코드·따옴표 안의 @경로는 가져오지 않는다", async () => {
    for (const claude of [
      "```\n@AGENTS.md\n```\n",
      "예: `@AGENTS.md`\n",
      'import "@AGENTS.md"\n',
    ]) {
      const findings = await run({ "CLAUDE.md": claude, "AGENTS.md": "npm run test\n" });
      expect(verify(findings), claude).toBe("warn");
    }
  });

  it("경로는 가져오는 파일 기준이다 (.claude/CLAUDE.md의 @../AGENTS.md)", async () => {
    const findings = await run({
      ".claude/CLAUDE.md": "@../AGENTS.md\n",
      "AGENTS.md": "npm run test\n",
    });
    expect(verify(findings)).toBe("ok");
  });

  it("서로 가져와도 멈춘다", async () => {
    const findings = await run({
      "CLAUDE.md": "@AGENTS.md\n",
      "AGENTS.md": "@CLAUDE.md\nnpm run lint\n",
    });
    expect(verify(findings)).toBe("ok");
  });

  it("4단계까지만 따라간다", async () => {
    const chain = (cmdAt: string) => ({
      "CLAUDE.md": "@1.md\n",
      "1.md": "@2.md\n",
      "2.md": "@3.md\n",
      "3.md": "@4.md\n",
      "4.md": "@5.md\n",
      [cmdAt]: (cmdAt === "5.md" ? "" : `@${Number(cmdAt[0]) + 1}.md\n`) + "npm run test\n",
    });
    expect(verify(await run(chain("4.md")))).toBe("ok");
    expect(verify(await run(chain("5.md")))).toBe("warn");
  });

  it("이메일·없는 파일은 무시한다", async () => {
    expect(importPaths("문의 a@b.com\n@team 리뷰\n")).toEqual(["team"]);
    expect(verify(await run({ "CLAUDE.md": "@team 리뷰\n@없는파일.md\n" }))).toBe("warn");
  });
});
