// 고치기 후보와 settings.json 고쳐 쓰기.
// 자동 고치기 기준 (eng review R11): 팀 설정(.claude/settings.json)에 차단을 더하기만 하고,
// 기존 값을 바꾸거나 지우거나 파일을 옮기지 않는 변경. 나머지는 판단 필요.
// 쓸 때는 JSON을 다시 직렬화하지 않고 필요한 자리에 텍스트를 끼워 넣어
// 원래 들여쓰기·줄바꿈·BOM·배치를 그대로 둔다 (R7).
import type { Diagnosis } from "./diagnose.js";
import type { JsonFormat, SettingsRead } from "./types.js";

export const SETTINGS_PATH = ".claude/settings.json";

export interface PluginFix {
  marketplaces: Record<string, unknown>;
  enable: string[];
}

export interface FixCandidate {
  no: number;
  title: string;
  denyRules: string[];
  bypass: boolean;
  plugins?: PluginFix; // "설치하기": 저장소 settings.json에 마켓플레이스·플러그인을 더하기만 (R4)
  createFile?: { path: string; content: string }; // "바로 만들기": 없는 파일을 템플릿으로
}

export interface FixPlan {
  candidates: FixCandidate[];
  // settings.json을 쓸 수 없어 설정 고치기를 판단 필요로 옮긴 이유
  blocked?: string;
}

function mergePlugins(fixes: PluginFix[]): PluginFix | undefined {
  if (fixes.length === 0) return undefined;
  return {
    marketplaces: Object.assign({}, ...fixes.map((f) => f.marketplaces)) as Record<string, unknown>,
    enable: [...new Set(fixes.flatMap((f) => f.enable))],
  };
}

export function planFixes({ ctx, findings }: Diagnosis): FixPlan {
  const open = findings.filter((f) => f.severity !== "ok");
  const denyRules = [...new Set(open.flatMap((f) => f.denyRules ?? []))];
  const bypass = open.some((f) => f.bypassFix === true);
  const plugins = mergePlugins(open.flatMap((f) => (f.pluginFix ? [f.pluginFix] : [])));
  const files = open.flatMap((f) => (f.createFile ? [f.createFile] : []));

  const candidates: FixCandidate[] = [];
  let blocked: string | undefined;
  if (denyRules.length > 0 || bypass || plugins) {
    const { settings } = ctx;
    if (settings.state === "invalid") blocked = settings.reason;
    else if (settings.state === "ok" && settings.unwritable) blocked = settings.unwritable;
    else {
      if (denyRules.length > 0) {
        candidates.push({
          no: candidates.length + 1,
          title: `${SETTINGS_PATH}에 .env 읽기·쓰기 차단 규칙 추가 (${denyRules.length}개)`,
          denyRules,
          bypass: false,
        });
      }
      if (bypass) {
        candidates.push({
          no: candidates.length + 1,
          title: "권한 우회 모드 막기",
          denyRules: [],
          bypass: true,
        });
      }
      if (plugins) {
        candidates.push({
          no: candidates.length + 1,
          title: `사내 표준 플러그인 설정 추가 (${plugins.enable.join(", ")})`,
          denyRules: [],
          bypass: false,
          plugins,
        });
      }
    }
  }
  for (const file of files) {
    candidates.push({
      no: candidates.length + 1,
      title: `${file.path} 만들기 (사내 표준 템플릿)`,
      denyRules: [],
      bypass: false,
      createFile: file,
    });
  }
  return blocked === undefined ? { candidates } : { candidates, blocked };
}

// ---- 위치를 기억하는 JSON 트리 (JSON.parse를 통과한 텍스트만 받는다) ----

type JNode =
  | {
      type: "object";
      start: number;
      end: number;
      members: { key: string; keyStart: number; value: JNode }[];
    }
  | { type: "array"; start: number; end: number; items: JNode[] }
  | { type: "value"; start: number; end: number };

function parseTree(text: string): JNode {
  let i = 0;
  const skipWs = () => {
    while (i < text.length && /\s/.test(text[i] as string)) i++;
  };
  const readString = (): string => {
    const s = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(s, i)) as string;
  };
  const readValue = (): JNode => {
    skipWs();
    const start = i;
    const c = text[i];
    if (c === "{") {
      i++;
      const members: { key: string; keyStart: number; value: JNode }[] = [];
      skipWs();
      if (text[i] === "}") return { type: "object", start, end: ++i, members };
      for (;;) {
        skipWs();
        const keyStart = i;
        const key = readString();
        skipWs();
        i++; // :
        members.push({ key, keyStart, value: readValue() });
        skipWs();
        if (text[i++] === "}") return { type: "object", start, end: i, members };
      }
    }
    if (c === "[") {
      i++;
      const items: JNode[] = [];
      skipWs();
      if (text[i] === "]") return { type: "array", start, end: ++i, items };
      for (;;) {
        items.push(readValue());
        skipWs();
        if (text[i++] === "]") return { type: "array", start, end: i, items };
      }
    }
    if (c === '"') {
      readString();
      return { type: "value", start, end: i };
    }
    while (i < text.length && /[^\s,\]}]/.test(text[i] as string)) i++;
    return { type: "value", start, end: i };
  };
  return readValue();
}

