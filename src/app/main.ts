// 설치형 앱의 main 프로세스: 창, 보안 설정, IPC 연결만 맡는다. 처리는 core.ts.
//
// 보안 (eng review R1): 렌더러는 contextIsolation·sandbox 켬, nodeIntegration 끔.
// 화면 파일은 app://ui/ 에서만 읽고 CSP는 'self'. 새 창·다른 주소 이동·권한 요청은 모두 막는다.
// IPC는 app://ui/ 에서 온 요청만 받고, 결과는 { ok, value | error }로 감싸 돌려준다.
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from "electron";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppEvent, Wrapped } from "./api.js";
import { CHANNELS, EVENT_CHANNEL } from "./channels.js";
import { AppCore, friendlyError } from "./core.js";

const here = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(here, "ui");
const ORIGIN = "app://ui";

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// 테스트(E2E)용: 저장 위치와 폴더 선택을 환경 변수로 바꾼다. 앱을 띄운 사람만 정할 수 있는 값이다
const E2E_PICK = process.env.CC_CHECKUP_E2E_PICK;
// 개발 실행과 설치본이 같은 곳(%APPDATA%cc-checkup)에 최근 폴더·설정·반영 기록을 둔다
app.setPath(
  "userData",
  process.env.CC_CHECKUP_USER_DATA ?? join(app.getPath("appData"), "cc-checkup"),
);

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;

// 설치본은 app.getVersion(), 개발 실행(electron dist/app/main.js)은 Electron 버전이 나와서 package.json을 읽는다
function appVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? app.getVersion();
  } catch {
    return app.getVersion();
  }
}

function serveUi(): void {
  protocol.handle("app", async (req) => {
    const url = new URL(req.url);
    if (url.host !== "ui") return new Response("not found", { status: 404 });
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = normalize(join(UI_DIR, rel));
    if (!file.startsWith(UI_DIR + sep) || !TYPES[extname(file)])
      return new Response("not found", { status: 404 });
    try {
      return new Response(await readFile(file), {
        headers: {
          "content-type": TYPES[extname(file)] as string,
          "content-security-policy": CSP,
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

function wrap<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: A): Promise<Wrapped<T>> => {
    const from = event.senderFrame?.url ?? "";
    if (!from.startsWith(`${ORIGIN}/`)) return { ok: false, error: "허용되지 않은 요청입니다" };
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  };
}

async function start(): Promise<void> {
  serveUi();
  // macOS는 메뉴가 없으면 복사·붙여넣기·종료 단축키가 동작하지 않아 최소 메뉴만 둔다
  Menu.setApplicationMenu(
    process.platform === "darwin"
      ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }])
      : null,
  );
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  const parent = () => win ?? undefined;
  const core = new AppCore({
    dataDir: app.getPath("userData"),
    backup: process.env.CC_CHECKUP_HOME ? { home: process.env.CC_CHECKUP_HOME } : undefined,
    pickDirectory: async () => {
      if (E2E_PICK) return E2E_PICK;
      const w = parent();
      const opts: Electron.OpenDialogOptions = {
        title: "점검할 폴더",
        properties: ["openDirectory"],
      };
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    pickStandardFile: async () => {
      const w = parent();
      const opts: Electron.OpenDialogOptions = {
        title: "사내 표준 파일 (standard.json)",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      };
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    pickSaveFile: async (defaultName) => {
      const w = parent();
      const opts: Electron.SaveDialogOptions = {
        title: "리포트 저장",
        defaultPath: join(app.getPath("documents") || homedir(), defaultName),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      };
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      return r.canceled ? null : (r.filePath ?? null);
    },
    emit: (e: AppEvent) => win?.webContents.send(EVENT_CHANNEL, e),
    appVersion: appVersion(),
    openExternal: (url) => shell.openExternal(url),
    showItem: (path) => shell.showItemInFolder(path),
    openPath: async (path) => {
      const err = await shell.openPath(path);
      if (err) throw new Error(err);
    },
  });
  await core.init();

  ipcMain.handle(
    CHANNELS.getState,
    wrap((refresh?: unknown) => core.getState(refresh)),
  );
  ipcMain.handle(
    CHANNELS.pickFolder,
    wrap((recent?: unknown) => core.pickFolder(recent)),
  );
  ipcMain.handle(
    CHANNELS.pickStandard,
    wrap((reset?: unknown) => core.pickStandard(reset)),
  );
  ipcMain.handle(
    CHANNELS.diagnose,
    wrap((p: unknown, kind?: unknown) => core.diagnose(p, kind)),
  );
  ipcMain.handle(
    CHANNELS.fix,
    wrap((p: unknown, nos: unknown, apply: unknown) => core.fix(p, nos, apply)),
  );
  ipcMain.handle(
    CHANNELS.claude,
    wrap((a: unknown) => core.claude(a)),
  );
  ipcMain.handle(
    CHANNELS.undo,
    wrap((p: unknown, apply: unknown) => core.undo(p, apply)),
  );
  ipcMain.handle(
    CHANNELS.saveReport,
    wrap((p: unknown) => core.saveReport(p)),
  );
  ipcMain.handle(
    CHANNELS.openUpdate,
    wrap(() => core.openUpdate()),
  );
  ipcMain.handle(
    CHANNELS.openGuide,
    wrap(() => core.openGuide()),
  );
  ipcMain.handle(
    CHANNELS.showFolder,
    wrap((p: unknown) => core.showFolder(p)),
  );

  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: "Claude 세팅 점검",
    backgroundColor: "#f6f5f2",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.on("closed", () => {
    win = null;
  });
  await win.loadURL(`${ORIGIN}/index.html`);
}

app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) e.preventDefault();
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(start, (e: unknown) => {
  dialog.showErrorBox("Claude 세팅 점검", `시작하지 못했습니다: ${(e as Error).message}`);
  app.quit();
});
