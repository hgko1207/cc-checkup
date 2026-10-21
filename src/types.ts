import type { Standard } from "./standard.js";

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

export interface CheckContext {
  repoDir: string;
  settings: SettingsRead;
  scan: EnvScan;
  git: GitTracking;
  standard: Standard;
}

// 진단 하나: 공유 입력을 받아 결과 목록을 돌려준다
export type Check = (ctx: CheckContext) => Promise<Finding[]>;
