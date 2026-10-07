// 진단 결과 한 건
export type Severity = "ok" | "warn" | "fail";

export interface Finding {
  id: string;
  severity: Severity;
  message: string;
  // 고치는 방법 한 줄
  fix?: string;
}

// 진단 하나: 저장소 경로를 받아 결과 목록을 돌려준다
export type Check = (repoDir: string) => Promise<Finding[]>;
