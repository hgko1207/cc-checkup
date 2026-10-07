import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LINES, checkClaudeMd } from "../src/checks/claude-md.js";

async function repoWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-checkup-"));
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body);
  return dir;
}

describe("checkClaudeMd", () => {
  it("CLAUDE.md가 없으면 fail", async () => {
    const [f] = await checkClaudeMd(await repoWith({}));
    expect(f?.id).toBe("claude-md/missing");
    expect(f?.severity).toBe("fail");
  });

  it("짧은 CLAUDE.md는 ok", async () => {
    const [f] = await checkClaudeMd(await repoWith({ "CLAUDE.md": "# 프로젝트\n" }));
    expect(f?.severity).toBe("ok");
  });

  it(`${MAX_LINES}줄을 넘으면 warn`, async () => {
    const body = "x\n".repeat(MAX_LINES + 1);
    const [f] = await checkClaudeMd(await repoWith({ "CLAUDE.md": body }));
    expect(f?.id).toBe("claude-md/too-long");
  });
});
