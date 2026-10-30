import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GitResult, GitRunner } from "../src/checks/git.js";
import { readSettings } from "../src/checks/settings.js";
import { scanRepo } from "../src/env-rules.js";
import { DEFAULT_STANDARD } from "../src/standard-default.js";
import type { Standard } from "../src/standard.js";
import type { CheckContext, GitTracking } from "../src/types.js";

export async function repoWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-checkup-"));
  for (const [name, body] of Object.entries(files)) {
    const filePath = join(dir, name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }
  return dir;
}

export function settingsJson(
  permissions: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({ permissions, ...extra }, null, 2) + "\n";
}

export function fakeGit(result: Partial<GitResult>): GitRunner {
  return async () => ({ code: 0, stderr: "", ...result });
}

export async function ctxFor(
  repoDir: string,
  git: GitTracking = { tracked: true },
  standard: Standard = DEFAULT_STANDARD,
): Promise<CheckContext> {
  return {
    repoDir,
    settings: await readSettings(repoDir),
    scan: await scanRepo(repoDir),
    git,
    standard,
    kind: "dev",
    usage: "team",
  };
}
