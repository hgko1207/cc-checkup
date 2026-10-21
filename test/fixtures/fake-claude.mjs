/* global process, setInterval */
// 테스트용 가짜 claude. FAKE_CLAUDE_MODE로 동작을 고른다.
// FAKE_CLAUDE_LOG가 있으면 받은 인자와 지시문을 JSON으로 남긴다.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const mode = process.env.FAKE_CLAUDE_MODE ?? "edit";
const target = process.env.FAKE_CLAUDE_TARGET ?? "CLAUDE.md";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", main);

function edit() {
  const dir = target.split("/").slice(0, -1).join("/");
  if (dir) mkdirSync(dir, { recursive: true });
  appendFileSync(target, "\n## 하지 말 것\n- 비밀 파일 커밋\n");
  emit({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: target } }] },
  });
}

function success() {
  emit({ type: "result", subtype: "success", is_error: false, result: "끝", total_cost_usd: 0.01 });
}

function main() {
  if (process.env.FAKE_CLAUDE_LOG)
    writeFileSync(
      process.env.FAKE_CLAUDE_LOG,
      JSON.stringify({ args: process.argv.slice(2), prompt }),
    );
  emit({ type: "system", subtype: "init", model: "fake" });
  emit({ type: "assistant", message: { content: [{ type: "text", text: "읽는 중" }] } });
  switch (mode) {
    case "edit":
      edit();
      success();
      break;
    case "noop":
      success();
      break;
    case "outside":
      edit();
      mkdirSync("src", { recursive: true });
      writeFileSync("src/other.ts", "export {};\n");
      appendFileSync("keep.txt", "바뀜\n");
      success();
      break;
    case "fail":
      edit();
      process.stderr.write("boom\n");
      process.exit(1);
      break;
    case "error-result":
      edit();
      emit({
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        result: "예산 초과",
      });
      break;
    case "hang": {
      edit();
      // 하위 프로세스까지 남지 않는지 보려고 자식 하나를 띄운다
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
      });
      writeFileSync(process.env.FAKE_CLAUDE_CHILD_PID, String(child.pid));
      emit({ type: "assistant", message: { content: [{ type: "text", text: "기다리는 중" }] } });
      setInterval(() => {}, 1000);
      break;
    }
    case "garbage":
      process.stdout.write('not json\n{"type":"unknown"}\n');
      edit();
      success();
      break;
    default:
      process.stderr.write(`unknown mode ${mode}\n`);
      process.exit(2);
  }
}
