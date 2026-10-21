import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeStandard, loadStandard, mergeStandard } from "../src/standard.js";
import { DEFAULT_STANDARD } from "../src/standard-default.js";
import { repoWith } from "./helpers.js";

describe("loadStandard (R3)", () => {
  it("경로가 없으면 기본 표준", async () => {
    const l = await loadStandard();
    expect(l.source).toBe("default");
    expect(l.standard.env.targets).toHaveLength(6);
    expect(describeStandard(l)).toBe("기본 표준 1.0.0 (기본 내장)");
  });

  it("공유 파일이 있으면 그 값을 쓰고 빠진 항목은 기본값", async () => {
    const dir = await repoWith({
      "s.json": JSON.stringify({ name: "우리 표준", version: "2.0", claudeMd: { maxLines: 120 } }),
    });
    const l = await loadStandard(join(dir, "s.json"));
    expect(l.source).toBe("shared");
    expect(l.standard.claudeMd.maxLines).toBe(120);
    expect(l.standard.claudeMd.requiredSections).toEqual(
      DEFAULT_STANDARD.claudeMd.requiredSections,
    );
    expect(describeStandard(l)).toContain("공유 파일");
  });

  it("BOM이 있어도 읽는다", async () => {
    const dir = await repoWith({ "s.json": "﻿" + JSON.stringify({ name: "BOM 표준" }) });
    expect((await loadStandard(join(dir, "s.json"))).standard.name).toBe("BOM 표준");
  });

  it("파일이 없거나 형식이 틀리면 기본 표준 + 이유", async () => {
    const dir = await repoWith({
      "bad.json": "{oops",
      "type.json": JSON.stringify({ score: { fail: "x" } }),
    });
    for (const name of ["none.json", "bad.json", "type.json"]) {
      const l = await loadStandard(join(dir, name));
      expect(l.source).toBe("default");
      expect(l.error).toBeDefined();
    }
  });

  it("필수 파일 경로에 ..를 쓸 수 없다", () => {
    expect(() =>
      mergeStandard(DEFAULT_STANDARD, {
        requiredFiles: [{ id: "x", path: "../evil.md", title: "x", severity: "warn" }],
      }),
    ).toThrow();
  });

  it("기본 표준을 바꾸지 않는다 (복사본을 돌려준다)", () => {
    const merged = mergeStandard(DEFAULT_STANDARD, { name: "다른 표준" });
    expect(merged.name).toBe("다른 표준");
    expect(DEFAULT_STANDARD.name).toBe("기본 표준");
  });

  it("예시 사내 표준 파일은 형식이 맞다", async () => {
    const l = await loadStandard(join("standard", "example-company.json"));
    expect(l.error).toBeUndefined();
    expect(l.standard.requiredFiles.map((f) => f.id)).toEqual(["plan", "design"]);
    expect(l.standard.plugins.required).toEqual(["team-ai@team-ai-kit"]);
  });

  it("예시 파일을 덮어쓴 표준도 다시 읽힌다", async () => {
    const dir = await repoWith({});
    const text = await readFile(join("standard", "example-company.json"), "utf8");
    await writeFile(join(dir, "s.json"), text);
    expect((await loadStandard(join(dir, "s.json"))).source).toBe("shared");
  });
});