function lineIndent(text: string, pos: number): string {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

function isSingleLine(text: string, start: number, end: number): boolean {
  return !text.slice(start, end).includes("\n");
}

function member(node: JNode | undefined, key: string): JNode | undefined {
  return node?.type === "object" ? node.members.find((m) => m.key === key)?.value : undefined;
}

function splice(text: string, start: number, end: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(end);
}

function render(value: unknown, fmt: JsonFormat, baseIndent: string): string {
  return JSON.stringify(value, null, fmt.indent)
    .split("\n")
    .join(fmt.eol + baseIndent);
}

function addArrayItems(text: string, arr: JNode, values: string[], fmt: JsonFormat): string {
  if (arr.type !== "array") throw new Error("배열이 아닙니다");
  const last = arr.items[arr.items.length - 1];
  if (last === undefined) {
    const outer = lineIndent(text, arr.start);
    const body = values.map((v) => outer + fmt.indent + JSON.stringify(v)).join("," + fmt.eol);
    return splice(text, arr.start, arr.end, `[${fmt.eol}${body}${fmt.eol}${outer}]`);
  }
  if (isSingleLine(text, arr.start, arr.end)) {
    return splice(text, last.end, last.end, values.map((v) => ", " + JSON.stringify(v)).join(""));
  }
  const indent = lineIndent(text, last.start);
  return splice(
    text,
    last.end,
    last.end,
    values.map((v) => "," + fmt.eol + indent + JSON.stringify(v)).join(""),
  );
}

function addMember(text: string, obj: JNode, key: string, value: unknown, fmt: JsonFormat): string {
  if (obj.type !== "object") throw new Error("객체가 아닙니다");
  const last = obj.members[obj.members.length - 1];
  if (last === undefined) {
    const outer = lineIndent(text, obj.start);
    const inner = outer + fmt.indent;
    const entry = `${JSON.stringify(key)}: ${render(value, fmt, inner)}`;
    return splice(text, obj.start, obj.end, `{${fmt.eol}${inner}${entry}${fmt.eol}${outer}}`);
  }
  if (isSingleLine(text, obj.start, obj.end)) {
    return splice(
      text,
      last.value.end,
      last.value.end,
      `, ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
    );
  }
  const indent = lineIndent(text, last.keyStart);
  const entry = `${JSON.stringify(key)}: ${render(value, fmt, indent)}`;
  return splice(text, last.value.end, last.value.end, `,${fmt.eol}${indent}${entry}`);
}

export interface FileChange {
  path: string;
  before: string | null; // BOM 없는 원문 (없던 파일이면 null)
  after: string; // BOM 없는 새 내용 (diff용)
  content: string; // 실제로 쓸 내용 (원래 BOM 유지)
}

export function applyFixes(settings: SettingsRead, chosen: FixCandidate[]): FileChange {
  if (settings.state === "invalid")
    throw new Error(`settings.json을 쓸 수 없습니다: ${settings.reason}`);
  if (settings.state === "ok" && settings.unwritable) {
    throw new Error(`settings.json을 쓸 수 없습니다: ${settings.unwritable}`);
  }
  const rules = [...new Set(chosen.flatMap((c) => c.denyRules))];
  const bypass = chosen.some((c) => c.bypass);
  const plugins = mergePlugins(chosen.flatMap((c) => (c.plugins ? [c.plugins] : [])));

  if (settings.state === "missing") {
    const obj: Record<string, unknown> = {};
    if (rules.length > 0 || bypass) {
      const permissions: Record<string, unknown> = {};
      if (rules.length > 0) permissions.deny = rules;
      if (bypass) permissions.disableBypassPermissionsMode = "disable";
      obj.permissions = permissions;
    }
    if (plugins) {
      if (Object.keys(plugins.marketplaces).length > 0)
        obj.extraKnownMarketplaces = plugins.marketplaces;
      obj.enabledPlugins = Object.fromEntries(plugins.enable.map((p) => [p, true]));
    }
    const after = JSON.stringify(obj, null, 2) + "\n";
    return { path: SETTINGS_PATH, before: null, after, content: after };
  }

  const fmt = settings.format;
  let text = settings.raw;
  let bypassDone = !bypass;

  if (rules.length > 0) {
    const root = parseTree(text);
    const perm = member(root, "permissions");
    if (perm === undefined) {
      const value: Record<string, unknown> = { deny: rules };
      if (bypass) value.disableBypassPermissionsMode = "disable";
      text = addMember(text, root, "permissions", value, fmt);
      bypassDone = true;
    } else {
      const deny = member(perm, "deny");
      if (deny === undefined) {
        text = addMember(text, perm, "deny", rules, fmt);
      } else {
        const existing = (JSON.parse(text.slice(deny.start, deny.end)) as unknown[]).filter(
          (x): x is string => typeof x === "string",
        );
        const add = rules.filter((r) => !existing.includes(r));
        if (add.length > 0) text = addArrayItems(text, deny, add, fmt);
      }
    }
  }
  if (!bypassDone) {
    const root = parseTree(text);
    const perm = member(root, "permissions");
    text =
      perm === undefined
        ? addMember(text, root, "permissions", { disableBypassPermissionsMode: "disable" }, fmt)
        : addMember(text, perm, "disableBypassPermissionsMode", "disable", fmt);
  }

  if (plugins) {
    // 없는 키만 더한다. 이미 있는 마켓플레이스·플러그인 값은 건드리지 않는다
    for (const [key, value] of Object.entries(plugins.marketplaces)) {
      const root = parseTree(text);
      const markets = member(root, "extraKnownMarketplaces");
      if (markets === undefined) {
        text = addMember(text, root, "extraKnownMarketplaces", { [key]: value }, fmt);
      } else if (member(markets, key) === undefined) {
        text = addMember(text, markets, key, value, fmt);
      }
    }
    for (const plugin of plugins.enable) {
      const root = parseTree(text);
      const enabled = member(root, "enabledPlugins");
      if (enabled === undefined) {
        text = addMember(text, root, "enabledPlugins", { [plugin]: true }, fmt);
      } else if (member(enabled, plugin) === undefined) {
        text = addMember(text, enabled, plugin, true, fmt);
      }
    }
  }

  JSON.parse(text); // 끼워 넣은 결과가 올바른 JSON인지 확인
  return {
    path: SETTINGS_PATH,
    before: settings.raw,
    after: text,
    content: (fmt.bom ? "\uFEFF" : "") + text,
  };
}

// 고른 후보 전체의 파일 변경: 설정 파일 한 개(필요할 때) + 새로 만들 파일들
export function applyAll(settings: SettingsRead, chosen: FixCandidate[]): FileChange[] {
  const changes: FileChange[] = [];
  const settingsChosen = chosen.filter((c) => c.denyRules.length > 0 || c.bypass || c.plugins);
  if (settingsChosen.length > 0) changes.push(applyFixes(settings, settingsChosen));
  for (const c of chosen) {
    if (!c.createFile) continue;
    const content = c.createFile.content.endsWith("\n")
      ? c.createFile.content
      : c.createFile.content + "\n";
    changes.push({ path: c.createFile.path, before: null, after: content, content });
  }
  return changes;
}

// ---- 줄 단위 diff (작은 파일 전용) ----

export function lineDiff(
  before: string | null,
  after: string | null,
  path: string,
  context = 2,
): string {
  const a = before === null ? [] : before.replace(/\r?\n$/, "").split(/\r?\n/);
  const b = after === null ? [] : after.replace(/\r?\n$/, "").split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const ops: { t: " " | "-" | "+"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ t: " ", line: a[i++] as string });
      j++;
    } else if (
      i < n &&
      (j >= m || ((lcs[i + 1] as number[])[j] as number) >= ((lcs[i] as number[])[j + 1] as number))
    ) {
      // 같은 길이면 지우는 줄을 먼저 (- 다음 +, 일반 diff 순서)
      ops.push({ t: "-", line: a[i++] as string });
    } else {
      ops.push({ t: "+", line: b[j++] as string });
    }
  }
  const keep = ops.map((op, k) =>
    ops.slice(Math.max(0, k - context), k + context + 1).some((o) => o.t !== " "),
  );
  const out = [
    `--- ${before === null ? "(없음)" : path}`,
    `+++ ${after === null ? "(삭제)" : path}`,
  ];
  let skipped = false;
  ops.forEach((op, k) => {
    if (keep[k]) {
      out.push(`${op.t} ${op.line}`);
      skipped = false;
    } else if (!skipped) {
      out.push("  …");
      skipped = true;
    }
  });
  return out.join("\n");
}
