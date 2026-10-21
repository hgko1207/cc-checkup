// 화면(렌더러)과 main 프로세스 사이의 약속. 화면 빌드도 이 파일을 쓰므로 Node 타입을 가져오지 않는다.
// 채널 이름은 channels.ts, 실제 처리는 core.ts.

export type Severity = "ok" | "warn" | "fail";
export type Area = "security" | "team" | "docs" | "plugins";

export interface ClaudeStatus {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface RecentFolder {
  path: string;
  score?: number;
  at: string;
}

export interface AppState {
  recent: RecentFolder[];
  standard: string; // "이름 버전 (기본 내장|공유 파일: 경로)"
  standardError?: string; // 공유 파일을 쓰지 못한 이유
  claude: ClaudeStatus;
  running: boolean; // Claude 작업 실행 중 또는 확인 대기 중
}

export interface FindingView {
  id: string;
  severity: Severity;
  message: string;
  judgment?: string;
  fixNo?: number; // 바로 고치기 후보 번호
  fixLabel?: string; // 바로 고치기 | 바로 만들기 | 설치하기
  claudeTask?: string;
  claudeLabel?: string; // Claude로 반영 | Claude로 만들기
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
}

export type FixView =
  | { kind: "preview"; previews: FilePreview[] }
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
  getState(): Promise<AppState>;
  pickFolder(recent?: string): Promise<string | null>;
  pickStandard(reset?: boolean): Promise<AppState>;
  diagnose(path: string): Promise<DiagnosisView>;
  fix(path: string, nos: number[], apply: boolean): Promise<FixView>;
  claude(action: ClaudeAction): Promise<ClaudeView>;
  undo(path: string, apply: boolean): Promise<UndoView>;
  saveReport(path: string): Promise<string | null>;
  onEvent(cb: (e: AppEvent) => void): () => void;
}
