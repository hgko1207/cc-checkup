import { describe, expect, it } from "vitest";
import {
  checkSettings,
  detectFormat,
  matcherHitsBash,
  readSettings,
} from "../src/checks/settings.js";
import { DEFAULT_TARGETS } from "../src/env-rules.js";
import type { Finding } from "../src/types.js";
import { ctxFor, repoWith, settingsJson } from "./helpers.js";

const FULL_DENY = DEFAULT_TARGETS.flatMap((t) => [`Read(**/${t})`, `Edit(**/${t})`]);

async function run(files: Record<string, string>): Promise<Finding[]> {
  return checkSettings(await ctxFor(await repoWith(files)));
}

function byId(findings: Finding[], id: string): Finding | undefined {
  return findings.find((f) => f.id === id);
}

describe("settings.json 읽기", () => {
  it("없으면 settings/missing fail, 고치기 후보는 진단 4·5·7에 붙는다", async () => {
    const findings = await run({});
    expect(byId(findings, "settings/missing")?.severity).toBe("fail");
    expect(byId(findings, "settings/env-read-deny")?.denyRules).toHaveLength(6);
    expect(byId(findings, "settings/bypass")?.bypassFix).toBe(true);
  });

  it("JSON 파싱 실패면 fail + 판단 필요, 다른 진단은 하지 않는다", async () => {
    const findings = await run({ ".claude/settings.json": "not json" });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("fail");
    expect(findings[0]?.judgment).toBeDefined();
  });

  it("최상위가 객체가 아니면 읽을 수 없음", async () => {
    for (const body of ["[]", "null", '"x"']) {
      const s = await readSettings(await repoWith({ ".claude/settings.json": body }));
      expect(s.state).toBe("invalid");
    }
  });

  it("BOM이 있어도 정상으로 읽는다 (PowerShell 5.1)", async () => {
    const s = await readSettings(
      await repoWith({ ".claude/settings.json": "﻿" + settingsJson({ deny: [] }) }),
    );
    expect(s.state).toBe("ok");
    if (s.state === "ok") expect(s.format.bom).toBe(true);
  });

  it("permissions·deny 타입이 다르면 쓰지 않음으로 표시하고 진단은 계속한다", async () => {
    const s = await readSettings(
      await repoWith({ ".claude/settings.json": '{"permissions":{"deny":"Read(.env)"}}' }),
    );
    expect(s.state === "ok" && s.unwritable).toBe("permissions.deny가 배열이 아닙니다");
    const findings = await run({ ".claude/settings.json": '{"permissions":[]}', ".env": "X=1" });
    expect(byId(findings, "settings/missing")?.severity).toBe("fail");
    expect(byId(findings, "settings/env-read-deny")?.severity).toBe("fail");
  });

  it("서식 감지: 들여쓰기·줄바꿈·끝 줄바꿈", () => {
    expect(detectFormat('{\r\n\t"a": 1\r\n}', false)).toEqual({
      bom: false,
      eol: "\r\n",
      indent: "\t",
      finalNewline: false,
    });
    expect(detectFormat('{\n    "a": 1\n}\n', true)).toEqual({
      bom: true,
      eol: "\n",
      indent: "    ",
      finalNewline: true,
    });
  });
});

