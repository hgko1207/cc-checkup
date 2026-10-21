// team-ai-kit 0.2.5 plugins/team-ai/hooks/block-dangerous-bash.js 복사본 (cc-checkup이 저장소에 넣는 위험 명령 차단 훅).
// 바꾼 것: require("./lib") → require("./lib.cjs"). 원본을 고치면 이 파일도 맞춘다.
// PreToolUse(Bash|PowerShell): 되돌리기 어려운 명령 차단
// 명령을 셸 문법(따옴표·이스케이프·구간·명령 치환)에 맞춰 나눠 해석한다.
// 해석할 수 없는 형태에 위험한 명령어가 섞여 있으면 막는다(fail-closed).
// 모든 검사는 입력 길이에 비례하는 시간 안에 끝나야 한다 (훅이 시간 초과되면 차단 없이 통과되기 때문).
const path = require("path");
const { spawnSync } = require("child_process");
const { readInput, loadConfig, projectDir, globToRegExp } = require("./lib.cjs");

const input = readInput();
const command = input.tool_input && typeof input.tool_input.command === "string" ? input.tool_input.command : "";
if (!command) process.exit(0);
const IS_PS = input.tool_name === "PowerShell";
const MAX_LEN = 20000;
const MAX_DEPTH = 6;

function block(why) {
  process.stderr.write(
    `팀 안전 규칙으로 차단된 명령입니다: ${why}. ` +
      `필요하면 사용자에게 명령을 보여 주고 직접 실행해 달라고 요청하세요.\n`
  );
  process.exit(2);
}

const config = loadConfig(input);
if (config.error) block(`팀 설정을 읽을 수 없어 모든 명령을 막았습니다 (${config.error}). 사람이 .claude/team-ai.json을 직접 고쳐야 합니다`);
if (command.length > MAX_LEN) block("명령이 너무 길어 검사할 수 없습니다");

// ---------- 파싱 ----------

// 따옴표·이스케이프·줄 이음을 처리하며 구간과 토큰으로 나눈다.
// Bash: \ 가 이스케이프, ` 와 $( ) 는 명령 치환(구간 경계로 취급)
// PowerShell: ` 가 이스케이프, \ 는 경로 문자
function split(cmd, ps) {
  const segs = [];
  let toks = [], cur = "", has = false, q = null;
  const ESC = ps ? "`" : "\\";
  const pushTok = () => { if (has) toks.push(cur); cur = ""; has = false; };
  const pushSeg = (sep) => { pushTok(); if (toks.length) segs.push({ toks, sep }); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) { q = null; continue; }
      if (q === '"' && c === ESC && i + 1 < cmd.length) { cur += cmd[++i]; continue; }
      cur += c;
      continue;
    }
    if (c === ESC && i + 1 < cmd.length) {
      const n = cmd[i + 1];
      i++;
      if (n === "\r" && cmd[i + 1] === "\n") i++;
      if (n === "\n" || n === "\r") { pushTok(); continue; } // 줄 이음
      cur += n; has = true;
      continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === ";" || c === "\n" || c === "\r" || c === "(" || c === ")" || (!ps && c === "`")) { pushSeg(c); continue; }
    if (c === "&") {
      if (cmd[i - 1] === ">" || cmd[i + 1] === ">") { cur += c; has = true; continue; } // 2>&1, &>
      if (cmd[i + 1] === "&") i++;
      pushSeg("&");
      continue;
    }
    if (c === "|") {
      if (cmd[i + 1] === "|") { i++; pushSeg("||"); } else pushSeg("|");
      continue;
    }
    if (c === " " || c === "\t") { pushTok(); continue; }
    cur += c; has = true;
  }
  pushSeg(";");
  // 블록 괄호 { } 를 토큰에서 떼어 낸다 (${VAR} 는 유지)
  for (const s of segs) {
    s.toks = s.toks
      .map((t) => (t.startsWith("${") ? t : t.replace(/^\{+/, "")))
      .map((t) => (t.includes("${") ? t : t.replace(/\}+$/, "")))
      .filter((t) => t !== "");
  }
  return { segs: segs.filter((s) => s.toks.length), unclosed: q !== null };
}

