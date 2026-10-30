import type { FolderKind, Standard } from "./standard.js";
import type { Usage } from "./usage.js";

// 진단 결과 한 건
export type Severity = "ok" | "warn" | "fail";

export interface Finding {
  id: string;
  severity: Severity;
  message: string;
  // 자동으로 고치지 않고 사람이 결정할 일 (판단 필요)
  judgment?: string;
  // 고치기 1 후보: permissions.deny에 더할 규칙
  denyRules?: string[];
  // 고치기 2 후보: permissions.disableBypassPermissionsMode 추가
  bypassFix?: boolean;
  // "설치하기" 후보: 저장소 settings.json에 더할 마켓플레이스와 켤 플러그인
  pluginFix?: { marketplaces: Record<string, unknown>; enable: string[] };
  // "바로 만들기" 후보: 없는 파일을 템플릿으로 만든다
  createFile?: { path: string; content: string };
  // "Claude로 반영" 대상 작업 (표준의 claudeTasks 키)
  claudeTask?: string;
  // 작업 지시문의 {{이름}} 자리에 넣을 값 (예: missing = 빠진 섹션)
  claudeVars?: Record<string, string>;
  // [예시 보기]에 보여 줄 내용 (필수 섹션·필수 파일)
  example?: string;
  // "바로 고치기" 후보: 위험 명령 차단 훅을 저장소에 넣는다
  hookFix?: boolean;
  // 이 폴더 종류에는 해당하지 않아 점수에 넣지 않는 항목 (화면에 "해당 없음"으로)
  notApplicable?: boolean;
  // 커밋하면 풀리는 항목 (settings.json이 git에 커밋되지 않음)
  needsCommit?: boolean;
}

// settings.json의 줄바꿈·들여쓰기·BOM (고쳐 쓸 때 그대로 유지)
export interface JsonFormat {
  bom: boolean;
  eol: "\n" | "\r\n";
  indent: string;
  finalNewline: boolean;
}

export type SettingsRead =
  | { state: "missing" }
  | { state: "invalid"; reason: string }
  | {
      state: "ok";
      raw: string; // BOM을 뗀 원문
      format: JsonFormat;
      data: Record<string, unknown>;
      // permissions·deny 타입이 예상과 달라 쓰면 안 되는 이유
      unwritable?: string;
    };

export interface EnvScan {
  // 기준 폴더 기준 상대 경로, `/` 구분
  envFiles: string[];
  nestedSettings: string[];
  truncated: boolean;
  unreadableDirs: number;
}

// tracked가 null이면 확인 불가
export interface GitTracking {
  tracked: boolean | null;
  reason?: string;
}

// 저장소 밖에서 Claude에 적용되는 설정. 고치기는 쓰지 않고 판정에만 쓴다
export interface OtherSettings {
  local: SettingsRead; // 개인 설정 .claude/settings.local.json (git에 올리지 않음)
  user: SettingsRead; // 내 PC 전체 설정 ~/.claude/settings.json
}

export interface CheckContext {
  repoDir: string;
  settings: SettingsRead; // 저장소 설정 .claude/settings.json (고치기가 쓰는 파일)
  other: OtherSettings;
  scan: EnvScan;
  git: GitTracking;
  standard: Standard; // 폴더 종류에 맞춘 기준 (standardFor)
  kind: FolderKind;
  usage: Usage;
}

// 진단 하나: 공유 입력을 받아 결과 목록을 돌려준다
export type Check = (ctx: CheckContext) => Promise<Finding[]>;