describe("진단 4·5 .env 차단", () => {
  it("기본 6개가 모두 있으면 ok", async () => {
    const findings = await run({ ".claude/settings.json": settingsJson({ deny: FULL_DENY }) });
    expect(byId(findings, "settings/env-read-deny")?.severity).toBe("ok");
    expect(byId(findings, "settings/env-edit-deny")?.severity).toBe("ok");
  });

  it("실제 .env가 있는데 Read 규칙이 하나도 없으면 fail, Edit는 warn", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({ deny: [] }),
      ".env": "X=1",
    });
    expect(byId(findings, "settings/env-read-deny")?.severity).toBe("fail");
    expect(byId(findings, "settings/env-edit-deny")?.severity).toBe("warn");
  });

  it(".env가 아직 없으면 읽기 차단 없음은 예방 차원의 warn (고치기 후보는 그대로)", async () => {
    const findings = await run({ ".claude/settings.json": settingsJson({ deny: [] }) });
    const read = byId(findings, "settings/env-read-deny");
    expect(read?.severity).toBe("warn");
    expect(read?.message).toContain("아직 .env 파일은 없지만");
    expect(read?.denyRules).toHaveLength(6);
  });

  it("Read(**/.env) 하나만 있으면 일부만 있음=warn, 빠진 5개만 후보", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({ deny: ["Read(**/.env)"] }),
    });
    const f = byId(findings, "settings/env-read-deny");
    expect(f?.severity).toBe("warn");
    expect(f?.denyRules).toHaveLength(5);
  });

  it("./.env만 있으면 하위 폴더 실제 .env가 위험이고 그 파일 규칙이 후보", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({
        deny: [
          ...FULL_DENY.filter((r) => !r.endsWith("(**/.env)")),
          "Read(./.env)",
          "Edit(./.env)",
        ],
      }),
      "apps/api/.env": "",
    });
    const read = byId(findings, "settings/env-read-deny");
    expect(read?.severity).toBe("fail");
    expect(read?.message).toContain("apps/api/.env");
    expect(read?.denyRules).toContain("Read(**/.env)");
  });

  it("Read는 덮였지만 Edit에서 빠진 실제 파일은 진단 5 warn + Edit 후보 (R4)", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({ deny: [...FULL_DENY, "Read(**/.env.prod)"] }),
      ".env.prod": "",
    });
    expect(byId(findings, "settings/env-read-deny")?.severity).toBe("ok");
    const edit = byId(findings, "settings/env-edit-deny");
    expect(edit?.severity).toBe("warn");
    expect(edit?.denyRules).toEqual(["Edit(**/.env.prod)"]);
  });

  it("예시 파일(.env.example)은 덮이지 않아도 문제 삼지 않는다", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({ deny: FULL_DENY }),
      ".env.example": "",
    });
    expect(byId(findings, "settings/env-read-deny")?.severity).toBe("ok");
  });
});

describe("진단 6 위험한 자동 허용", () => {
  it.each(["Bash", "Bash(*)", "Bash(git push *)", "Bash(rm -rf *)", "Bash(rm -fr *)"])(
    "%s 있으면 warn",
    async (rule) => {
      const findings = await run({ ".claude/settings.json": settingsJson({ allow: [rule] }) });
      const f = byId(findings, "settings/risky-allow");
      expect(f?.severity).toBe("warn");
      expect(f?.message).toContain(rule);
      expect(f?.judgment).toBeDefined();
    },
  );

  it("안전하면 ok, 배열이 아닌 allow도 오류 없이 ok", async () => {
    expect(
      byId(
        await run({ ".claude/settings.json": settingsJson({ allow: ["Bash(npm run test *)"] }) }),
        "settings/risky-allow",
      )?.severity,
    ).toBe("ok");
    expect(
      byId(
        await run({ ".claude/settings.json": settingsJson({ allow: "Bash" }) }),
        "settings/risky-allow",
      )?.severity,
    ).toBe("ok");
  });
});

describe("진단 7 권한 우회 모드", () => {
  it("disable이면 ok", async () => {
    const findings = await run({
      ".claude/settings.json": settingsJson({ disableBypassPermissionsMode: "disable" }),
    });
    expect(byId(findings, "settings/bypass")?.severity).toBe("ok");
  });

  it("키가 없으면 warn + 고치기 2 후보", async () => {
    const f = byId(await run({ ".claude/settings.json": settingsJson({}) }), "settings/bypass");
    expect(f?.severity).toBe("warn");
    expect(f?.bypassFix).toBe(true);
  });

  it("다른 값이면 판단 필요로 옮기고 덮어쓰지 않는다 (R11)", async () => {
    const f = byId(
      await run({ ".claude/settings.json": settingsJson({ disableBypassPermissionsMode: "off" }) }),
      "settings/bypass",
    );
    expect(f?.severity).toBe("warn");
    expect(f?.bypassFix).toBeUndefined();
    expect(f?.judgment).toContain('"off"');
  });
});

