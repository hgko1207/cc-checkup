import { describe, expect, it } from "vitest";
import { readSettings } from "../src/checks/settings.js";
import { diagnose } from "../src/diagnose.js";
import { applyFixes, lineDiff, planFixes, type FixCandidate } from "../src/fix.js";
import { fakeGit, repoWith, settingsJson } from "./helpers.js";

const fix1 = (rules: string[]): FixCandidate => ({
  no: 1,
  title: "",
  denyRules: rules,
  bypass: false,
});
const fix2: FixCandidate = { no: 2, title: "", denyRules: [], bypass: true };

async function settingsFrom(body?: string) {
  return readSettings(await repoWith(body === undefined ? {} : { ".claude/settings.json": body }));
}

describe("planFixes", () => {
  it("settings.json이 없으면 고치기 1·2 후보 (새로 만든다)", async () => {
    const d = await diagnose(await repoWith({}), { runGit: fakeGit({ code: 1 }) });
    const plan = planFixes(d);
    expect(plan.candidates.map((c) => c.no)).toEqual([1, 2]);
    expect(plan.candidates[0]?.denyRules).toHaveLength(12);
  });

  it("다 갖춰졌으면 후보 없음", async () => {
    const d = await diagnose(
      await repoWith({
        "CLAUDE.md": "npm run test\n",
        ".claude/settings.json": settingsJson({
          deny: [".env*"].flatMap((t) => [`Read(${t})`, `Edit(${t})`]),
          disableBypassPermissionsMode: "disable",
        }),
      }),
      { runGit: fakeGit({ code: 0 }) },
    );
    expect(planFixes(d).candidates).toEqual([]);
  });

  it("deny 타입이 다르면 고치기를 막고 이유를 알린다", async () => {
    const d = await diagnose(
      await repoWith({ ".claude/settings.json": '{"permissions":{"deny":"x"}}' }),
      { runGit: fakeGit({ code: 0 }) },
    );
    const plan = planFixes(d);
    expect(plan.candidates).toEqual([]);
    expect(plan.blocked).toBe("permissions.deny가 배열이 아닙니다");
  });
});

describe("applyFixes — 서식 보존 (R7)", () => {
  it("없는 파일은 고른 항목만으로 새로 만든다", async () => {
    const change = applyFixes(await settingsFrom(), [fix2]);
    expect(change.before).toBeNull();
    expect(JSON.parse(change.after)).toEqual({
      permissions: { disableBypassPermissionsMode: "disable" },
    });
  });

  it("2칸 파일: deny 끝에 빠진 규칙만 추가, 다른 줄은 그대로", async () => {
    const before = '{\n  "permissions": {\n    "deny": [\n      "Read(**/.env)"\n    ]\n  }\n}\n';
    const change = applyFixes(await settingsFrom(before), [
      fix1(["Read(**/.env)", "Edit(**/.env)"]),
    ]);
    expect(change.after).toBe(
      '{\n  "permissions": {\n    "deny": [\n      "Read(**/.env)",\n      "Edit(**/.env)"\n    ]\n  }\n}\n',
    );
  });

  it("탭·CRLF·BOM·끝 줄바꿈 없음을 유지한다", async () => {
    const before = '{\r\n\t"hooks": {}\r\n}';
    const change = applyFixes(await settingsFrom("﻿" + before), [fix1(["Read(**/.env)"]), fix2]);
    expect(change.content.startsWith("﻿")).toBe(true);
    expect(change.after).toBe(
      '{\r\n\t"hooks": {},\r\n\t"permissions": {\r\n\t\t"deny": [\r\n\t\t\t"Read(**/.env)"\r\n\t\t],\r\n\t\t"disableBypassPermissionsMode": "disable"\r\n\t}\r\n}',
    );
  });

  it("한 줄에 여러 항목이 있는 4칸 배열도 기존 줄을 건드리지 않는다", async () => {
    const before =
      '{\n    "permissions": {\n        "deny": [\n            "Read(**/a)", "Edit(**/a)"\n        ],\n        "allow": []\n    }\n}\n';
    const change = applyFixes(await settingsFrom(before), [fix1(["Read(**/.env)"]), fix2]);
    expect(change.after).toBe(
      '{\n    "permissions": {\n        "deny": [\n            "Read(**/a)", "Edit(**/a)",\n            "Read(**/.env)"\n        ],\n        "allow": [],\n        "disableBypassPermissionsMode": "disable"\n    }\n}\n',
    );
  });

  it("빈 deny 배열과 빈 permissions 객체", async () => {
    const a = applyFixes(await settingsFrom('{\n  "permissions": {\n    "deny": []\n  }\n}\n'), [
      fix1(["Read(**/.env)"]),
    ]);
    expect(a.after).toBe(
      '{\n  "permissions": {\n    "deny": [\n      "Read(**/.env)"\n    ]\n  }\n}\n',
    );
    const b = applyFixes(await settingsFrom('{\n  "permissions": {}\n}\n'), [fix2]);
    expect(b.after).toBe(
      '{\n  "permissions": {\n    "disableBypassPermissionsMode": "disable"\n  }\n}\n',
    );
  });

  it("한 줄짜리 JSON도 올바른 JSON으로 고친다", async () => {
    const change = applyFixes(await settingsFrom('{"permissions":{"deny":["Read(x)"]}}'), [
      fix1(["Read(**/.env)"]),
      fix2,
    ]);
    expect(JSON.parse(change.after)).toEqual({
      permissions: { deny: ["Read(x)", "Read(**/.env)"], disableBypassPermissionsMode: "disable" },
    });
  });

  it("문자열 안의 괄호·이스케이프에 흔들리지 않는다", async () => {
    const before = '{\n  "x": "}]\\"{[",\n  "permissions": {\n    "deny": ["a\\\\b"]\n  }\n}\n';
    const change = applyFixes(await settingsFrom(before), [fix1(["Read(**/.env)"])]);
    expect(JSON.parse(change.after)).toEqual({
      x: '}]"{[',
      permissions: { deny: ["a\\b", "Read(**/.env)"] },
    });
  });

  it("쓸 수 없는 파일이면 던진다", async () => {
    await expect(async () =>
      applyFixes(await settingsFrom('{"permissions":[]}'), [fix2]),
    ).rejects.toThrow();
  });
});

describe("lineDiff", () => {
  it("추가된 줄만 +로, 나머지는 문맥으로", () => {
    const out = lineDiff("a\nb\nc\nd\ne\nf\n", "a\nb\nc\nX\nd\ne\nf\n", "f.json", 1);
    expect(out).toBe(["--- f.json", "+++ f.json", "  …", "  c", "+ X", "  d", "  …"].join("\n"));
  });

  it("새 파일은 전부 +", () => {
    expect(lineDiff(null, "{\n}\n", "f.json")).toBe(
      ["--- (없음)", "+++ f.json", "+ {", "+ }"].join("\n"),
    );
  });
});