function base(t) {
  return t.replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

// 앞에 붙는 키워드·래퍼를 건너뛰고 실제 명령어를 찾는다
const WRAP = new Set(["!", "if", "then", "do", "else", "elif", "while", "until", "time", "exec", "command", "builtin",
  "nohup", "call", "sudo", "doas", "env", "nice", "ionice", "timeout", "stdbuf", "chroot", "watch", "xargs", "npx", "bunx"]);
const VALUE_OPTS = {
  sudo: ["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "--user", "--group", "--chdir"],
  doas: ["-u", "-C"],
  nice: ["-n", "--adjustment"],
  ionice: ["-c", "-n", "-p", "--class", "--classdata"],
  env: ["-u", "-C", "-S", "--unset", "--chdir", "--split-string"],
  xargs: ["-I", "-i", "-n", "-L", "-l", "-P", "-d", "-s", "-E", "-e", "-a", "--max-args", "--max-procs", "--delimiter", "--arg-file", "--replace"],
  watch: ["-n", "-d", "--interval"],
  timeout: ["-s", "-k", "--signal", "--kill-after"],
  stdbuf: ["-i", "-o", "-e"],
  npx: ["-p", "--package", "-c", "--call"],
  bunx: ["-p", "--package"]
};
const POSITIONAL_SKIP = { timeout: 1, chroot: 1 };

function head(toks) {
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const b = base(t);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
    if (WRAP.has(b)) {
      i++;
      const vo = VALUE_OPTS[b] || [];
      while (i < toks.length && toks[i].startsWith("-")) { const o = toks[i]; i++; if (vo.includes(o)) i++; }
      for (let k = 0; k < (POSITIONAL_SKIP[b] || 0) && i < toks.length; k++) i++;
      continue;
    }
    if ((b === "pnpm" || b === "yarn") && base(toks[i + 1] || "") === "dlx") { i += 2; continue; }
    break;
  }
  return { name: base(toks[i] || ""), args: toks.slice(i + 1) };
}

// 루트·홈·드라이브·현재/상위 디렉터리처럼 통째로 지우면 안 되는 대상인가 (정규식 반복 없이 선형 처리)
function isRootish(tok) {
  let t = tok.replace(/^-(literal)?path:/i, "").trim();
  if (!t) return false;
  t = t.replace(/^%(\w+)%/, (_, v) => "$env:" + v);
  t = t.replace(/^\$\{(env:)?(\w+)\}/i, (_, e, v) => "$" + (e || "") + v);
  t = t.replace(/^\$(userprofile|homedrive|homepath|systemdrive|systemroot)\b/i, (_, v) => "$env:" + v);
  t = t.split("\\").join("/");
  if (t.startsWith("//")) {
    const parts = t.slice(2).split("/").filter((p) => p && p !== "*" && p !== "*.*");
    return parts.length <= 2; // \\server 또는 \\server\share 전체
  }
  let prefix = "";
  let rest = t;
  if (/^[a-z]:/i.test(t)) { prefix = t.slice(0, 2); rest = t.slice(2) || "/"; }
  let n = path.posix.normalize(rest);
  let e = n.length;
  while (e > 0 && (n[e - 1] === "/" || n[e - 1] === "*" || n[e - 1] === ".")) e--;
  n = n.slice(0, e);
  if (prefix) return n === "";
  if (n === "" || n === "~") return true;
  if (/^\/[a-z]$/i.test(n)) return true; // Git Bash 드라이브 /c
  return /^\$(home|env:userprofile|env:homepath|env:homedrive|env:systemdrive|env:systemroot)$/i.test(n);
}

// ---------- 규칙 ----------

const RM = new Set(["rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"]);
const CMD_STYLE = new Set(["del", "erase", "rd", "rmdir"]);
const FETCH = new Set(["curl", "wget", "iwr", "irm", "invoke-webrequest", "invoke-restmethod"]);
const RUNNERS = new Set(["sh", "bash", "zsh", "dash", "python", "python3", "node", "perl", "ruby", "iex", "invoke-expression", "powershell", "pwsh"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const SQL = new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlcmd", "mongosh", "mongo", "clickhouse-client", "cockroach", "snowsql", "bq"]);
const SQL_DROP = /\b(drop\s+(table|database|schema)|truncate\s+(table\s+)?\w|dropdatabase\s*\()/i;
const DANGER_WORDS = /\b(rm|remove-item|ri|del|erase|rd|rmdir|git|drop|truncate|format-volume|mkfs\w*|dd|chmod|terraform|kubectl)\b/i;
const FIND_FILTERS = new Set(["-name", "-iname", "-path", "-ipath", "-wholename", "-regex", "-iregex", "-newer", "-mtime", "-mmin", "-size", "-user", "-empty", "-perm"]);

function isRecursive(name, args) {
  return args.some((a) =>
    (/^-[a-zA-Z]+$/.test(a) && /[rR]/.test(a) && !/^-f(o(r(c(e)?)?)?)?$/i.test(a) && !/^-verbose$/i.test(a)) ||
    /^--recursive$/i.test(a) ||
    /^-r(e(c(u(r(s(e)?)?)?)?)?)?(:\$true)?$/i.test(a) ||
    (CMD_STYLE.has(name) && /^\/s$/i.test(a))
  );
}

function targetsOf(name, args) {
  return args.filter((a) => {
    if (/^-(literal)?path:/i.test(a)) return true;
    if (a.startsWith("-") || a === "<<<" || a === ">" || a === ">>") return false;
    if (CMD_STYLE.has(name) && /^\/[a-z]$/i.test(a)) return false; // cmd 스타일 옵션 /s /q
    return true;
  });
}

function findDeletesRoot(args) {
  const deleting = args.some((a, i) => a === "-delete" || (["-exec", "-execdir", "-ok", "-okdir"].includes(a) && RM.has(base(args[i + 1] || ""))));
  if (!deleting) return false;
  const starts = [];
  for (const a of args) { if (a.startsWith("-") || a === "!" || a === "(") break; starts.push(a); }
  if (!starts.some(isRootish)) return false;
  return !args.some((a) => FIND_FILTERS.has(a));
}

// 파이프 앞 구간이 루트·홈 같은 대상을 내보내는가 (echo /, gci C:\, find /)
function producesRoot(seg) {
  const { name, args } = head(seg.toks);
  if (name === "find") {
    const starts = [];
    for (const a of args) { if (a.startsWith("-")) break; starts.push(a); }
    return starts.some(isRootish) && !args.some((a) => FIND_FILTERS.has(a));
  }
  return targetsOf(name, args).some(isRootish);
}

function protectedBranch(b) {
  const name = b.replace(/^refs\/heads\//, "");
  return (config.protectedBranches || []).some((g) => globToRegExp(g, false).test(name));
}

function currentBranch(dir) {
  const cwd = dir ? path.resolve(projectDir(input), dir) : projectDir(input);
  for (const args of [["symbolic-ref", "--short", "HEAD"], ["rev-parse", "--abbrev-ref", "HEAD"]]) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    const b = r.status === 0 && r.stdout.trim();
    if (b && b !== "HEAD") return b;
  }
  return null;
}

function checkGit(args) {
  const VAL = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"];
  let i = 0, gitCwd = null;
  while (i < args.length && args[i].startsWith("-")) {
    const o = args[i];
    if (VAL.includes(o)) { if (o === "-C") gitCwd = args[i + 1]; i += 2; } else i++;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  const flags = rest.filter((a) => a.startsWith("-"));
  const pos = rest.filter((a) => !a.startsWith("-"));
  const shortLetters = flags.filter((f) => /^-[a-zA-Z]+$/.test(f)).join("");
  const dry = flags.includes("--dry-run") || /n/.test(shortLetters);

  if (sub === "push" && !dry) {
    if (flags.includes("--mirror")) return "저장소 전체 미러 푸시";
    const force = flags.some((f) => /^--force(-with-lease)?(=|$)/.test(f)) || /f/.test(shortLetters);
    const del = flags.includes("--delete") || /d/.test(shortLetters);
    if ((force || del) && (flags.includes("--all") || flags.includes("--branches"))) return "모든 브랜치 강제 푸시·삭제";
    const specs = pos.slice(1); // 첫 위치 인자는 원격 이름
    const risky = [];
    for (const s of specs) {
      const plus = s.startsWith("+");
      const body = plus ? s.slice(1) : s;
      const colon = body.lastIndexOf(":");
      const src = colon >= 0 ? body.slice(0, colon) : body;
      let dst = colon >= 0 ? body.slice(colon + 1) : body;
      if (dst === "HEAD" || dst === "@") dst = currentBranch(gitCwd) || "(현재 브랜치 확인 불가)";
      const deleting = colon >= 0 && src === "";
      if (plus || deleting || force || del) risky.push(dst);
    }
    if ((force || del) && specs.length === 0) risky.push(currentBranch(gitCwd) || "(현재 브랜치 확인 불가)");
    const hit = risky.find((b) => b.startsWith("(") || protectedBranch(b));
    if (hit) return `보호 브랜치 강제 푸시·삭제 (${hit})`;
  }
  if (sub === "reset" && flags.includes("--hard") && pos.some((p) => /^(origin|upstream)\//.test(p))) {
    return "원격 기준 강제 리셋 (로컬 작업 손실)";
  }
  if (sub === "clean" && !dry) {
    const force = /f/.test(shortLetters) || flags.includes("--force");
    const dirs = /[dxX]/.test(shortLetters);
    if (force && dirs) return "추적되지 않은 파일 일괄 삭제";
  }
  return null;
}

// 한 구간을 검사. piped는 파이프로 이어진 앞 구간들
function checkSeg(seg, piped, depth, vars) {
  const toks = seg.toks.map((t) => expandVars(t, vars));
  const { name, args } = head(toks);
  const text = toks.join(" ");

  // 다른 셸·문자열 실행 안의 명령은 그 안을 다시 검사
  if (SHELLS.has(name)) {
    const k = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (k >= 0 && args[k + 1] !== undefined) return analyze(args[k + 1], false, depth + 1);
    const h = args.indexOf("<<<");
    if (h >= 0 && args[h + 1] !== undefined) return analyze(args[h + 1], false, depth + 1);
  }
  if (name === "powershell" || name === "pwsh") {
    if (args.some((a) => /^-(e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/i.test(a))) {
      return "인코딩된 PowerShell 명령 (내용을 검사할 수 없음)";
    }
    const k = args.findIndex((a) => /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a));
    if (k >= 0) return analyze(args.slice(k + 1).join(" "), true, depth + 1);
  }
  if (name === "cmd") {
    const k = args.findIndex((a) => /^\/[ck]$/i.test(a));
    if (k >= 0) return analyze(args.slice(k + 1).join(" "), false, depth + 1);
  }
  if (name === "eval") return analyze(args.join(" "), false, depth + 1);
  if (name === "iex" || name === "invoke-expression") {
    if (piped.some((p) => FETCH.has(head(p.toks).name))) return "인터넷에서 받은 스크립트 바로 실행";
    if (args.length) return analyze(args.join(" "), true, depth + 1);
  }
  if (name === "start-process") {
    return analyze(args.filter((a) => !a.startsWith("-")).join(" "), IS_PS, depth + 1);
  }

  if (RM.has(name)) {
    const targets = targetsOf(name, args);
    if (isRecursive(name, args) && targets.some(isRootish)) return "루트·홈·드라이브·현재/상위 디렉터리 통째 삭제";
    if (CMD_STYLE.has(name) && targets.some((t) => isRootish(t) && /\*/.test(t))) return "드라이브 전체 파일 삭제";
    if (targets.length === 0 && piped.some(producesRoot)) return "루트·홈 디렉터리 목록을 받아 삭제";
  }
  if (name === "find" && findDeletesRoot(args)) return "루트·홈·현재 디렉터리 전체를 찾아 삭제";
  if (name === "git") {
    const why = checkGit(args);
    if (why) return why;
  }
  if (SQL.has(name) && (SQL_DROP.test(text) || piped.some((p) => SQL_DROP.test(p.toks.join(" "))))) return "데이터베이스 삭제·초기화";
  if (name === "dropdb") return "데이터베이스 삭제";
  if (name === "prisma" && /\bmigrate\s+reset\b/.test(text)) return "데이터베이스 초기화";
  if ((name === "rails" || name === "rake") && /\bdb:(drop|reset)\b/.test(text)) return "데이터베이스 삭제·초기화";
  if (name === "flyway" && args.includes("clean")) return "데이터베이스 초기화";
  if (RUNNERS.has(name) && piped.some((p) => FETCH.has(head(p.toks).name))) return "인터넷에서 받은 스크립트 바로 실행";
  if (name === "chmod" && args.some((a) => /^-[a-zA-Z]*R/.test(a) || a === "--recursive") && args.some((a) => /^0?777$/.test(a))) {
    return "전체 권한 개방";
  }
  if (/^mkfs/.test(name) || name === "format-volume" || (name === "dd" && args.some((a) => /^of=\/dev\//.test(a)))) return "디스크 초기화";
  if ((name === "terraform" || name === "tofu") && ["apply", "destroy"].includes(args.find((a) => !a.startsWith("-")))) return "인프라 변경";
  if (name === "kubectl" && args.includes("delete")) return "클러스터 리소스 삭제";
  if (["npm", "pnpm", "yarn"].includes(name) && args.includes("publish") && !args.includes("--dry-run")) return "패키지 외부 배포";
  if (name === "docker" && args[0] === "push") return "이미지 외부 배포";
  return null;
}

// 변수 대입 추적: X=/ ; rm -rf $X  /  $x = "C:\" ; Remove-Item $x -Recurse
function expandVars(t, vars) {
  if (!t.includes("$")) return t;
  return t.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, v) => (Object.prototype.hasOwnProperty.call(vars, v) ? vars[v] : m));
}

function recordVars(seg, vars, ps) {
  const t = seg.toks;
  if (!ps && t.every((x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x))) {
    for (const x of t) { const k = x.indexOf("="); vars[x.slice(0, k)] = x.slice(k + 1); }
  }
  if (ps && t.length >= 3 && /^\$[A-Za-z_]\w*$/.test(t[0]) && t[1] === "=") vars[t[0].slice(1)] = t.slice(2).join(" ");
}

function analyze(cmd, ps, depth) {
  if (depth > MAX_DEPTH) return "명령이 너무 깊게 중첩되어 검사할 수 없습니다";
  const { segs, unclosed } = split(cmd, ps);
  if (unclosed && DANGER_WORDS.test(cmd)) return "따옴표가 닫히지 않아 해석할 수 없는 명령";

  // 명령 전체에 걸친 패턴: iex (iwr ...) 처럼 괄호로 나뉜 원격 스크립트 실행
  const names = segs.map((s) => head(s.toks).name);
  if (names.some((n) => n === "iex" || n === "invoke-expression") &&
      (names.some((n) => FETCH.has(n)) || /net\.webclient/i.test(cmd))) {
    return "인터넷에서 받은 스크립트 바로 실행";
  }
  if (/<\(\s*(curl|wget)\b/i.test(cmd)) return "인터넷에서 받은 스크립트 바로 실행";

  // 따옴표 안의 명령 치환 $( ... ) 과 `...` 도 다시 검사
  if (/\$\(|`/.test(cmd)) {
    for (const s of segs) for (const t of s.toks) {
      let k = t.indexOf("$(");
      while (k >= 0) {
        const end = t.indexOf(")", k);
        const inner = t.slice(k + 2, end < 0 ? t.length : end);
        const why = analyze(inner, ps, depth + 1);
        if (why) return why;
        k = t.indexOf("$(", k + 2);
      }
    }
  }

  const vars = {};
  let piped = [];
  for (const seg of segs) {
    const why = checkSeg(seg, piped, depth, vars);
    if (why) return why;
    recordVars(seg, vars, ps);
    piped = seg.sep === "|" ? piped.concat([seg]) : [];
  }
  return null;
}

let why = analyze(command, IS_PS, 0);
if (!why) {
  for (const s of config.blockedCommands || []) {
    try { if (new RegExp(s, "i").test(command)) { why = `팀 규칙 (${s})`; break; } } catch { /* 잘못된 정규식은 설정 검증에서 걸러진다 */ }
  }
}
if (why) block(why);
process.exit(0);
