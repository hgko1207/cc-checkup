import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileRule,
  isCovered,
  isEnvFile,
  missingTargets,
  scanRepo,
  toPosixAbs,
} from "../src/env-rules.js";
import { repoWith } from "./helpers.js";

const ctx = { baseDir: "D:\\work\\app", home: "C:\\Users\\me" };

describe("isCovered — 규칙 깊이 (공식 문서 기준, eng review R1)", () => {
  it("슬래시 없는 패턴은 어느 깊이든 덮는다", () => {
    expect(isCovered(["Read(.env)"], "Read", ".env", ctx)).toBe(true);
    expect(isCovered(["Read(.env)"], "Read", "apps/api/.env", ctx)).toBe(true);
    expect(isCovered(["Read(.env*)"], "Read", "packages/web/.env.prod", ctx)).toBe(true);
  });

  it("**/ 패턴은 어느 깊이든 덮는다", () => {
    expect(isCovered(["Read(**/.env)"], "Read", ".env", ctx)).toBe(true);
    expect(isCovered(["Read(**/.env)"], "Read", "a/b/c/.env", ctx)).toBe(true);
  });

  it("./ 와 / 로 시작하는 패턴은 기준 폴더 바로 아래만 덮는다", () => {
    for (const rule of ["Read(./.env)", "Read(/.env)"]) {
      expect(isCovered([rule], "Read", ".env", ctx)).toBe(true);
      expect(isCovered([rule], "Read", "apps/api/.env", ctx)).toBe(false);
    }
  });

  it("중간에 슬래시가 있는 패턴은 그 위치만 덮는다", () => {
    expect(isCovered(["Read(config/.env)"], "Read", "config/.env", ctx)).toBe(true);
    expect(isCovered(["Read(config/.env)"], "Read", "x/config/.env", ctx)).toBe(false);
  });

  it("deny의 폴더 한 단계 패턴(dir/**)은 어느 깊이든 덮는다", () => {
    expect(isCovered(["Read(secrets/**)"], "Read", "a/secrets/.env", ctx)).toBe(true);
  });

  it("폴더가 맞으면 그 안의 파일도 덮인다", () => {
    expect(isCovered(["Read(config)"], "Read", "x/config/.env", ctx)).toBe(true);
  });

  it("도구 이름만 있는 규칙은 전부 덮는다, 다른 도구 규칙은 무시한다", () => {
    expect(isCovered(["Read"], "Read", "a/.env", ctx)).toBe(true);
    expect(isCovered(["Edit(**/.env)"], "Read", ".env", ctx)).toBe(false);
  });

  it("! 규칙은 앞의 상대 경로 규칙에서 빼낸다", () => {
    expect(isCovered(["Read(.env*)", "Read(!.env.test)"], "Read", ".env.test", ctx)).toBe(false);
    expect(isCovered(["Read(!.env.test)", "Read(.env*)"], "Read", ".env.test", ctx)).toBe(true);
  });

  it("// 절대 경로와 ~/ 규칙", () => {
    expect(isCovered(["Read(//**/.env)"], "Read", "a/.env", ctx)).toBe(true);
    expect(isCovered(["Read(//d/work/**/.env)"], "Read", "a/.env", ctx)).toBe(true);
    expect(isCovered(["Read(//e/**/.env)"], "Read", "a/.env", ctx)).toBe(false);
    expect(
      isCovered(["Read(~/x/.env)"], "Read", ".env", {
        baseDir: "C:\\Users\\me\\x",
        home: "C:\\Users\\me",
      }),
    ).toBe(true);
  });

  it("Windows 경로를 POSIX로 바꾼다", () => {
    expect(toPosixAbs("C:\\Users\\alice")).toBe("/c/Users/alice");
    expect(toPosixAbs("D:\\")).toBe("/d");
  });
});

describe("missingTargets — 기본 대상 6개", () => {
  it("고치기 1 규칙 6개가 있으면 빠진 것이 없다", () => {
    const deny = [
      ".env",
      ".env.local",
      ".env.*.local",
      ".env.production*",
      ".env.development*",
      ".env.staging*",
    ].map((t) => `Read(**/${t})`);
    expect(missingTargets(deny, "Read", ctx)).toEqual([]);
  });

  it("Read(.env*) 하나로 6개가 모두 덮인다", () => {
    expect(missingTargets(["Read(.env*)"], "Read", ctx)).toEqual([]);
  });

  it("./.env* 는 하위 폴더를 덮지 못해 6개 모두 빠진 것으로 본다", () => {
    expect(missingTargets(["Read(./.env*)"], "Read", ctx)).toHaveLength(6);
  });

  it("일부만 있으면 빠진 것만 돌려준다", () => {
    expect(missingTargets(["Read(**/.env)", "Read(**/.env.local)"], "Read", ctx)).toEqual([
      ".env.*.local",
      ".env.production*",
      ".env.development*",
      ".env.staging*",
    ]);
  });
});

describe("파일 이름", () => {
  it(".env와 .env.*만 대상, 예시 파일은 뺀다", () => {
    expect(isEnvFile(".env")).toBe(true);
    expect(isEnvFile(".env.prod")).toBe(true);
    expect(isEnvFile(".env.example")).toBe(false);
    expect(isEnvFile(".env.local.sample")).toBe(false);
    expect(isEnvFile(".envrc")).toBe(false);
  });

  it("실제 파일 규칙은 파일 이름으로 만들고 glob 문자는 이스케이프한다", () => {
    expect(fileRule("Read", "apps/api/.env.prod")).toBe("Read(**/.env.prod)");
    expect(fileRule("Edit", ".env.[x]")).toBe("Edit(**/.env.\\[x\\])");
  });
});

describe("scanRepo", () => {
  it(".env 파일과 하위 settings.json을 찾고 node_modules·.git은 건너뛴다", async () => {
    const dir = await repoWith({
      ".env": "",
      ".env.example": "",
      "apps/api/.env.prod": "",
      "node_modules/x/.env": "",
      ".git/.env": "",
      ".claude/settings.json": "{}",
      "apps/web/.claude/settings.json": "{}",
    });
    const scan = await scanRepo(dir);
    expect(scan.envFiles).toEqual([".env", "apps/api/.env.prod"]);
    expect(scan.nestedSettings).toEqual(["apps/web/.claude/settings.json"]);
    expect(scan.truncated).toBe(false);
  });

  it("상한을 넘으면 멈추고 truncated", async () => {
    const dir = await repoWith({ "a/1": "", "a/2": "", "a/3": "", "b/.env": "" });
    const scan = await scanRepo(dir, 2);
    expect(scan.truncated).toBe(true);
  });

  it("링크·정션은 따라가지 않아 순환해도 끝난다", async () => {
    const dir = await repoWith({ "real/.env": "" });
    await mkdir(join(dir, "loop"), { recursive: true });
    await symlink(dir, join(dir, "loop", "back"), "junction");
    const scan = await scanRepo(dir);
    expect(scan.envFiles).toEqual(["real/.env"]);
  });

  it("없는 폴더는 읽지 못한 폴더로 센다", async () => {
    const scan = await scanRepo(join(await repoWith({}), "nope"));
    expect(scan.unreadableDirs).toBe(1);
  });
});
