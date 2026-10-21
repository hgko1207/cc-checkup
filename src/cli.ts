#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyWithBackup,
  executeUndo,
  findUndoTarget,
  planUndo,
  type BackupOptions,
} from "./backup.js";
import type { GitRunner } from "./checks/git.js";
import { diagnose } from "./diagnose.js";
import { applyAll, lineDiff, planFixes } from "./fix.js";
import { askSelection, askTerminal, confirm, isInteractive, type Ask } from "./prompt.js";
import {
  commitGuide,
  formatCandidates,
  formatMarkdown,
  formatText,
  ReportExistsError,
  writeReport,
} from "./report.js";
import { loadStandard } from "./standard.js";

const HELP = `사용법: cc-checkup [저장소 경로] [--standard <표준 파일>] [--kind dev|docs|auto] [--report <파일>] [--undo]
저장소의 Claude Code 팀 세팅을 진단하고, 원하면 안전한 수정을 확인 후 적용합니다.

  --report <파일>  진단 결과를 UTF-8 마크다운으로 저장 (질문하지 않고 설정 파일도 쓰지 않음)
  --standard <파일> 사내 표준 정의 파일(standard.json)로 진단 (없거나 잘못되면 기본 표준)
  --kind <종류>     dev(개발 저장소, 기본) | docs(문서·기획 폴더) | auto(자동 판별)
  --undo           이 폴더에 마지막으로 적용한 고치기를 되돌림`;

export interface CliDeps {
  ask: Ask;
  interactive: boolean;
  log: (line: string) => void;
  backup?: BackupOptions;
  runGit?: GitRunner;
}

interface Args {
  help: boolean;
  undo: boolean;
  report?: string;
  standard?: string;
  kind?: "dev" | "docs" | "auto";
  dir: string;
}

function parseArgs(argv: string[]): Args | string {
  const args: Args = { help: false, undo: false, dir: "." };
  let dirSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--undo") args.undo = true;
    else if (a === "--report") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) return "--report 뒤에 파일 이름을 적으세요";
      args.report = v;
    } else if (a.startsWith("--report=")) args.report = a.slice("--report=".length);
    else if (a === "--standard") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) return "--standard 뒤에 표준 파일 경로를 적으세요";
      args.standard = v;
    } else if (a.startsWith("--standard=")) args.standard = a.slice("--standard=".length);
    else if (a === "--kind" || a.startsWith("--kind=")) {
      const v = a === "--kind" ? argv[++i] : a.slice("--kind=".length);
      if (v !== "dev" && v !== "docs" && v !== "auto")
        return "--kind 뒤에는 dev, docs, auto 중 하나를 적으세요";
      args.kind = v;
    }
    else if (a.startsWith("-")) return `알 수 없는 옵션: ${a}`;
    else if (dirSet) return `경로는 하나만 적으세요: ${a}`;
    else {
      args.dir = a;
      dirSet = true;
    }
  }
  return args;
}

async function runUndo(repoDir: string, deps: CliDeps): Promise<number> {
  const target = await findUndoTarget(repoDir, deps.backup);
  if (target === null) {
    deps.log("이 폴더에서 되돌릴 기록이 없습니다");
    return 0;
  }
  const items = await planUndo(repoDir, target);
  deps.log(`되돌릴 고치기: ${target.manifest.createdAt} (백업: ${target.backupDir})`);
  for (const item of items) {
    if (item.alreadyOriginal) deps.log(`  ${item.path}: 이미 원래 내용과 같습니다`);
    else
      deps.log(
        lineDiff(
          item.current?.toString("utf8") ?? null,
          item.original?.toString("utf8") ?? null,
          item.path,
        ),
      );
  }
  const changed = items.filter((i) => i.modifiedSince && !i.alreadyOriginal).map((i) => i.path);
  if (changed.length > 0) {
    deps.log(
      `! 적용한 뒤 바뀐 파일이 있습니다: ${changed.join(", ")}. 되돌리면 그 변경도 사라집니다`,
    );
  }
  if (!deps.interactive) {
    deps.log("터미널에서 직접 실행해야 되돌릴 수 있습니다 (아무 파일도 쓰지 않았습니다)");
    return 1;
  }
  if (!(await confirm(deps.ask, "되돌릴까요?"))) {
    deps.log("아무것도 바꾸지 않았습니다");
    return 0;
  }
  const result = await executeUndo(repoDir, target, items, deps.backup);
  const label = {
    restored: "복원됨",
    deleted: "삭제됨",
    skipped: "이미 원본",
    failed: "실패",
    untouched: "안 건드림",
  };
  for (const s of result.statuses)
    deps.log(`  ${s.path}: ${label[s.status]}${s.error ? ` (${s.error})` : ""}`);
  deps.log(result.ok ? "되돌렸습니다" : "되돌리기를 멈췄습니다. 원인을 해결한 뒤 다시 실행하세요");
  return result.ok ? 0 : 1;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    deps.log(`${args}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    deps.log(HELP);
    return 0;
  }
  const repoDir = resolve(args.dir);
  if (args.undo) return runUndo(repoDir, deps);

  const standard = await loadStandard(args.standard);
  if (standard.error) {
    deps.log(`! 표준 파일을 쓰지 못해 기본 표준으로 진단합니다: ${standard.error}`);
  }
  const diag = await diagnose(repoDir, { runGit: deps.runGit, standard, kind: args.kind });
  const plan = planFixes(diag);
  const code = diag.findings.some((f) => f.severity === "fail") ? 1 : 0;

  if (args.report !== undefined) {
    try {
      await writeReport(args.report, formatMarkdown(diag, plan));
    } catch (e) {
      if (e instanceof ReportExistsError) {
        deps.log(e.message);
        return 2;
      }
      throw e;
    }
    deps.log(formatText(diag));
    deps.log(`\n리포트를 저장했습니다: ${args.report}`);
    return code;
  }

  deps.log(formatText(diag));
  if (plan.candidates.length === 0) return code;
  deps.log(formatCandidates(plan));
  if (!deps.interactive) {
    deps.log("  터미널에서 직접 실행하면 변경 내용을 확인한 뒤 고칠 수 있습니다");
    return code;
  }

  const picked = await askSelection(deps.ask, plan.candidates.length);
  if (picked.length === 0) {
    deps.log("아무것도 바꾸지 않았습니다");
    return code;
  }
  const changes = applyAll(
    diag.ctx.settings,
    plan.candidates.filter((c) => picked.includes(c.no)),
  );
  for (const change of changes) deps.log(lineDiff(change.before, change.after, change.path));
  if (!(await confirm(deps.ask, "적용할까요?"))) {
    deps.log("아무것도 바꾸지 않았습니다");
    return code;
  }
  try {
    const { backupDir } = await applyWithBackup(
      repoDir,
      changes.map((c) => ({ path: c.path, content: c.content })),
      deps.backup,
    );
    deps.log(`적용했습니다. 원본 백업: ${backupDir}`);
  } catch (e) {
    deps.log((e as Error).message);
    return 1;
  }
  deps.log("되돌리려면: npx cc-checkup --undo");
  deps.log(commitGuide(diag, changes));
  return 0;
}

function isMain(): boolean {
  try {
    return realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2), {
    ask: askTerminal,
    interactive: isInteractive(),
    log: (l) => console.log(l),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e: unknown) => {
      console.error(`오류: ${(e as Error).message}`);
      process.exitCode = 1;
    });
}
