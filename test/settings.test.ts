import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSettings } from "../src/checks/settings.js";

async function repoWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-checkup-"));
  for (const [name, body] of Object.entries(files)) {
    const filePath = join(dir, name);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, body);
  }
  return dir;
}

function settingsJson(permissions: Record<string, unknown>): string {
  return JSON.stringify({ permissions });
}

describe("checkSettings", () => {
  it(".claude/settings.json이 없으면 fail", async () => {
    const findings = await checkSettings(await repoWith({}));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("settings/missing");
    expect(findings[0]?.severity).toBe("fail");
  });

  it("JSON 파싱 실패하면 fail", async () => {
    const findings = await checkSettings(await repoWith({ ".claude/settings.json": "not json" }));
    expect(findings[0]?.id).toBe("settings/missing");
    expect(findings[0]?.severity).toBe("fail");
  });

  it("deny에 .env Read 규칙이 있으면 ok", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        deny: ["Read(**/.env)"],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/env-read-deny");
    expect(f?.severity).toBe("ok");
  });

  it("deny에 .env Read 규칙이 없으면 fail", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({ deny: [] }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/env-read-deny");
    expect(f?.severity).toBe("fail");
  });

  it("deny에 .env Edit 규칙이 있으면 ok", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        deny: ["Edit(**/.env)"],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/env-edit-deny");
    expect(f?.severity).toBe("ok");
  });

  it("deny에 .env Edit 규칙이 없으면 warn", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({ deny: [] }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/env-edit-deny");
    expect(f?.severity).toBe("warn");
  });

  it("allow에 Bash(*)가 있으면 warn", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        allow: ["Bash(*)"],
        deny: [],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/risky-allow");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toContain("Bash(*)");
  });

  it("allow에 Bash(git push *)가 있으면 warn", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        allow: ["Bash(git push *)"],
        deny: [],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/risky-allow");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toContain("git push");
  });

  it("allow에 bare Bash가 있으면 warn", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        allow: ["Bash"],
        deny: [],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/risky-allow");
    expect(f?.severity).toBe("warn");
  });

  it("allow가 안전하면 ok", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        allow: ["Bash(npm run test *)"],
        deny: [],
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/risky-allow");
    expect(f?.severity).toBe("ok");
  });

  it("disableBypassPermissionsMode가 disable이면 ok", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({
        disableBypassPermissionsMode: "disable",
      }),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/bypass-disabled");
    expect(f?.severity).toBe("ok");
  });

  it("disableBypassPermissionsMode가 없으면 warn", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settingsJson({}),
    });
    const findings = await checkSettings(dir);
    const f = findings.find((r) => r.id === "settings/bypass-disabled");
    expect(f?.severity).toBe("warn");
  });
});
