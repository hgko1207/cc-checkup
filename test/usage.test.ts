import { describe, expect, it } from "vitest";
import { detectUsage } from "../src/usage.js";
import { fakeGit } from "./helpers.js";

const log = (...emails: string[]) => fakeGit({ code: 0, stdout: emails.join("\n") + "\n" });

describe("사용 방식 자동 추천", () => {
  it("커밋한 사람이 1명이면 혼자", async () => {
    const g = await detectUsage(".", { tracked: false }, log("a@x.com", "A@x.com", "a@x.com"));
    expect(g).toEqual({ usage: "solo", reason: "커밋한 사람이 1명이라 혼자 쓰는 저장소로 봅니다" });
  });

  it("커밋한 사람이 2명 이상이면 팀", async () => {
    const g = await detectUsage(".", { tracked: false }, log("a@x.com", "b@x.com"));
    expect(g).toEqual({ usage: "team", reason: "커밋한 사람이 2명이라 팀 저장소로 봅니다" });
  });

  it("팀 설정이 이미 커밋돼 있으면 팀 (git log를 보지 않음)", async () => {
    const g = await detectUsage(".", { tracked: true }, log("a@x.com"));
    expect(g.usage).toBe("team");
    expect(g.reason).toContain("커밋돼 있어");
  });

  it("커밋이 없으면 혼자", async () => {
    const g = await detectUsage(".", { tracked: false }, fakeGit({ code: 128, stderr: "fatal" }));
    expect(g).toEqual({ usage: "solo", reason: "아직 커밋이 없어 혼자 쓰는 저장소로 봅니다" });
  });

  it("git 저장소가 아니면 혼자", async () => {
    const g = await detectUsage(".", { tracked: null, reason: "git 저장소가 아닙니다" }, log());
    expect(g).toEqual({ usage: "solo", reason: "git 저장소가 아니라 혼자 쓰는 폴더로 봅니다" });
  });

  it("git을 확인할 수 없으면 혼자 + 원인", async () => {
    const g = await detectUsage(
      ".",
      { tracked: null, reason: "git 실행 시간이 초과됐습니다" },
      log(),
    );
    expect(g.usage).toBe("solo");
    expect(g.reason).toContain("시간이 초과");
  });
});
