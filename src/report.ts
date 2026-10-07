import type { Finding } from "./types.js";

const MARK = { ok: "✓", warn: "!", fail: "✗" } as const;

// 결과를 사람이 읽는 텍스트로 만든다
export function formatReport(findings: Finding[]): string {
  return findings
    .map((f) => {
      const line = `${MARK[f.severity]} ${f.message}`;
      return f.fix ? `${line}\n    → ${f.fix}` : line;
    })
    .join("\n");
}
