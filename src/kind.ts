// 폴더 종류 자동 판별: 개발 저장소인가, 문서·기획 폴더인가.
// 빌드·패키지 파일이 있으면 개발 저장소. 없으면 맨 위와 한 단계 아래 파일 확장자를 세어
// 코드 파일이 문서 파일보다 많으면 개발 저장소, 아니면 문서 폴더. 사용자가 화면에서 바꿀 수 있다.
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FolderKind } from "./standard.js";

const DEV_MARKERS = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "cargo.toml",
  "gemfile",
  "composer.json",
  "pubspec.yaml",
  "cmakelists.txt",
  "makefile",
  "deno.json",
]);
const DEV_SUFFIX = [".sln", ".csproj", ".xcodeproj"];
const CODE_EXT = new Set(
  ".ts .tsx .js .jsx .mjs .cjs .py .java .kt .go .rs .cs .c .cc .cpp .h .hpp .swift .rb .php .scala .dart .vue .svelte .sql .sh .ps1".split(
    " ",
  ),
);
const DOC_EXT = new Set(
  ".md .txt .docx .doc .pptx .ppt .xlsx .xls .csv .pdf .hwp .hwpx .key .pages .numbers .png .jpg .jpeg".split(
    " ",
  ),
);
const SKIP = new Set(["node_modules", ".git", ".claude"]);

export interface KindGuess {
  kind: FolderKind;
  reason: string;
}

export async function detectKind(dir: string): Promise<KindGuess> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { kind: "dev", reason: "폴더를 읽지 못해 개발 저장소로 봅니다" };
  }
  const marker = entries.find(
    (e) =>
      (e.isFile() || e.isDirectory()) &&
      (DEV_MARKERS.has(e.name.toLowerCase()) ||
        DEV_SUFFIX.some((s) => e.name.toLowerCase().endsWith(s))),
  );
  if (marker) return { kind: "dev", reason: `${marker.name}이 있어 개발 저장소로 봅니다` };

  let code = 0;
  let docs = 0;
  const count = (name: string) => {
    const ext = extname(name).toLowerCase();
    if (CODE_EXT.has(ext)) code++;
    else if (DOC_EXT.has(ext)) docs++;
  };
  for (const e of entries) {
    if (e.isFile()) count(e.name);
    else if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".")) {
      try {
        for (const c of await readdir(join(dir, e.name), { withFileTypes: true }))
          if (c.isFile()) count(c.name);
      } catch {
        // 읽지 못한 하위 폴더는 건너뛴다
      }
    }
  }
  if (code > docs)
    return { kind: "dev", reason: `코드 파일(${code}개)이 문서 파일(${docs}개)보다 많습니다` };
  return {
    kind: "docs",
    reason: `빌드 파일이 없고 문서 파일(${docs}개)이 코드 파일(${code}개)보다 많거나 같습니다`,
  };
}
