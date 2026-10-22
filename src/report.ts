import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Diagnosis } from "./diagnose.js";
import { SETTINGS_PATH, type FileChange, type FixPlan } from "./fix.js";
import { describeStandard } from "./standard.js";
import type { Finding, Severity } from "./types.js";

// 안내 링크는 표준 파일의 guideUrl이 있을 때만 붙인다 (예전 착지 주소는 페이지가 없어 뺐다)
export const KIND_LABEL = { dev: "개발 저장소", docs: "문서·기획 폴더" } as const;
// 직접 고른 종류가 자동 판별과 다르면 리포트에 남긴다 (점수 기준이 달라지므로)
function kindLine(diag: Diagnosis): string {
  const label = KIND_LABEL[diag.kind];
  return diag.kind === diag.kindGuess.kind
    ? label
    : `${label} (직접 지정, 자동 판별: ${KIND_LABEL[diag.kindGuess.kind]})`;
}

export const REPORT_MARKER = "<!-- cc-checkup report -->";

const MARK = { ok: "✓", warn: "!", fail: "✗" } as const;
const GROUPS: { severity: Severity; title: string }[] = [
  { severity: "fail", title: "위험" },
  { severity: "warn", title: "주의" },
  { severity: "ok", title: "괜찮음" },
];

// 차단 규칙이 실제로 막는 범위 (공식 문서 2026-10-12 기준, eng review R13)
const SHELL_SCOPE =
  "차단 규칙은 Claude의 파일 도구와 cat·head·tail·sed·tee, >·< 리다이렉트에 적용되지만 grep -r처럼 파일 이름 없이 읽는 명령과 Python·Node 스크립트는 막지 못합니다(Claude Code 최신 버전 기준). 훅(team-ai-kit)이나 샌드박스가 필요합니다";

export function remainingRisks({ ctx }: Diagnosis): string[] {
  const notes = [SHELL_SCOPE];
  let start =
    "이 폴더에서 Claude Code를 시작해야 이 설정이 적용됩니다 (하위 폴더에서 시작하면 그 폴더의 .claude/settings.json만 읽습니다)";
  if (ctx.scan.nestedSettings.length > 0) {
    start += `. 하위 폴더 설정(내용은 진단하지 않음): ${ctx.scan.nestedSettings.join(", ")}`;
  }
  notes.push(start);
  if (ctx.scan.unreadableDirs > 0) {
    notes.push(`읽지 못한 폴더 ${ctx.scan.unreadableDirs}개는 .env 확인에서 빠졌습니다`);
  }
  return notes;
}

function judgments(findings: Finding[]): string[] {
  return [
    ...new Set(
      findings.filter((f) => f.severity !== "ok" && f.judgment).map((f) => f.judgment as string),
    ),
  ];
}

// 터미널 출력 (고치기 질문 전까지)
export function formatText(diag: Diagnosis): string {
  const out = [
    "이 저장소의 Claude Code 팀 세팅 진단",
    `사내 표준: ${describeStandard(diag.standard)}`,
    `폴더 종류: ${kindLine(diag)}`,
    `사내 표준 대비 점수: ${diag.score} / 100`,
    "",
  ];
  for (const g of GROUPS) {
    const items = diag.findings.filter((f) => f.severity === g.severity);
    if (items.length === 0) continue;
    out.push(g.title, ...items.map((f) => `  ${MARK[f.severity]} ${f.message}`));
  }
  const todo = judgments(diag.findings);
  if (todo.length > 0) {
    out.push("", "직접 판단이 필요한 것 (자동으로 고치지 않음)", ...todo.map((j) => `  - ${j}`));
  }
  out.push("", "남는 위험", ...remainingRisks(diag).map((r) => `  - ${r}`));
  return out.join("\n");
}

export function formatCandidates(plan: FixPlan): string {
  if (plan.candidates.length === 0) return "";
  return ["", "바로 고칠 수 있는 것", ...plan.candidates.map((c) => `  ${c.no}. ${c.title}`)].join(
    "\n",
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// --report 파일 내용. 첫 줄 표식, 표준에 guideUrl이 있으면 마지막 줄에 사내 가이드
export function formatMarkdown(diag: Diagnosis, plan: FixPlan, now = new Date()): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const out = [
    REPORT_MARKER,
    "# Claude Code 팀 세팅 진단 리포트",
    "",
    `- 대상 폴더: \`${basename(diag.ctx.repoDir)}\``,
    `- 진단 일시: ${date}`,
    `- 사내 표준: ${describeStandard(diag.standard)}`,
    `- 폴더 종류: ${kindLine(diag)}`,
    `- 표준 충족도: **${diag.score} / 100**`,
  ];
  for (const g of GROUPS) {
    const items = diag.findings.filter((f) => f.severity === g.severity);
    if (items.length === 0) continue;
    out.push("", `## ${g.title}`, "", ...items.map((f) => `- ${MARK[f.severity]} ${f.message}`));
  }
  if (plan.candidates.length > 0) {
    out.push(
      "",
      "## 바로 고칠 수 있는 것",
      "",
      "터미널에서 `npx cc-checkup`을 실행하면 변경 내용을 확인한 뒤 적용할 수 있습니다.",
      "",
      ...plan.candidates.map((c) => `${c.no}. ${c.title}`),
    );
  }
  const todo = judgments(diag.findings);
  if (todo.length > 0) {
    out.push("", "## 직접 판단이 필요한 것", "", ...todo.map((j) => `- ${j}`));
  }
  out.push("", "## 남는 위험", "", ...remainingRisks(diag).map((r) => `- ${r}`));
  if (diag.ctx.standard.guideUrl)
    out.push("", "---", "", `사내 가이드: ${diag.ctx.standard.guideUrl}`);
  return out.join("\n") + "\n";
}

export class ReportExistsError extends Error {}

// cc-checkup이 만든 리포트(첫 줄 표식)만 덮어쓴다 (eng review R6)
export async function writeReport(path: string, content: string): Promise<void> {
  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    // 없으면 새로 만든다
  }
  if (
    existing !== null &&
    (existing.charCodeAt(0) === 0xfeff ? existing.slice(1) : existing).split(/\r?\n/)[0] !==
      REPORT_MARKER
  ) {
    throw new ReportExistsError(`이미 있는 파일이라 덮어쓰지 않습니다: ${path}`);
  }
  await writeFile(path, content, "utf8");
}

// 고친 뒤 안내: 새 파일과 git이 모르는 settings.json은 git add가 먼저 필요하다 (CLI·앱 공용)
export function commitGuide(diag: Diagnosis, changes: FileChange[]): string {
  const { tracked } = diag.ctx.git;
  if (tracked === null) return "커밋해야 팀원 전원에게 적용됩니다";
  // 새로 만든 파일과 git이 모르는 settings.json은 git add가 먼저 필요하다
  const toAdd = changes
    .filter((c) => c.before === null || (c.path === SETTINGS_PATH && tracked === false))
    .map((c) => c.path);
  if (toAdd.length > 0) return `git add ${toAdd.join(" ")} 후 커밋해야 팀원 전원에게 적용됩니다`;
  return "변경을 커밋해야 팀원 전원에게 적용됩니다";
}
