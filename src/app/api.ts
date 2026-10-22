// 화면(렌더러)과 main 프로세스 사이의 약속. 화면 빌드도 이 파일을 쓰므로 Node 타입을 가져오지 않는다.
// 채널 이름은 channels.ts, 실제 처리는 core.ts.

export type Severity = "ok" | "warn" | "fail";
export type Area = "security" | "team" | "docs" | "plugins";
export type Kind = "dev" | "docs"; // 개발 저장소 / 문서·기획 폴더

export interface ClaudeStatus {
  ok: boolean; // 설치돼 있고 실행됨
  version?: string;
  loggedIn?: boolean; // 모르면 undefined (오래된 버전)
  account?: string;
  plan?: string;
  error?: string;
}

export interface RecentFolder {
  path: string;
  score?: number;
  at: string;
  kind?: Kind; // 사용자가 고른 폴더 종류 (없으면 자동 판별)
}

export interface AppState {
  recent: RecentFolder[];
  standard: string; // "이름 버전 (기본 내장|공유 파일: 경로)"
  standardError?: string; // 공유 파일을 쓰지 못한 이유
  standardInfo: { name: string; version: string; file?: string; path?: string; guideUrl?: string };
  claude: ClaudeStatus;
  running: boolean; // Claude 작업 실행 중 또는 확인 대기 중
  update?: { current: string; latest: string; downloadUrl?: string; note?: string }; // 새 버전 알림
}

export interface FindingView {
  id: string;
  severity: Severity;
  message: string;
  judgment?: string;
  detail?: { why: string; fix?: string; limit?: string }; // [자세히]
  example?: string; // [예시 보기]
  fixNo?: number; // 바로 고치기 후보 번호
  fixLabel?: string; // 바로 고치기 | 바로 만들기 | 설치하기
  claudeTask?: string;
  claudeLabel?: string; // Claude로 반영 | Claude로 만들기
  claudeTargets?: string[]; // Claude가 고칠 수 있는 파일 (실행 전 확인에 보여 줌)
  notApplicable?: boolean; // 이 폴더 종류에는 해당 없음
}

export interface AreaView {
  area: Area;
  title: string;
  findings: FindingView[];
}

export interface DiagnosisView {
  path: string;
  score: number;
  standard: string;
  standardName: string; // "이름 버전"
  weights: { fail: number; warn: number }; // 위험·주의 한 건의 감점
  expectedScore?: number; // 바로 고칠 수 있는 것을 모두 고쳤을 때 예상 점수
  kind: Kind;
  kindAuto: boolean; // 자동 판별 결과를 쓰는 중
  kindReason: string; // 자동 판별 이유
  counts: Record<Severity, number>;
  areas: AreaView[];
  fixes: { no: number; title: string }[];
  blocked?: string; // settings.json을 쓸 수 없어 설정 고치기를 막은 이유
  canUndo: boolean;
}

export interface FilePreview {
  path: string;
  diff: string;
  isNew: boolean;
  added: number; // 더해지는 줄 수
  note?: string; // 출처 (예: team-ai-kit 차단 훅 원본 그대로)
}

export type FixView =
  | {
      kind: "preview";
      previews: FilePreview[];
      items: { no: number; title: string }[]; // 고르는 고치기 항목
      resolves: number; // 이 고치기로 통과로 바뀌는 진단 항목 수
      expectedScore: number; // 적용했을 때 예상 점수
    }
  | { kind: "applied"; files: string[]; backupDir: string; commitHint: string };

export type Progress =
  | { kind: "start"; model?: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; detail?: string }
  | { kind: "tool-error"; text: string }
  | { kind: "result"; ok: boolean; text?: string; costUsd?: number };

export type ClaudeAction =
  | { type: "start"; path: string; taskId: string }
  | { type: "stop" }
  | { type: "keep" }
  | { type: "discard" };

export interface ClaudeView {
  status:
    | "ready"
    | "unchanged"
    | "busy"
    | "too-large"
    | "error"
    | "cancelled"
    | "timeout"
    | "outside"
    | "kept"
    | "discarded"
    | "stopping";
  message: string;
  diffs: { path: string; diff: string }[];
  outside: { path: string; change: "added" | "modified" | "deleted" }[];
}

export interface UndoItemView {
  path: string;
  existedBefore: boolean;
  modifiedSince: boolean; // 반영 뒤 사람이 고쳤거나 지움
  alreadyOriginal: boolean;
}

export type UndoView =
  | { kind: "none" }
  | { kind: "preview"; createdAt: string; items: UndoItemView[] }
  | { kind: "done"; ok: boolean; statuses: { path: string; status: string; error?: string }[] };

export type AppEvent = { type: "progress"; progress: Progress };

// main은 결과를 이 모양으로 돌려주고, preload가 풀어서 실패면 Error로 던진다
export type Wrapped<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CcCheckupApi {
  getState(refresh?: boolean): Promise<AppState>; // refresh면 Claude 설치·로그인을 다시 확인
  pickFolder(recent?: string): Promise<string | null>;
  pickStandard(reset?: boolean): Promise<AppState>;
  diagnose(path: string, kind?: Kind | "auto"): Promise<DiagnosisView>; // kind를 주면 그 폴더에 기억
  fix(path: string, nos: number[], apply: boolean): Promise<FixView>;
  claude(action: ClaudeAction): Promise<ClaudeView>;
  undo(path: string, apply: boolean): Promise<UndoView>;
  saveReport(path: string): Promise<string | null>;
  openUpdate(): Promise<void>; // 사내 표준 파일이 알려 준 새 설치 파일 위치 열기
  openGuide(): Promise<void>; // 사내 표준 파일의 guideUrl 열기
  onEvent(cb: (e: AppEvent) => void): () => void;
}
