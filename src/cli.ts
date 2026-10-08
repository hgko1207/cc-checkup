#!/usr/bin/env node
import { resolve } from "node:path";
import { checkClaudeMd } from "./checks/claude-md.js";
import { checkSettings } from "./checks/settings.js";
import { formatReport } from "./report.js";
import type { Check } from "./types.js";

const CHECKS: Check[] = [checkClaudeMd, checkSettings];

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "사용법: cc-checkup [저장소 경로]\n저장소의 Claude Code 팀 세팅 상태를 진단합니다.",
    );
    return 0;
  }
  const repoDir = resolve(argv.find((a) => !a.startsWith("-")) ?? ".");
  const findings = (await Promise.all(CHECKS.map((c) => c(repoDir)))).flat();
  console.log(formatReport(findings));
  return findings.some((f) => f.severity === "fail") ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
