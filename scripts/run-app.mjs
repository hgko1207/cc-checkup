/* global process */
// 개발용 앱 실행. VS Code 터미널 등에서 물려받은 ELECTRON_RUN_AS_NODE가 있으면
// Electron이 앱이 아니라 Node로 떠서, 그 값을 빼고 실행한다.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const electronPath = createRequire(import.meta.url)("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electronPath, ["dist/app/main.js"], { stdio: "inherit", env }).on("exit", (code) =>
  process.exit(code ?? 0),
);
