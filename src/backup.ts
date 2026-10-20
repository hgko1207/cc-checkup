// 고치기 전 백업, 실패 시 롤백, --undo.
//
//   적용: 기준 폴더 정규화 → ~/.cc-checkup/backups/<경로해시>-<시각>/ 에
//         원본(files/) + manifest.json 기록 → 쓰기 → 실패하면 manifest대로 롤백(rolledBackAt)
//   되돌리기: 같은 정규화 경로 + undoneAt·rolledBackAt 없음 중 최신 → 파일별 복원
//             → 전부 성공하면 undoneAt 기록 (다음 --undo는 그 이전 백업, 역순)
//
// 정규화 (eng review R3): realpath → 끝 구분자 제거(루트 제외) → Windows면 소문자.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

export interface BaseKey {
  original: string;
  normalized: string;
  hash: string;
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function normalizeBase(dir: string, platform: NodeJS.Platform = process.platform): BaseKey {
  const original = resolve(dir);
  let real = original;
  try {
    real = realpathSync.native(original);
  } catch {
    // 없는 경로는 resolve 결과를 그대로 쓴다
  }
  const root = parse(real).root;
  let normalized = real;
  while (normalized.length > root.length && /[\\/]$/.test(normalized))
    normalized = normalized.slice(0, -1);
  if (platform === "win32") normalized = normalized.toLowerCase();
  return { original, normalized, hash: sha256(normalized).slice(0, 12) };
}

interface ManifestFile {
  path: string; // 기준 폴더 기준, `/` 구분
  existedBefore: boolean;
  afterHash: string; // 적용 직후 내용의 SHA-256
}

export interface Manifest {
  version: 1;
  base: { original: string; normalized: string };
  createdAt: string;
  files: ManifestFile[];
  createdDirs: string[]; // 새로 만든 폴더, 깊은 것부터
  rolledBackAt?: string;
  undoneAt?: string;
}

export interface Io {
  writeFile: (path: string, data: string | Uint8Array) => Promise<void>;
  rm: (path: string) => Promise<void>;
}

const realIo: Io = {
  writeFile: (p, d) => writeFile(p, d),
  rm: (p) => rm(p, { force: true }),
};

export interface BackupOptions {
  home?: string;
  io?: Io;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

function backupsRoot(opts: BackupOptions): string {
  return join(opts.home ?? homedir(), ".cc-checkup", "backups");
}

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

async function removeEmptyDirs(repoDir: string, dirs: string[]): Promise<void> {
  for (const d of dirs) {
    try {
      await rmdir(join(repoDir, d));
    } catch {
      // 비어 있지 않거나 이미 없으면 둔다
    }
  }
}

async function writeManifest(backupDir: string, manifest: Manifest): Promise<void> {
  await writeFile(
    join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

export interface Change {
  path: string;
  content: string;
}

// 백업을 남기고 쓴다. 하나라도 실패하면 전부 원래대로 돌리고 오류를 던진다
export async function applyWithBackup(
  repoDir: string,
  changes: Change[],
  opts: BackupOptions = {},
): Promise<{ backupDir: string; manifest: Manifest }> {
  const io = opts.io ?? realIo;
  const now = opts.now ?? (() => new Date());
  const key = normalizeBase(repoDir, opts.platform);
  const backupDir = join(backupsRoot(opts), `${key.hash}-${stamp(now())}`);
  await mkdir(join(backupDir, "files"), { recursive: true });

  const files: ManifestFile[] = [];
  const createdDirs = new Set<string>();
  for (const change of changes) {
    const abs = join(repoDir, change.path);
    const original = await readOrNull(abs);
    if (original !== null) {
      const copy = join(backupDir, "files", change.path);
      await mkdir(dirname(copy), { recursive: true });
      await writeFile(copy, original);
    }
    files.push({
      path: change.path,
      existedBefore: original !== null,
      afterHash: sha256(change.content),
    });
    const parts = change.path.split("/").slice(0, -1);
    for (let i = parts.length; i > 0; i--) {
      const rel = parts.slice(0, i).join("/");
      if (await dirExists(join(repoDir, rel))) break; // 그 위 폴더도 이미 있다
      createdDirs.add(rel);
    }
  }
  const manifest: Manifest = {
    version: 1,
    base: { original: key.original, normalized: key.normalized },
    createdAt: now().toISOString(),
    files,
    createdDirs: [...createdDirs].sort((a, b) => b.split("/").length - a.split("/").length),
  };
  await writeManifest(backupDir, manifest);

  try {
    for (const change of changes) {
      const abs = join(repoDir, change.path);
      await mkdir(dirname(abs), { recursive: true });
      await io.writeFile(abs, change.content);
    }
  } catch (e) {
    const problems: string[] = [];
    for (const f of files) {
      const abs = join(repoDir, f.path);
      try {
        if (f.existedBefore) await writeFile(abs, await readFile(join(backupDir, "files", f.path)));
        else await rm(abs, { force: true });
      } catch (re) {
        problems.push(`${f.path}: ${(re as Error).message}`);
      }
    }
    await removeEmptyDirs(repoDir, manifest.createdDirs);
    manifest.rolledBackAt = now().toISOString();
    await writeManifest(backupDir, manifest);
    const reason = (e as Error).message;
    throw new Error(
      problems.length === 0
        ? `쓰기에 실패해 모두 원래대로 되돌렸습니다: ${reason}`
        : `쓰기에 실패했고 일부 파일을 되돌리지 못했습니다 (${problems.join("; ")}). 백업: ${backupDir}`,
      { cause: e },
    );
  }
  return { backupDir, manifest };
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

export interface UndoTarget {
  backupDir: string;
  manifest: Manifest;
}

// 이 폴더의 아직 되돌리지 않은 백업 중 가장 최근 것
export async function findUndoTarget(
  repoDir: string,
  opts: BackupOptions = {},
): Promise<UndoTarget | null> {
  const key = normalizeBase(repoDir, opts.platform);
  const root = backupsRoot(opts);
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return null;
  }
  const found: UndoTarget[] = [];
  for (const name of names) {
    if (!name.startsWith(`${key.hash}-`)) continue;
    const backupDir = join(root, name);
    try {
      const manifest = JSON.parse(
        await readFile(join(backupDir, "manifest.json"), "utf8"),
      ) as Manifest;
      if (
        manifest.base?.normalized !== key.normalized ||
        manifest.undoneAt ||
        manifest.rolledBackAt
      )
        continue;
      found.push({ backupDir, manifest });
    } catch {
      // 읽을 수 없는 백업은 건너뛴다
    }
  }
  found.sort(
    (a, b) =>
      b.manifest.createdAt.localeCompare(a.manifest.createdAt) ||
      b.backupDir.localeCompare(a.backupDir),
  );
  return found[0] ?? null;
}

export interface UndoItem {
  path: string;
  existedBefore: boolean;
  current: Buffer | null;
  original: Buffer | null;
  modifiedSince: boolean; // 적용 뒤 사람이 고쳤거나 지움
  alreadyOriginal: boolean;
}

export async function planUndo(repoDir: string, target: UndoTarget): Promise<UndoItem[]> {
  const items: UndoItem[] = [];
  for (const f of target.manifest.files) {
    const current = await readOrNull(join(repoDir, f.path));
    const original = f.existedBefore
      ? await readOrNull(join(target.backupDir, "files", f.path))
      : null;
    if (f.existedBefore && original === null) throw new Error(`백업 원본이 없습니다: ${f.path}`);
    items.push({
      path: f.path,
      existedBefore: f.existedBefore,
      current,
      original,
      modifiedSince: current === null || sha256(current) !== f.afterHash,
      alreadyOriginal: f.existedBefore
        ? current !== null && original !== null && current.equals(original)
        : current === null,
    });
  }
  return items;
}

export type UndoStatus = "restored" | "deleted" | "skipped" | "failed" | "untouched";

export interface UndoResult {
  ok: boolean;
  statuses: { path: string; status: UndoStatus; error?: string }[];
}

// 파일별로 복원한다. 실패하면 그 자리에서 멈추고 undoneAt을 쓰지 않는다
export async function executeUndo(
  repoDir: string,
  target: UndoTarget,
  items: UndoItem[],
  opts: BackupOptions = {},
): Promise<UndoResult> {
  const io = opts.io ?? realIo;
  const now = opts.now ?? (() => new Date());
  const statuses: UndoResult["statuses"] = [];
  let failed = false;
  for (const item of items) {
    if (failed) {
      statuses.push({ path: item.path, status: "untouched" });
      continue;
    }
    if (item.alreadyOriginal) {
      statuses.push({ path: item.path, status: "skipped" });
      continue;
    }
    const abs = join(repoDir, item.path);
    try {
      if (item.existedBefore) {
        await io.writeFile(abs, item.original as Buffer);
        statuses.push({ path: item.path, status: "restored" });
      } else {
        await io.rm(abs);
        statuses.push({ path: item.path, status: "deleted" });
      }
    } catch (e) {
      failed = true;
      statuses.push({ path: item.path, status: "failed", error: (e as Error).message });
    }
  }
  if (failed) return { ok: false, statuses };
  await removeEmptyDirs(repoDir, target.manifest.createdDirs);
  target.manifest.undoneAt = now().toISOString();
  await writeManifest(target.backupDir, target.manifest);
  return { ok: true, statuses };
}
