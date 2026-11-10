// team-ai-kit plugins/team-ai/hooks/lib.js 복사본 (cc-checkup 위험 명령 차단 훅용). 원본을 고치면 이 파일도 맞춘다.
// 훅 공통 유틸: stdin JSON 읽기, 프로젝트 설정(.claude/team-ai.json) 읽기, 경로 정규화
const fs = require("fs");
const path = require("path");

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

const CONFIG_FILE = path.join(".claude", "team-ai.json");

// 기본 보호 목록. 팀 설정의 allowPaths로 풀 수 없다.
const DEFAULT_PROTECTED = [
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.pfx",
  "**/*.p12",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/.npmrc",
  "**/secrets/**",
  "**/.git/**"
];
// 기본 보호 목록 중 예외로 허용하는 파일 (값이 없는 예시 파일)
const DEFAULT_ALLOWED = ["**/.env.example", "**/.env.sample", "**/.env.template"];
// 이미 있으면 수정할 수 없는 팀 설정 파일 (새로 만드는 것은 허용)
const CONFIG_FILES = ["**/.claude/team-ai.json", "**/.claude/settings.json", "**/.claude/settings.local.json"];
const DEFAULT_BRANCHES = ["main", "master", "develop", "production", "prod", "release/*", "release-*"];

const DEFAULTS = {
  // 팀이 추가하는 보호 경로와 그 예외 (기본 목록과 별개로 적용)
  protectedPaths: [],
  allowPaths: [],
  // 보호 브랜치 (기본 목록에 더해진다)
  protectedBranches: DEFAULT_BRANCHES,
  // 추가로 막을 Bash·PowerShell 명령 (정규식 문자열)
  blockedCommands: [],
  // 파일 수정 후 실행할 포맷 명령. 배열(권장) 또는 공백으로 나눌 문자열. {file} 자리에 파일 경로
  // 예: ["npx", "--no-install", "prettier", "--write", "{file}"]
  formatCommand: [],
  // 포맷 대상 확장자. 비우면 모든 파일
  formatExtensions: [],
  // 대화 압축 후 다시 넣을 CLAUDE.md 섹션 제목. 루트 CLAUDE.md는 압축 후 자동으로 다시 읽히므로 기본은 비움
  reinjectSections: []
};

const ARRAY_KEYS = ["protectedPaths", "allowPaths", "protectedBranches", "blockedCommands", "formatExtensions", "reinjectSections"];
const MAX_PATTERN = 200;

function validPattern(k, v) {
  if (v.length > MAX_PATTERN) return `${k}의 항목이 너무 깁니다 (${MAX_PATTERN}자 이하)`;
  if (k === "blockedCommands") {
    // 중첩 반복 (a+)+ 같은 패턴은 검사 시간이 폭발할 수 있어 받지 않는다
    if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(v)) return `blockedCommands의 "${v}"는 중첩 반복이라 쓸 수 없습니다`;
    try { new RegExp(v); } catch { return `blockedCommands의 "${v}"는 올바른 정규식이 아닙니다`; }
  } else if ((v.match(/\*/g) || []).length > 10) {
    return `${k}의 "${v}"에 * 가 너무 많습니다`;
  }
  return null;
}

// 설정을 읽는다. 문제가 있으면 기본값을 쓰고 error에 이유를 담는다 (훅이 이를 보고 막는다).
function loadConfig(input) {
  const file = path.join(projectDir(input), CONFIG_FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { ...DEFAULTS, error: null };
  }
  let user;
  try {
    user = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    return { ...DEFAULTS, error: `${CONFIG_FILE} JSON 문법 오류: ${e.message}` };
  }
  const out = { ...DEFAULTS, error: null };
  if (!user || typeof user !== "object" || Array.isArray(user)) return { ...out, error: `${CONFIG_FILE}는 객체여야 합니다` };
  for (const [k, v] of Object.entries(user)) {
    if (ARRAY_KEYS.includes(k)) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) { out.error = `${CONFIG_FILE}의 ${k}는 문자열 배열이어야 합니다`; continue; }
      const bad = v.map((x) => validPattern(k, x)).find(Boolean);
      if (bad) { out.error = bad; continue; }
      out[k] = k === "protectedBranches" ? Array.from(new Set([...DEFAULT_BRANCHES, ...v])) : v;
      if (k === "formatExtensions") out[k] = v.map((x) => (x.startsWith(".") ? x : "." + x).toLowerCase());
    } else if (k === "formatCommand") {
      const ok = (typeof v === "string") || (Array.isArray(v) && v.every((x) => typeof x === "string"));
      if (!ok) { out.error = `${CONFIG_FILE}의 formatCommand는 문자열 또는 문자열 배열이어야 합니다`; continue; }
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

// 간단한 glob → 정규식 변환 (**, *, ? 지원)
function globToRegExp(glob, ci = CASE_INSENSITIVE) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" 는 0개 이상의 디렉터리
        if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; }
        else { re += ".*"; i += 1; }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + re + "$", ci ? "i" : "");
}

// Windows 대체 데이터 스트림(.env::$DATA, .env:stream)을 떼어 낸다
function stripStream(p) {
  const drive = /^[A-Za-z]:/.test(p) ? 2 : 0;
  const k = p.indexOf(":", drive);
  return k >= 0 ? p.slice(0, k) : p;
}

// 실제 경로: 8.3 짧은 이름(ENV~1)과 심볼릭 링크를 푼다. 없는 파일이면 가장 가까운 상위 폴더를 푼다.
function realPath(abs) {
  let cur = abs;
  const tail = [];
  for (let i = 0; i < 64; i++) {
    try {
      const real = fs.realpathSync.native(cur);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
  return abs;
}

// 검사용 경로 목록: 요청한 경로와 실제 경로. 프로젝트 안이면 상대 경로, 밖이면 슬래시로 바꾼 절대 경로
function matchPaths(input, filePath) {
  const root = projectDir(input);
  let rootReal = root;
  try { rootReal = fs.realpathSync.native(root); } catch { /* 그대로 */ }
  const abs = path.resolve(root, stripStream(filePath));
  const out = [];
  for (const [p, r] of [[abs, root], [realPath(abs), rootReal]]) {
    const rel = path.relative(r, p);
    const inside = rel && !rel.startsWith("..") && !path.isAbsolute(rel);
    out.push({ path: (inside ? rel : p).split(path.sep).join("/"), inside, abs: p });
  }
  return out;
}

module.exports = {
  readInput, loadConfig, projectDir, globToRegExp, matchPaths, CONFIG_FILE,
  DEFAULT_PROTECTED, DEFAULT_ALLOWED, CONFIG_FILES
};
