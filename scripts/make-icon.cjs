// 앱 아이콘(build/icon.png, 512px)을 SVG에서 만든다. electron-builder가 이 파일로 Windows·macOS 아이콘을 만든다.
// 실행: node scripts/run-app.mjs 와 같은 이유로 ELECTRON_RUN_AS_NODE 없이 `npx electron scripts/make-icon.cjs`
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="24" y="24" width="464" height="464" rx="104" fill="#2f5bd3"/>
  <path d="M150 268 L224 342 L366 184" fill="none" stroke="#ffffff" stroke-width="56"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${SVG}</body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  writeFileSync(
    join(__dirname, "..", "build", "icon.png"),
    image.resize({ width: 512, height: 512 }).toPNG(),
  );
  app.quit();
});