describe("진단 8 위험 명령 차단 훅 (R9)", () => {
  it.each([
    ["Bash", true],
    ["Bash|PowerShell", true],
    ["*", true],
    ["", true],
    [undefined, true],
    ["Edit|Write", false],
    ["(", false],
  ])("matcher %s → %s", (matcher, expected) => {
    expect(matcherHitsBash(matcher)).toBe(expected);
  });

  it("포맷용 Edit 훅만 있으면 warn", async () => {
    const hooks = { PreToolUse: [{ matcher: "Edit|Write", hooks: [] }] };
    const f = byId(
      await run({ ".claude/settings.json": settingsJson({}, { hooks }) }),
      "hooks/present",
    );
    expect(f?.severity).toBe("warn");
  });

  it("Bash 훅이 있으면 ok (내용은 확인하지 않음)", async () => {
    const hooks = { PreToolUse: [{ matcher: "Bash", hooks: [] }] };
    const f = byId(
      await run({ ".claude/settings.json": settingsJson({}, { hooks }) }),
      "hooks/present",
    );
    expect(f?.severity).toBe("ok");
    expect(f?.message).toContain("확인하지 않음");
  });

  it("team-ai 플러그인이 켜져 있으면 ok, 꺼져 있으면 warn", async () => {
    const on = await run({
      ".claude/settings.json": settingsJson(
        {},
        { enabledPlugins: { "team-ai@team-ai-kit": true } },
      ),
    });
    const off = await run({
      ".claude/settings.json": settingsJson(
        {},
        { enabledPlugins: { "team-ai@team-ai-kit": false } },
      ),
    });
    expect(byId(on, "hooks/present")?.severity).toBe("ok");
    expect(byId(off, "hooks/present")?.severity).toBe("warn");
  });
});

describe("저장소 밖 설정 (개인 설정·내 PC 전체 설정)", () => {
  const userSettings = settingsJson(
    { deny: FULL_DENY, allow: ["Bash(git push:*)"], disableBypassPermissionsMode: "disable" },
    { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } },
  );

  async function ctxWithUser(usage: "solo" | "team") {
    const ctx = await ctxFor(await repoWith({ ".env": "KEY=1\n" }));
    return {
      ...ctx,
      usage,
      other: { local: { state: "missing" as const }, user: await readJson(userSettings) },
    };
  }

  async function readJson(body: string) {
    return readSettings(await repoWith({ ".claude/settings.json": body }));
  }

  it("혼자: 내 PC 전체 설정에서 막혀 있으면 통과로 보고 어디서 막혔는지 적는다", async () => {
    const findings = await checkSettings(await ctxWithUser("solo"));
    expect(byId(findings, "settings/missing")).toMatchObject({ severity: "ok" });
    for (const id of ["settings/env-read-deny", "settings/env-edit-deny"]) {
      expect(byId(findings, id)?.severity).toBe("ok");
      expect(byId(findings, id)?.message).toContain("내 PC 전체 설정");
    }
    expect(byId(findings, "settings/bypass")?.severity).toBe("ok");
    expect(byId(findings, "hooks/present")?.severity).toBe("ok");
    // 내 PC 전체 설정의 위험한 허용도 이 저장소에서 실행되므로 알린다
    expect(byId(findings, "settings/risky-allow")?.severity).toBe("warn");
  });

  it("팀: 감점은 그대로 두고 팀원에게는 적용되지 않는다고 알린다", async () => {
    const findings = await checkSettings(await ctxWithUser("team"));
    expect(byId(findings, "settings/missing")?.severity).toBe("fail");
    const read = byId(findings, "settings/env-read-deny");
    expect(read?.severity).toBe("fail");
    expect(read?.message).toContain("팀원에게는 적용되지 않습니다");
    expect(read?.denyRules?.length).toBeGreaterThan(0);
    expect(byId(findings, "settings/bypass")).toMatchObject({ severity: "warn", bypassFix: true });
    expect(byId(findings, "hooks/present")?.message).toContain("팀원에게는");
    expect(byId(findings, "settings/risky-allow")?.severity).toBe("ok");
  });

  it("혼자: 일부만 막혀 있으면 빠진 규칙만 고치기 후보로 낸다", async () => {
    const ctx = await ctxFor(await repoWith({}));
    const user = await readJson(settingsJson({ deny: ["Read(**/.env)"] }));
    const findings = await checkSettings({
      ...ctx,
      usage: "solo",
      other: { local: { state: "missing" }, user },
    });
    const rules = byId(findings, "settings/env-read-deny")?.denyRules ?? [];
    expect(rules).toHaveLength(5);
    expect(rules).not.toContain("Read(**/.env)");
  });
});
