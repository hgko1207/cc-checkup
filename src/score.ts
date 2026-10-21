// 사내 표준 충족도 0~100. 위험·주의 한 건마다 표준의 가중치만큼 깎는다 (전부 통과면 100)
import type { Standard } from "./standard.js";
import type { Finding } from "./types.js";

export function score(findings: Finding[], standard: Standard): number {
  const penalty = findings.reduce((sum, f) => {
    if (f.severity === "fail") return sum + standard.score.fail;
    if (f.severity === "warn") return sum + standard.score.warn;
    return sum;
  }, 0);
  return Math.max(0, 100 - penalty);
}
