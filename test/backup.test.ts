import { mkdtemp, readFile, readdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyWithBackup,
  executeUndo,
  findUndoTarget,
  normalizeBase,
  planUndo,
  type BackupOptions,
  type Io,
} from "../src/backup.js";
import { repoWith } from "./helpers.js";

async function home(): Promise<BackupOptions> {
  return { home: await mkdtemp(join(tmpdir(), "cc-home-")) };
}

let tick = 0;
function clock(): () => Date {
  return () => new Date(Date.UTC(2026, 9, 20, 0, 0, 0, tick++));
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

const S = ".claude/settings.json";

// Windows 경로 규칙(드라이브 문자·대소문자 무시·역슬래시)을 실제 파일 시스템으로 확인하는 테스트는 Windows에서만
const onWindows = it.skipIf(process.platform !== "win32");

describe("normalizeBase (R3)", () => {
  onWindows("Windows에서는 대소문자·끝 구분자·상대 경로가 달라도 같은 키", async () => {
    const dir = await repoWith({});
    const a = normalizeBase(dir, "win32");
    expect(normalizeBase(dir.toUpperCase(), "win32").hash).toBe(a.hash);
    expect(normalizeBase(dir + "\\", "win32").hash).toBe(a.hash);
    expect(normalizeBase(join(dir, "x", ".."), "win32").hash).toBe(a.hash);
    expect(a.original).toBe(dir);
  });

  it("정션을 거쳐 들어와도 같은 키", async () => {
    const dir = await repoWith({});
    const link = join(await mkdtemp(join(tmpdir(), "cc-link-")), "j");
    await symlink(dir, link, "junction");
    expect(normalizeBase(link, "win32").hash).toBe(normalizeBase(dir, "win32").hash);
  });

  onWindows("드라이브 루트는 끝 구분자를 남긴다", () => {
    expect(normalizeBase("C:\\", "win32").normalized).toBe("c:\\");
  });
});

describe("applyWithBackup", () => {
  it("원래 있던 파일은 백업하고 manifest를 남긴다", async () => {
    const repo = await repoWith({ [S]: "old" });
    const opts = { ...(await home()), now: clock() };
    const { backupDir, manifest } = await applyWithBackup(
      repo,
      [{ path: S, content: "new" }],
      opts,
    );
    expect(await readFile(join(repo, S), "utf8")).toBe("new");
    expect(await readFile(join(backupDir, "files", S), "utf8")).toBe("old");
    expect(manifest.files[0]?.existedBefore).toBe(true);
    expect(manifest.createdDirs).toEqual([]);
    expect(backupDir).toContain(normalizeBase(repo).hash);
  });

  it("두 번째 파일 쓰기가 실패하면 첫 파일 복원·새 파일 삭제·새 폴더 삭제", async () => {
    const repo = await repoWith({ "a.txt": "A" });
    let calls = 0;
    const io: Io = {
      writeFile: async (p, d) => {
        if (++calls === 2) throw new Error("disk full");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(p, d);
      },
      rm: async () => {},
    };
    const opts = { ...(await home()), io, now: clock() };
    await expect(
      applyWithBackup(
        repo,
        [
          { path: "a.txt", content: "A2" },
          { path: S, content: "{}" },
        ],
        opts,
      ),
    ).rejects.toThrow("모두 원래대로 되돌렸습니다");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("A");
    expect(await exists(join(repo, ".claude"))).toBe(false);
    expect(await findUndoTarget(repo, opts)).toBeNull(); // 롤백된 백업은 되돌리기 대상 아님
  });
});

describe("--undo (R5)", () => {
  it("되돌릴 기록이 없으면 null", async () => {
    expect(await findUndoTarget(await repoWith({}), await home())).toBeNull();
  });

  it("새로 만든 파일은 지우고 빈 새 폴더도 지운 뒤 undoneAt을 쓴다", async () => {
    const repo = await repoWith({});
    const opts = { ...(await home()), now: clock() };
    await applyWithBackup(repo, [{ path: S, content: "{}" }], opts);
    const target = await findUndoTarget(repo, opts);
    expect(target).not.toBeNull();
    const items = await planUndo(repo, target!);
    const res = await executeUndo(repo, target!, items, opts);
    expect(res.ok).toBe(true);
    expect(res.statuses).toEqual([{ path: S, status: "deleted" }]);
    expect(await exists(join(repo, ".claude"))).toBe(false);
    expect(await findUndoTarget(repo, opts)).toBeNull();
  });

  it("두 번 고쳤으면 역순으로 하나씩 되돌린다", async () => {
    const repo = await repoWith({ [S]: "v0" });
    const opts = { ...(await home()), now: clock() };
    await applyWithBackup(repo, [{ path: S, content: "v1" }], opts);
    await applyWithBackup(repo, [{ path: S, content: "v2" }], opts);
    for (const expected of ["v1", "v0"]) {
      const t = await findUndoTarget(repo, opts);
      await executeUndo(repo, t!, await planUndo(repo, t!), opts);
      expect(await readFile(join(repo, S), "utf8")).toBe(expected);
    }
    expect(await findUndoTarget(repo, opts)).toBeNull();
  });

  onWindows("다른 표기(대문자)로 실행해도 같은 백업을 찾는다", async () => {
    const repo = await repoWith({ [S]: "v0" });
    const opts = { ...(await home()), now: clock(), platform: "win32" as const };
    await applyWithBackup(repo, [{ path: S, content: "v1" }], opts);
    expect(await findUndoTarget(repo.toUpperCase() + "\\", opts)).not.toBeNull();
  });

  it("적용 뒤 사람이 고친 파일은 modifiedSince", async () => {
    const repo = await repoWith({ [S]: "v0" });
    const opts = { ...(await home()), now: clock() };
    await applyWithBackup(repo, [{ path: S, content: "v1" }], opts);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(repo, S), "human");
    const items = await planUndo(repo, (await findUndoTarget(repo, opts))!);
    expect(items[0]?.modifiedSince).toBe(true);
  });

  it("복원 중 실패하면 멈추고 파일별 상태, 다시 실행하면 이미 원본인 파일은 건너뛴다", async () => {
    const repo = await repoWith({ "a.txt": "A", "b.txt": "B", "c.txt": "C" });
    const opts = { ...(await home()), now: clock() };
    await applyWithBackup(
      repo,
      ["a.txt", "b.txt", "c.txt"].map((p) => ({ path: p, content: "X" })),
      opts,
    );
    const failB: Io = {
      writeFile: async (p, d) => {
        if (p.endsWith("b.txt")) throw new Error("locked");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(p, d);
      },
      rm: async () => {},
    };
    let target = (await findUndoTarget(repo, opts))!;
    const first = await executeUndo(repo, target, await planUndo(repo, target), {
      ...opts,
      io: failB,
    });
    expect(first.ok).toBe(false);
    expect(first.statuses.map((s) => s.status)).toEqual(["restored", "failed", "untouched"]);
    expect(first.statuses[1]?.error).toBe("locked");

    target = (await findUndoTarget(repo, opts))!; // undoneAt이 없어 다시 대상
    const second = await executeUndo(repo, target, await planUndo(repo, target), opts);
    expect(second.ok).toBe(true);
    expect(second.statuses.map((s) => s.status)).toEqual(["skipped", "restored", "restored"]);
    expect(
      await Promise.all(["a.txt", "b.txt", "c.txt"].map((p) => readFile(join(repo, p), "utf8"))),
    ).toEqual(["A", "B", "C"]);
  });

  it("백업 폴더 안 manifest 하나당 백업 하나", async () => {
    const repo = await repoWith({});
    const opts = { ...(await home()), now: clock() };
    await applyWithBackup(repo, [{ path: S, content: "{}" }], opts);
    const root = join(opts.home as string, ".cc-checkup", "backups");
    const [name] = await readdir(root);
    expect(await exists(join(root, name!, "manifest.json"))).toBe(true);
  });
});
