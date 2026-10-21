// IPC 채널 이름. preload.cts는 sandbox라 이 파일을 불러올 수 없어 같은 문자열을 직접 적는다
// (test/app-core.test.ts가 두 목록이 같은지 확인한다).
export const CHANNELS = {
  getState: "cc:getState",
  pickFolder: "cc:pickFolder",
  pickStandard: "cc:pickStandard",
  diagnose: "cc:diagnose",
  fix: "cc:fix",
  claude: "cc:claude",
  undo: "cc:undo",
  saveReport: "cc:saveReport",
  openUpdate: "cc:openUpdate",
} as const;

export const EVENT_CHANNEL = "cc:event";
