// 사용 방식 자동 추천: 혼자 쓰는 저장소인가, 팀이 함께 쓰는 저장소인가.
// 팀 설정(.claude/settings.json)이 이미 커밋돼 있거나 커밋한 사람이 2명 이상이면 팀, 아니면 혼자.
// 사용자가 화면에서 바꿀 수 있다.
import type { GitRunner } from "./checks/git.js";
import type { GitTracking } from "./types.js";

// 혼자 쓰는 저장소는 커밋·팀원에게 보내기를 보지 않는다
export type Usage = "solo" | "team";

export interface UsageGuess {
  usage: Usage;
  reason: string;
}

// 최근 커밋만 본다 (오래된 저장소에서 느려지지 않게)
const LOG_MAX = 500;

export async function detectUsage(
  repoDir: string,
  git: GitTracking,
  run: GitRunner,
): Promise<UsageGuess> {
  if (git.tracked === true)
    return {
      usage: "team",
      reason: "팀 설정(.claude/settings.json)이 커밋돼 있어 팀 저장소로 봅니다",
    };
  if (git.tracked === null)
    return {
      usage: "solo",
      reason:
        git.reason === "git 저장소가 아닙니다"
          ? "git 저장소가 아니라 혼자 쓰는 폴더로 봅니다"
          : `git을 확인할 수 없어 혼자 쓰는 폴더로 봅니다 (${git.reason ?? "원인 모름"})`,
    };
  const r = await run(["log", `-${LOG_MAX}`, "--format=%ae"], repoDir);
  const authors = new Set(
    (r.code === 0 ? (r.stdout ?? "") : "")
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  );
  if (authors.size >= 2)
    return { usage: "team", reason: `커밋한 사람이 ${authors.size}명이라 팀 저장소로 봅니다` };
  if (authors.size === 1)
    return { usage: "solo", reason: "커밋한 사람이 1명이라 혼자 쓰는 저장소로 봅니다" };
  return { usage: "solo", reason: "아직 커밋이 없어 혼자 쓰는 저장소로 봅니다" };
}
