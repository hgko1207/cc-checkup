import { describe, expect, it } from "vitest";
import { checkGit, gitTracking } from "../src/checks/git.js";
import { ctxFor, fakeGit, repoWith, settingsJson } from "./helpers.js";

describe("gitTracking (R12)", () => {
  it("추적 중이면 true", async () => {
    expect(await gitTracking(".", fakeGit({ code: 0 }))).toEqual({ tracked: true });
  });

  it("추적 안 되면 false", async () => {
    const r = await gitTracking(
      ".",
      fakeGit({
        code: 1,
        stderr: "error: pathspec '.claude/settings.json' did not match any file(s) known to git",
      }),
    );
    expect(r.tracked).toBe(false);
  });

  it("git이 없으면 확인 불가 + 원인", async () => {
    const r = await gitTracking(".", fakeGit({ code: null, error: { code: "ENOENT" } }));
    expect(r.tracked).toBeNull();
    expect(r.reason).toContain("설치");
  });

  it("소유권 거부(dubious ownership)면 확인 불가", async () => {
    const r = await gitTracking(
      ".",
      fakeGit({ code: 128, stderr: "fatal: detected dubious ownership in repository at 'D:/x'" }),
    );
    expect(r.tracked).toBeNull();
    expect(r.reason).toContain("safe.directory");
  });

  it("git 저장소가 아니면 확인 불가", async () => {
    const r = await gitTracking(
      ".",
      fakeGit({
        code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git",
      }),
    );
    expect(r).toEqual({ tracked: null, reason: "git 저장소가 아닙니다" });
  });

  it("시간 초과·기타 오류도 확인 불가", async () => {
    expect(
      (await gitTracking(".", fakeGit({ code: null, error: { killed: true } }))).tracked,
    ).toBeNull();
    expect((await gitTracking(".", fakeGit({ code: 2, stderr: "boom" }))).reason).toBe(
      "git 실행 실패: boom",
    );
  });
});

describe("진단 3 settings/committed", () => {
  const settings = settingsJson({ deny: ["Read(**/.env)"] });

  it("추적 중이면 ok, 안 되면 fail, 확인 불가면 warn", async () => {
    const dir = await repoWith({ ".claude/settings.json": settings });
    expect((await checkGit(await ctxFor(dir, { tracked: true })))[0]?.severity).toBe("ok");
    expect((await checkGit(await ctxFor(dir, { tracked: false })))[0]?.severity).toBe("fail");
    const unknown = (
      await checkGit(await ctxFor(dir, { tracked: null, reason: "git 저장소가 아닙니다" }))
    )[0];
    expect(unknown?.severity).toBe("warn");
    expect(unknown?.message).toContain("git 저장소가 아닙니다");
  });

  it("혼자 쓰는 저장소는 커밋 여부·개인 설정을 보지 않는다", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settings,
      ".claude/settings.local.json": settingsJson({ deny: ["Read(**/secrets/**)"] }),
    });
    const ctx = { ...(await ctxFor(dir, { tracked: false })), usage: "solo" as const };
    expect(await checkGit(ctx)).toEqual([]);
  });

  it("보호 규칙이 settings.local.json에만 있으면 fail + 판단 필요", async () => {
    const dir = await repoWith({
      ".claude/settings.json": settings,
      ".claude/settings.local.json": settingsJson({
        deny: ["Read(**/.env)", "Read(**/secrets/**)"],
        disableBypassPermissionsMode: "disable",
      }),
    });
    const findings = await checkGit(await ctxFor(dir));
    const local = findings.find((f) => f.message.includes("settings.local.json"));
    expect(local?.severity).toBe("fail");
    expect(local?.message).toContain("Read(**/secrets/**)");
    expect(local?.message).toContain("disableBypassPermissionsMode");
    expect(local?.message).not.toContain("Read(**/.env),");
    expect(local?.judgment).toBeDefined();
  });

  it("settings.json이 없으면 커밋 여부는 보지 않는다", async () => {
    expect(await checkGit(await ctxFor(await repoWith({}), { tracked: false }))).toEqual([]);
  });
});
