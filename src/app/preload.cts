// sandbox 렌더러에 고정된 함수만 내놓는다 (eng review R1). sandbox preload는 electron 외 모듈을
// 불러올 수 없어 채널 이름을 channels.ts와 같게 직접 적는다 (테스트가 확인).
import { contextBridge, ipcRenderer } from "electron";
import type { AppEvent, CcCheckupApi, Wrapped } from "./api.js";

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Wrapped<T>;
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const api: CcCheckupApi = {
  getState: (refresh) => call("cc:getState", refresh),
  pickFolder: (recent) => call("cc:pickFolder", recent),
  pickStandard: (reset) => call("cc:pickStandard", reset),
  diagnose: (path, kind) => call("cc:diagnose", path, kind),
  fix: (path, nos, apply) => call("cc:fix", path, nos, apply),
  claude: (action) => call("cc:claude", action),
  undo: (path, apply) => call("cc:undo", path, apply),
  saveReport: (path) => call("cc:saveReport", path),
  openUpdate: () => call("cc:openUpdate"),
  openGuide: () => call("cc:openGuide"),
  onEvent: (cb) => {
    const listener = (_e: unknown, ev: AppEvent) => cb(ev);
    ipcRenderer.on("cc:event", listener);
    return () => {
      ipcRenderer.removeListener("cc:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("ccCheckup", api);
