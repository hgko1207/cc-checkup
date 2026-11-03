// 화면. 파일 내용·메시지는 모두 textContent로만 넣는다 (HTML로 해석하지 않음, eng review R1).
import type {
  AppState,
  CcCheckupApi,
  ClaudeView,
  DiagnosisView,
  FilePreview,
  FindingView,
  Kind,
  Progress,
  UndoView,
  Usage,
} from "../api.js";

declare global {
  interface Window {
    ccCheckup: CcCheckupApi;
  }
}

const api = window.ccCheckup;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; title?: string; type?: string; id?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.id) el.id = props.id;
  if (props.class) el.className = props.class;
  if (props.title) el.title = props.title;
  if (props.type) el.setAttribute("type", props.type);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

function button(label: string, onClick: () => void, cls = "btn"): HTMLButtonElement {
  const b = h("button", { class: cls, type: "button" }, label);
  b.addEventListener("click", onClick);
  return b;
}

let state: AppState | null = null;
let current: DiagnosisView | null = null;
let busy = false;
// 확인이 필요한 패널(미리 보기·실행 전 확인)이 열린 동안에는 다른 고치기 버튼을 끈다
let locked = false;
let returnFocus: HTMLElement | null = null;
let dismissedUpdate: string | null = null;
let elapsedTimer: number | undefined;
const expanded = new Set<string>(); // 펼친 [자세히]·[예시 보기] (항목 id:종류)
let loading = false; // 진단 중 (점수 자리에 "점검 중…")

const READY_SCORE = 80; // 목표 점수 (이 점수 이상이고 팀원에게 보냈으면 "준비됨")

// 상태 아이콘 (직접 그린 SVG, 굵기 하나)
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATH = {
  fail: "M7 7l10 10M17 7L7 17",
  warn: "M12 6v7M12 17.5v.01",
  ok: "M6 12.5l4 4 8-9",
  na: "M7 12h10",
  commit: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M3 12h6M15 12h6",
};
function icon(kind: keyof typeof ICON_PATH): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATH[kind]);
  svg.append(path);
  return svg;
}

function setBusy(v: boolean): void {
  busy = v;
  render();
  syncPanelBusy();
  if (!v && focusNextLater) focusNext();
  // 작업 중에 패널을 닫아 돌아갈 버튼이 꺼져 있었으면, 작업이 끝난 뒤 돌려준다
  if (!v && pendingReturn) {
    const { el, key } = pendingReturn;
    pendingReturn = null;
    if (el?.isConnected && !(el as HTMLButtonElement).disabled) el.focus();
    else focusKey(key);
  }
}
let pendingReturn: { el: HTMLElement | null; key: string | null } | null = null;

function scoreChange(before: number, after: number): string {
  if (after === before) return `점수 ${after}점 (변화 없음)`;
  const d = after - before;
  return `점수 ${before} → ${after}점 (${d > 0 ? "+" : "−"}${Math.abs(d)})`;
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// 로그·목록에서 열린 폴더 경로를 떼고 폴더 안 경로만 보여 준다
function relPath(p: string): string {
  if (!current) return p;
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const base = norm(current.path).replace(/\/$/, "") + "/";
  return norm(p).startsWith(base) ? p.slice(base.length).replace(/\\/g, "/") : p;
}

// ---- 진행·변경 확인 패널 ----

// 다시 그려도 포커스를 잃지 않게 버튼에 이름표(data-key)를 붙이고, 그 이름표로 되찾는다
function keyed<T extends HTMLElement>(el: T, key: string): T {
  el.dataset.key = key;
  return el;
}
let returnKey: string | null = null;

function focusKey(key: string | null): boolean {
  if (!key) return false;
  const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (!el || (el as HTMLButtonElement).disabled) return false;
  el.focus();
  return true;
}

// 패널을 닫으면 돌아갈 버튼. 동작을 시작하자마자(버튼이 꺼지기 전에) 기억한다
function rememberFocus(): void {
  const el = document.activeElement;
  if ($("panel").hidden && el instanceof HTMLElement && el !== document.body) {
    returnFocus = el;
    returnKey = el.dataset.key ?? null;
  }
}

// 확인이 필요한 창은 화면 가운데(모달), 결과 알림은 closeOnly()가 아래쪽 카드(비모달)로 바꾼다
function panel(title: string, message = "", tone: "" | "error" = "", compact = false): void {
  $("panel").classList.toggle("compact", compact);
  $("panel").classList.remove("toast");
  $("panel").setAttribute("role", "dialog");
  panelOpenedAt = Date.now();
  document.body.classList.remove("has-toast");
  rememberFocus();
  $("panel").hidden = false;
  setModal(true);
  $("panel-title").textContent = title;
  const m = $("panel-message");
  m.textContent = message;
  m.className = `panel-message ${tone}`;
  $("log").replaceChildren();
  $("log").hidden = true;
  $("outside").replaceChildren();
  $("outside").hidden = true;
  $("diffs").replaceChildren();
  $("panel-btns").replaceChildren();
  $("panel-note").replaceChildren();
  $("panel-close").hidden = false;
  stopElapsed();
  $("panel-title").focus();
}

// 주 버튼을 먼저 넘기면 화면에는 오른쪽 끝에 놓고, Tab 순서도 화면 순서(취소 → 주 버튼)와 같게 한다.
// 확인창의 주 버튼은 Ctrl+Enter로도 누른다. 돈이 들거나 되돌릴 수 없는 버튼(deliberate)은 빼고
function panelButtons(...btns: HTMLButtonElement[]): void {
  for (const b of btns)
    if (b.classList.contains("primary") && !b.classList.contains("deliberate")) {
      b.title = "Ctrl+Enter";
      b.setAttribute("aria-keyshortcuts", "Control+Enter");
    }
  const quick = btns.find(
    (b) => b.classList.contains("primary") && !b.classList.contains("deliberate"),
  );
  const deliberate = btns.some((b) => b.classList.contains("deliberate"));
  const hint = quick
    ? h("kbd", { class: "kbd" }, "Ctrl+Enter")
    : deliberate
      ? h("span", { class: "kbd-note" }, "단축키로는 실행되지 않습니다")
      : null;
  hint?.setAttribute("aria-hidden", "true");
  $("panel-btns").replaceChildren(...(hint ? [hint] : []), ...[...btns].reverse());
}

// 작업이 도는 동안 확인창 버튼을 막아 두 번 실행되지 않게 한다 (중단처럼 실행 중에 쓰는 버튼은 allow-busy)
function syncPanelBusy(): void {
  for (const b of $("panel-btns").querySelectorAll<HTMLButtonElement>("button")) {
    if (b.classList.contains("allow-busy")) continue;
    if (b.dataset.label === undefined) b.dataset.label = b.textContent ?? "";
    b.disabled = busy;
    if (b.classList.contains("primary") || b.classList.contains("danger-fill"))
      b.textContent = busy ? "처리 중…" : b.dataset.label;
  }
  for (const el of $("diffs").querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    ".pick input, .pick button",
  ))
    el.disabled = busy;
  $("panel").setAttribute("aria-busy", String(busy));
  const a = document.activeElement as HTMLButtonElement | null;
  if (busy && !$("panel").hidden && a?.disabled && $("panel").contains(a)) $("panel-title").focus();
}

const usableEl = (el: HTMLElement | null) =>
  el !== null && el.isConnected && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;

// 다음에 누를 주 버튼 (바로 고치기 → 변경 커밋하기 → 팀원에게 보내기)
function nextPrimary(): HTMLElement | null {
  return [$("fix-all"), $("hero-commit"), $("hero-push")].find(usableEl) ?? null;
}

// 결과·안내만 보여 주는 작은 알림: 뒤 화면을 막지 않고, 포커스는 다음 할 일로 돌려준다.
// 닫기는 제목 줄 오른쪽(×)과 Esc (아래 행동 바를 두지 않아 목록을 덜 가린다)
function closeOnly(): void {
  panelButtons();
  $("panel").classList.add("toast");
  $("panel").setAttribute("role", "status");
  document.body.classList.add("has-toast");
  $("panel-close").hidden = false;
  setModal(false);
  locked = false;
  render();
  // 작업 중(busy)에 불리면 버튼이 다시 켜진 뒤(setBusy(false)) 포커스를 옮긴다
  focusNextLater = returnFocus ?? $("path");
  if (!busy) focusNext();
}

let focusNextLater: HTMLElement | null = null;
function focusNext(): void {
  const back = focusNextLater;
  focusNextLater = null;
  const next = nextPrimary();
  if (next) {
    next.focus({ preventScroll: true });
    next.closest(".card")?.scrollIntoView({ block: "nearest" });
  } else if (usableEl(back)) back?.focus();
  else $("path").focus(); // 다음에 누를 것이 없으면(모두 끝남) 보고서 제목으로
}

let panelOpenedAt = 0; // 창이 열린 시각 (열자마자 들어온 Ctrl+Enter를 무시하려고)

function closePanel(): void {
  stopElapsed();
  const wasToast = $("panel").classList.contains("toast");
  const at = document.activeElement as HTMLElement | null;
  const keep = wasToast && at && at !== document.body && !$("panel").contains(at) ? at : null;
  $("panel").hidden = true;
  document.body.classList.remove("has-toast");
  setModal(false);
  locked = false;
  render();
  // 누른 버튼(다시 그려졌으면 같은 이름표의 새 버튼)으로, 없으면 다음 주 버튼, 그것도 없으면 보고서 제목으로
  if (keep && usableEl(keep)) keep.focus();
  else if (usableEl(returnFocus)) returnFocus?.focus();
  else if (!focusKey(returnKey)) {
    const next = nextPrimary();
    if (next) next.focus();
    else {
      if (busy) pendingReturn = { el: returnFocus, key: returnKey };
      $("path").focus();
    }
  }
  returnFocus = null;
  returnKey = null;
}

// 확인 패널이 열린 동안에는 뒤 화면(사이드바·보고서·알림)을 통째로 비활성(inert)으로 만든다:
// 클릭도 Tab도 닿지 않는다
function setModal(on: boolean): void {
  $("scrim").hidden = !on;
  $("panel").setAttribute("aria-modal", String(on));
  for (const el of document.querySelectorAll<HTMLElement>(".side, #report, #update, #home"))
    el.inert = on;
}

// 모달 안에서 Tab이 돈다 (뒤 화면은 inert라 갈 곳이 없지만, 처음·끝에서 반대쪽으로 넘긴다)
function trapFocus(e: KeyboardEvent): void {
  if (e.key !== "Tab" || $("panel").hidden || $("scrim").hidden) return;
  const items = [
    ...$("panel").querySelectorAll<HTMLElement>(
      "button:not([disabled]):not([hidden]), input:not([disabled]), summary",
    ),
  ].filter((el) => el.offsetParent !== null);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const at = document.activeElement;
  const outside = !(at instanceof HTMLElement) || !items.includes(at);
  if (e.shiftKey && (at === first || outside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === last || outside)) {
    e.preventDefault();
    first.focus();
  }
}

// 커밋 안내("git add a b 후 커밋해야 …")에서 바로 실행할 명령을 만든다
function commitCommand(hint: string): string | null {
  const m = /^(git add .+?) 후 커밋/.exec(hint);
  return m?.[1] ? `${m[1]} && git commit -m "chore: Claude Code 팀 설정 추가"` : null;
}
const committedPaths = new Set<string>(); // 이번 실행에서 앱이 커밋한 폴더
const commitCmds = new Map<string, string>(); // 폴더별 마지막 고치기의 커밋 명령

function copyButton(text: string): HTMLButtonElement {
  const b = button(
    "명령 복사",
    () => {
      void navigator.clipboard.writeText(text).then(
        () => {
          b.textContent = "복사했습니다";
          window.setTimeout(() => (b.textContent = "명령 복사"), 1600);
        },
        () => (b.textContent = "복사하지 못했습니다"),
      );
    },
    "btn soft small",
  );
  return b;
}

// 앱에서 커밋하기: 커밋할 파일 확인 → 커밋 → 다시 점검. 앱이 만든 파일만, push는 하지 않는다
async function commitFlow(): Promise<void> {
  if (!current) return;
  rememberFocus();
  const path = current.path;
  const before = current.score;
  setBusy(true);
  try {
    const r = await api.commit(path, false);
    if (r.kind === "none") {
      panel("커밋할 것이 없습니다", r.reason);
      closeOnly();
      return;
    }
    if (r.kind !== "preview") return;
    locked = true;
    panel(
      "2단계: 커밋",
      `앱이 만든 파일 ${r.files.length}개를 커밋합니다\n이 PC의 git 기록에 남기는 단계입니다. 다음 단계에서 팀원에게 보냅니다.`,
      "",
      true,
    );
    $("panel-message").classList.add("lead");
    // 되돌릴 수 없는 단계라 경고와 커밋할 파일은 펼쳐 두고, 메시지·되돌리는 법만 개발자용으로 접는다
    $("diffs").replaceChildren(
      h(
        "p",
        { class: "msg warn safe" },
        "커밋한 뒤에는 앱의 되돌리기를 쓸 수 없습니다. 되돌리려면 git으로 직접 해야 합니다.",
      ),
      h("ul", { class: "outside" }, ...r.files.map((f) => h("li", {}, h("code", {}, f)))),
      ...[termsFold(`커밋 스테이징 ${$("panel-message").textContent ?? ""}`)].filter(
        (x) => x !== null,
      ),
      h(
        "details",
        { class: "manual" },
        h("summary", {}, "자세히 (개발자용)"),
        h("p", { class: "dev-line" }, `커밋 메시지: ${r.message}`),
        h(
          "p",
          { class: "dev-line" },
          "따로 스테이징해 둔 변경은 이 커밋에 넣지 않습니다. 커밋한 뒤 되돌리려면: git revert HEAD",
        ),
      ),
    );
    panelButtons(
      button(
        "커밋하기",
        () => {
          void (async () => {
            setBusy(true);
            try {
              await api.commit(path, true);
              commitCmds.delete(path);
              committedPaths.add(path);
              current = await api.diagnose(path);
              state = await api.getState();
              locked = false;
              panel(
                "커밋했습니다",
                scoreChange(before, current.score) +
                  (pushLeft(current) ? "\n다음: 3단계 ‘팀원에게 보내기’" : ""),
              );
              $("panel-message").classList.add("lead");
              $("panel-note").textContent = "커밋한 뒤에는 앱에서 되돌릴 수 없습니다.";
              closeOnly();
            } catch (e) {
              showError(e, () => void commitFlow(), "커밋하지 못했습니다");
            } finally {
              setBusy(false);
            }
          })();
        },
        "btn primary deliberate",
      ),
      button("취소", closePanel),
    );
  } catch (e) {
    showError(e, () => void commitFlow(), "커밋하지 못했습니다");
  } finally {
    setBusy(false);
  }
}

// 오류 알림: 문장이 해결법을 이미 말하면 그대로, 원인을 모르는 오류에만 일반 안내를 붙인다.
// retry가 있으면 같은 동작을 다시 부르는 [다시 시도]
function showError(e: unknown, retry?: () => void, title = "처리하지 못했습니다"): void {
  locked = false;
  // 제목이 이미 "…하지 못했습니다"라 본문 앞의 같은 말은 뺀다
  const full = ((e as Error).message ?? String(e)).replace(/^처리하지 못했습니다: /, "");
  // 형식: 쉬운 문장 [\n개발자: 해결 안내] [\n원문: git 출력]. 뒤의 둘은 개발자용으로 접는다
  const [head = full, raw] = full.split("\n원문: ");
  const [message = head, devHint] = head.split("\n개발자: ");
  panel(title, message, "error");
  if (raw || devHint)
    $("diffs").replaceChildren(
      h(
        "details",
        { class: "manual" },
        h("summary", {}, "자세히 (개발자용)"),
        devHint ? h("p", { class: "dev-line" }, devHint) : null,
        raw ? h("p", { class: "dev-line" }, "git 출력: ", h("code", {}, raw)) : null,
      ),
    );
  // 본문이 이미 담당자 안내를 하면(개발자·원문 형식) 짧게, [다시 시도]와 다른 방법은 말하지 않는다
  if (raw || devHint)
    $("panel-note").textContent =
      "계속되면 ‘리포트 저장’으로 결과를 남겨 팀 담당자에게 전해 주세요.";
  else if (/원인 모름|처리하지 못했습니다:/.test(full))
    $("panel-note").textContent =
      "‘다시 점검’을 누른 뒤 다시 시도하세요. 계속되면 ‘리포트 저장’으로 결과를 남겨 팀 담당자에게 전해 주세요.";
  closeOnly();
  if (retry)
    panelButtons(
      button(
        "다시 시도",
        () => {
          closePanel();
          retry();
        },
        "btn soft small",
      ),
    );
  $("panel").setAttribute("role", "alert");
  focusNextLater = null;
  render();
  ($("panel-btns").querySelector("button") ?? $("panel-close")).focus();
}

function diffPre(diff: string): HTMLElement {
  const pre = h("pre");
  for (const line of diff.split("\n")) {
    const cls = line.startsWith("+ ")
      ? "add"
      : line.startsWith("- ")
        ? "del"
        : line.startsWith("---") || line.startsWith("+++") || line.trim() === "…"
          ? "meta"
          : "";
    pre.append(h("span", { class: cls }, line));
  }
  return pre;
}

// 더하는 설정 줄을 쉬운 말로 (예: "Read(**/.env.*.local)" → ".env.○○.local 읽기 막기")
// .env 규칙은 읽기·고치기별로 한 줄로 묶는다 (예: ".env, .env.local 등 6가지 .env 파일 읽기 막기")
function ruleNotes(diff: string): string[] {
  const files = { Read: new Set<string>(), Edit: new Set<string>() };
  const other: string[] = [];
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+ ")) continue;
    const m = /"(Read|Edit)\(([^)]+)\)"/.exec(line);
    if (m?.[1] && m[2]) files[m[1] as "Read" | "Edit"].add(m[2].replace(/^(\*\*\/|\.\/)/, ""));
    else if (line.includes("disableBypassPermissionsMode"))
      other.push("묻지 않고 실행하는 모드(권한 우회 모드) 끄기");
    else if (line.includes("PreToolUse")) other.push("명령을 실행하기 전에 검사(훅)를 돌리기");
  }
  const envLine = (set: Set<string>, verb: string): string[] => {
    if (set.size === 0) return [];
    const plain = [...set].filter((x) => !x.includes("*"));
    const named = (plain.length > 0 ? plain : [...set]).slice(0, 2).join(", ");
    return [
      set.size > 2 ? `${named} 등 ${set.size}가지 .env 파일 ${verb} 막기` : `${named} ${verb} 막기`,
    ];
  };
  return [...envLine(files.Read, "읽기"), ...envLine(files.Edit, "고치기"), ...new Set(other)];
}

// 파일 하나: 경로·새 파일·줄 수 + 바뀌는 것(쉬운 말), 실제 바뀌는 코드는 개발자용으로 접는다
function fileBlock(p: Pick<FilePreview, "path" | "diff">, open: boolean, meta = ""): HTMLElement {
  const notes = ruleNotes(p.diff);
  const code = h(
    "details",
    { class: "file-code" },
    h("summary", {}, "바뀌는 코드 보기 (개발자용)"),
    diffPre(p.diff),
  );
  code.open = open;
  return h(
    "div",
    { class: "file" },
    h(
      "div",
      { class: "file-head" },
      h("span", { class: "file-path" }, p.path),
      meta ? h("span", { class: "file-meta" }, meta) : null,
    ),
    notes.length > 0 ? h("ul", { class: "file-rules" }, ...notes.map((n) => h("li", {}, n))) : null,
    code,
  );
}

// 되돌리기 안내: 혼자 쓰는 폴더는 커밋 단계가 없다
function undoNote(d: DiagnosisView | null): string {
  return d?.usage === "team"
    ? "커밋하기 전까지는 ‘마지막으로 고친 것 되돌리기’로 되돌릴 수 있습니다."
    : "언제든 ‘마지막으로 고친 것 되돌리기’로 되돌릴 수 있습니다.";
}

// 고치기 후보의 쉬운 이름 (할 일 줄의 "할 일:" 문장)
function plainFix(d: DiagnosisView, no: number, title: string): string {
  const t = buildTodos(d).find((x) => x.kind === "fix" && x.primary.fixNo === no);
  return t ? todoLine(t, d) : title;
}

// ---- Claude 진행 로그 (도구 이름을 사람 말로) ----

const TOOL_LABEL: Record<string, string> = {
  Read: "읽는 중",
  Glob: "파일 찾는 중",
  Grep: "내용 찾는 중",
  LS: "폴더 보는 중",
  Edit: "고치는 중",
  MultiEdit: "고치는 중",
  Write: "쓰는 중",
};
const HIDDEN_TOOLS = new Set(["ToolSearch", "TodoWrite"]);

function logLine(p: Progress): void {
  const log = $("log");
  log.hidden = false;
  let text = "";
  let cls = "";
  if (p.kind === "start") text = "Claude 시작";
  else if (p.kind === "text") text = p.text.trim().split("\n")[0] ?? "";
  else if (p.kind === "tool") {
    if (HIDDEN_TOOLS.has(p.name)) return;
    const what = p.detail ? `: ${relPath(p.detail)}` : "";
    text = `${TOOL_LABEL[p.name] ?? `${p.name} 사용`}${what}`;
  } else if (p.kind === "tool-error") {
    text = `허용 범위 밖이라 막음: ${(p.text.split("\n")[0] ?? "").slice(0, 120)}`;
    cls = "err";
  } else if (p.kind === "result")
    text = `끝 (${p.ok ? "성공" : "실패"}${p.costUsd !== undefined ? `, 사용량 약 $${p.costUsd.toFixed(2)}` : ""})`;
  if (!text) return;
  log.append(h("li", { class: cls }, text));
  log.scrollTop = log.scrollHeight;
}

function stopElapsed(): void {
  if (elapsedTimer !== undefined) window.clearInterval(elapsedTimer);
  elapsedTimer = undefined;
}

function startElapsed(el: HTMLElement): void {
  const t0 = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    el.textContent = `경과 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} / 10:00`;
  };
  tick();
  elapsedTimer = window.setInterval(tick, 1000);
}

// ---- 동작 ----

async function refreshState(): Promise<void> {
  state = await api.getState();
  render();
}

const baseline = new Map<string, number>(); // 이번 실행에서 폴더를 처음 열었을 때 점수 (전후 비교)
let noticeSame = false; // 알림이 "점수는 그대로"인지 (경고색을 쓰지 않음)
let notice = ""; // 점수가 바뀐 이유 (폴더 종류·사용 방식을 바꿨을 때)

async function load(path: string, kind?: Kind | "auto", usage?: Usage | "auto"): Promise<void> {
  const prev = current?.path === path ? current : null;
  const at = document.activeElement as HTMLElement | null;
  const back = at && at !== document.body ? { id: at.id, key: at.dataset.key ?? null } : null;
  let failed = false; // 실패하면 오류 패널에 포커스를 둔다
  loading = true;
  setBusy(true);
  try {
    current = await api.diagnose(path, kind, usage);
    if (!baseline.has(path)) baseline.set(path, current.score);
    const changed =
      kind !== undefined && prev && prev.kind !== current.kind
        ? "폴더 종류"
        : usage !== undefined && prev && prev.usage !== current.usage
          ? "사용 방식"
          : "";
    // 점수가 같아도 보는 항목은 달라질 수 있어 알리되, 같으면 경고색 없이 "그대로"라고 말한다
    noticeSame = prev !== null && prev.score === current.score;
    notice =
      changed && prev
        ? noticeSame
          ? `${changed}를 바꿔 보는 항목이 달라졌습니다. 점수는 그대로 ${current.score}점입니다`
          : `${changed}를 바꿔 보는 항목이 달라졌습니다: 점수 ${prev.score} → ${current.score}점`
        : "";
    state = await api.getState();
  } catch (e) {
    failed = true;
    showError(e, () => void load(path, kind, usage), "점검하지 못했습니다");
  } finally {
    loading = false;
    setBusy(false);
    if (!failed) restoreAfterLoad(back, prev !== null);
  }
}

// 다시 진단한 뒤 포커스 돌려주기: 같은 폴더면 누른 컨트롤로, 새 폴더면 보고서 제목으로
function restoreAfterLoad(back: { id: string; key: string | null } | null, sameFolder: boolean) {
  if (!sameFolder) {
    $("path").focus();
    return;
  }
  if (!back) return;
  if (back.id === "usage-solo" || back.id === "usage-team") {
    $(current?.usage === "solo" ? "usage-solo" : "usage-team").focus();
    return;
  }
  if (back.id === "kind-dev" || back.id === "kind-docs") {
    ($(current?.kind === "docs" ? "kind-docs" : "kind-dev") as HTMLInputElement).focus();
    return;
  }
  const el = back.id ? document.getElementById(back.id) : null;
  if (el && !(el as HTMLButtonElement).disabled && !el.hidden) el.focus();
  else if (!focusKey(back.key)) $("path").focus();
}

async function openFolder(recent?: string): Promise<void> {
  // 확인 패널·Claude 실행 중에는 다른 폴더로 넘어가지 않는다 (결과 확인을 건너뛰면 잠긴다)
  if (locked || busy || state?.running) return;
  try {
    const path = await api.pickFolder(recent);
    if (path !== null) {
      if (path !== current?.path) expanded.clear();
      if (!$("panel").hidden) closePanel();
      await load(path);
    }
  } catch (e) {
    showError(e);
  }
}

// 바로 고치기: 요약 → (여러 개면) 고를 항목 → 파일별 바뀔 내용 → 적용
async function fix(nos: number[]): Promise<void> {
  if (!current) return;
  rememberFocus();
  const path = current.path;
  const before = current.score;
  // 고칠 항목은 할 일 목록과 같은 순서로
  const order = buildTodos(current)
    .filter((t) => t.kind === "fix")
    .map((t) => t.primary.fixNo);
  const rank = (no: number) => (order.includes(no) ? order.indexOf(no) : order.length + no);
  const d0 = current;
  const all = current.fixes
    .filter((f) => nos.includes(f.no))
    .sort((a, b) => rank(a.no) - rank(b.no))
    .map((f) => ({ ...f, plain: plainFix(d0, f.no, f.title) }));
  let chosen = [...nos];
  locked = true;
  const applyBtn = button("적용", () => void apply(), "btn primary");
  const files = h("div", {});
  let seq = 0; // 체크를 빠르게 바꿀 때 늦게 온 미리 보기 응답은 버린다

  // 고를 항목: 체크를 바꾸면 패널 전체를 다시 그리지 않고 요약·파일만 바꾼다 (포커스·스크롤 유지)
  const picker = (): HTMLElement => {
    const boxes: HTMLInputElement[] = [];
    const toggleAll = h("button", { class: "linkish", type: "button" }, "모두 해제");
    const box = h("fieldset", { class: "pick" }, h("legend", {}, "고칠 항목 ", toggleAll));
    const sync = () => {
      chosen = all
        .filter((_, i) => boxes[i]?.checked)
        .map((f) => f.no)
        .sort((a, b) => a - b);
      toggleAll.textContent = chosen.length === all.length ? "모두 해제" : "모두 선택";
      void update().catch(showError);
    };
    toggleAll.addEventListener("click", () => {
      const on = chosen.length !== all.length;
      for (const b of boxes) b.checked = on;
      sync();
    });
    for (const item of all) {
      const cb = h("input", { type: "checkbox" });
      cb.checked = chosen.includes(item.no);
      cb.addEventListener("change", sync);
      boxes.push(cb);
      box.append(h("label", { class: "pick-item" }, cb, item.plain));
    }
    return box;
  };

  const update = async (): Promise<void> => {
    const m = $("panel-message");
    const mine = ++seq;
    applyBtn.disabled = true; // 새 미리 보기가 올 때까지는 적용하지 않는다
    applyBtn.textContent = applyBtn.dataset.label = "적용";
    if (chosen.length === 0) {
      m.className = "panel-message";
      m.textContent = "고칠 항목을 하나 이상 고르세요.";
      files.replaceChildren();
      return;
    }
    if (files.childElementCount > 0) {
      m.className = "panel-message";
      m.textContent = "바뀔 내용을 다시 계산하는 중…";
      files.classList.add("stale");
    }
    const r = await api.fix(path, chosen, false);
    if (mine !== seq || chosen.length === 0) return; // 그사이 체크가 또 바뀌었다
    if (r.kind !== "preview") return;
    files.classList.remove("stale");
    const newFiles = r.previews.filter((p) => p.isNew).length;
    // 첫 줄은 크게(한 문장 요약), 다음 줄은 세부. 고칠 수 있는 것을 전부 고를 때만 커밋 뒤 점수를 안다
    // (all은 이번에 연 항목뿐이라 한 건만 열면 all과 같아진다)
    const commitTo = chosen.length === current?.fixes.length ? current.committedScore : undefined;
    const afterCommit =
      commitTo ??
      (current?.committedScore !== undefined && current.weights
        ? Math.min(100, r.expectedScore + current.weights.fail)
        : undefined);
    m.className = "panel-message lead";
    m.textContent =
      `할 일 ${r.items.length}개를 고치면 ${before} → ${r.expectedScore}점` +
      `\n바뀌는 파일 ${r.previews.length}개` +
      (newFiles > 0 ? ` (새 파일 ${newFiles}개)` : "") +
      (afterCommit !== undefined
        ? `\n고친 뒤 커밋하면 ${afterCommit}점이 됩니다`
        : r.expectedScore < READY_SCORE
          ? `\n목표 ${READY_SCORE}점까지는 다른 할 일이 더 필요합니다`
          : "");
    files.replaceChildren(
      ...r.previews.map((p) =>
        fileBlock(
          p,
          // 바뀌는 코드는 접어 두고 쉬운 말 요약만 보인다 (원칙 4)
          false,
          [p.isNew ? "새 파일" : "수정", `${p.added}줄 추가`, p.note].filter(Boolean).join(" · "),
        ),
      ),
    );
    applyBtn.textContent = applyBtn.dataset.label = `파일 ${r.previews.length}개 적용`;
    applyBtn.disabled = false;
  };

  // 요약 카드에 단계(고치기→커밋→보내기)가 보일 때만 제목에 단계 이름을 붙인다
  const stepName = $("steps").hidden ? "" : "1단계: ";
  const title =
    all.length === 1 ? `${stepName}${all[0]?.plain ?? ""}` : `${stepName}바뀔 내용 확인`;
  const show = async (): Promise<void> => {
    panel(title);
    // 안심 문구는 맨 위에 (적용 버튼을 누르기 전에 보이게)
    const safe = h(
      "p",
      { class: "msg safe" },
      `적용하기 전 원본은 자동으로 백업됩니다. ${undoNote(d0)}`,
    );
    $("diffs").replaceChildren(safe, ...(all.length > 1 ? [picker()] : []), files);
    panelButtons(applyBtn, button("취소", closePanel));
    await update();
    $("diffs").querySelector<HTMLElement>(".pick legend button, .file-code summary")?.focus();
  };

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      const done = await api.fix(path, chosen, true);
      current = await api.diagnose(path);
      locked = false;
      if (done.kind === "applied") {
        const cmd = commitCommand(done.commitHint);
        if (cmd) commitCmds.set(path, cmd);
        const commitTo = current.committedScore;
        undoTo.set(path, before);
        panel(
          "적용했습니다",
          scoreChange(before, current.score) +
            (current.fixes.length > 0
              ? current.usage === "team"
                ? `\n다음: 남은 ${current.fixes.length}개를 고치거나, ‘변경 커밋하기’로 지금까지 고친 것을 커밋하세요`
                : `\n다음: 남은 ${current.fixes.length}개도 고칠 수 있습니다`
              : commitTo !== undefined
                ? `\n다음: ‘변경 커밋하기’ (커밋하면 ${commitTo}점)`
                : ""),
        );
        $("panel-message").classList.add("lead");
        const note = $("panel-note");
        note.textContent = `원본은 백업해 두었습니다. ${undoNote(current)}`;
        note.title = done.backupDir;
        closeOnly();
      }
      state = await api.getState();
    } catch (e) {
      showError(e, () => void fix(nos), "고치지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  setBusy(true);
  try {
    await show();
  } catch (e) {
    showError(e);
  } finally {
    setBusy(false);
  }
}

function claudeResult(r: ClaudeView, path: string, before: number): void {
  stopElapsed();
  // 결과를 확인(적용·버리기)하기 전에는 닫을 수 없다: 닫으면 다시 열 길 없이 실행 중 상태로 남는다
  $("panel-close").hidden = r.status === "ready";
  $("panel-note").textContent =
    r.status === "ready"
      ? "아직 원본이 백업돼 있습니다. ‘버리고 원래대로’를 누르면 원래 내용으로 돌립니다."
      : "대상 파일은 원래대로 돌렸습니다.";
  const titles: Record<string, string> = {
    ready: "Claude가 고친 내용 확인",
    unchanged: "바뀐 내용 없음",
    cancelled: "중단했습니다",
    timeout: "시간 초과로 멈췄습니다",
    outside: "반영하지 않았습니다",
    error: "Claude 실행 실패",
    busy: "이미 실행 중입니다",
    "too-large": "실행할 수 없습니다",
  };
  const bad = ["error", "outside", "timeout", "too-large"].includes(r.status);
  $("panel-title").textContent = titles[r.status] ?? "Claude";
  const m = $("panel-message");
  m.textContent = r.message;
  m.className = `panel-message ${bad ? "error" : ""}`;
  if (r.outside.length > 0) {
    const names = { added: "새로 생김", modified: "바뀜", deleted: "지워짐" };
    $("outside").hidden = false;
    $("outside").replaceChildren(
      ...r.outside.map((o) => h("li", {}, `${o.path} — ${names[o.change]}`)),
    );
  }
  $("diffs").replaceChildren(...r.diffs.map((d) => fileBlock(d, true)));
  const finish = (action: "keep" | "discard") => () => {
    void (async () => {
      try {
        const done = await api.claude({ type: action });
        locked = false;
        current = await api.diagnose(path);
        state = await api.getState();
        panel(
          action === "keep" ? "적용했습니다" : "취소했습니다",
          action === "keep"
            ? scoreChange(before, current.score) +
                (current.usage === "team" && current.kind === "dev"
                  ? "\n바뀐 파일을 커밋해야 팀원 모두에게 적용됩니다"
                  : "")
            : done.message,
        );
        if (action === "keep") {
          $("panel-message").classList.add("lead");
          $("panel-note").textContent = undoNote(current);
        }
        closeOnly();
        render();
        window.setTimeout(() => void continueQueue(), 0);
      } catch (e) {
        claudeQueue = [];
        showError(e);
      }
    })();
  };
  if (r.status === "ready")
    panelButtons(
      button("적용", finish("keep"), "btn primary"),
      button("버리고 원래대로", finish("discard")),
    );
  else closeOnly();
}

// Claude로 반영: 실행 전 확인(대상·시간·사용량·안전) → 실행(경과 시간·중단) → 결과 확인
function confirmClaude(f: FindingView): void {
  if (!current || !f.claudeTask) return;
  rememberFocus();
  const label = f.claudeLabel ?? "Claude로 반영";
  locked = true;
  panel(
    `${label}: 실행 전 확인`,
    `Claude가 ${f.claudeTargets?.join(", ") ?? "대상 파일"}만 고칩니다\n이 폴더를 읽고 대상 파일만 고치며, 바뀐 내용을 보여 드린 뒤 적용합니다.`,
    "",
    true,
  );
  $("panel-message").classList.add("lead");
  const fact = (k: string, v: string) => h("li", {}, h("b", {}, k), " ", v);
  $("diffs").replaceChildren(
    h(
      "ul",
      { class: "facts" },
      fact(
        "시간·사용량",
        "보통 1분, 약 $0.1~0.3어치 (구독 요금제는 한도에서 차감, API 키는 청구. 이 앱이 받는 돈은 없음)",
      ),
      fact(
        "안전",
        "명령 실행과 .env 읽기는 막혀 있고, 원본을 백업합니다. 바뀐 내용을 보고 ‘적용’해야 반영됩니다.",
      ),
      fact(
        "점수",
        `적용하면 ${current.score} → ${Math.min(100, current.score + (f.severity === "fail" ? current.weights.fail : current.weights.warn))}점`,
      ),
    ),
  );
  panelButtons(
    button(
      "Claude 실행 (사용량 듦)",
      () => {
        claudeQueue = [];
        queueTotal = 1;
        queueDone = 0;
        void runClaude(f, label);
      },
      "btn primary deliberate",
    ),
    button("취소", closePanel),
  );
  render();
}

// Claude로 모두 처리: 하나씩 실행하고, 결과마다 적용·버리기를 고른 뒤 다음으로 넘어간다
let claudeQueue: { task: string; label: string }[] = [];
let queueTotal = 1;
let queueDone = 0;

function confirmClaudeAll(list: FindingView[]): void {
  if (!current || list.length === 0) return;
  rememberFocus();
  locked = true;
  const n = list.length;
  panel(
    `Claude로 ${n}개 처리: 실행 전 확인`,
    `Claude가 ${[...new Set(list.flatMap((f) => f.claudeTargets ?? []))].join(", ") || "대상 파일"}만 고칩니다\n하나씩 실행하고, 결과마다 적용할지 고른 뒤 다음으로 넘어갑니다.`,
    "",
    true,
  );
  $("panel-message").classList.add("lead");
  const gain = list.reduce(
    (s, f) => s + (f.severity === "fail" ? current!.weights.fail : current!.weights.warn),
    0,
  );
  const fact = (k: string, v: string) => h("li", {}, h("b", {}, k), " ", v);
  $("diffs").replaceChildren(
    h(
      "ul",
      { class: "facts" },
      fact(
        "시간·사용량",
        `${n}건, 건당 보통 1분, 모두 약 $${(0.1 * n).toFixed(1)}~${(0.3 * n).toFixed(1)}어치 (구독 요금제는 한도에서 차감, API 키는 청구)`,
      ),
      fact(
        "안전",
        "명령 실행과 .env 읽기는 막혀 있고, 건마다 원본을 백업합니다. 중단하거나 오류가 나면 남은 건은 하지 않습니다.",
      ),
      fact("점수", `모두 적용하면 ${current.score} → ${Math.min(100, current.score + gain)}점`),
    ),
  );
  panelButtons(
    button(
      `Claude ${n}건 실행 (사용량 듦)`,
      () => {
        const [first, ...rest] = list;
        if (!first?.claudeTask) return;
        claudeQueue = rest
          .filter((f) => f.claudeTask)
          .map((f) => ({ task: f.claudeTask as string, label: f.claudeLabel ?? "Claude로 반영" }));
        queueTotal = n;
        queueDone = 0;
        void runClaude(first, first.claudeLabel ?? "Claude로 반영");
      },
      "btn primary deliberate",
    ),
    button("취소", closePanel),
  );
  render();
}

// 다음 작업: 앞 작업 뒤 다시 진단한 결과에서 아직 남은 같은 작업을 찾는다 (이미 풀렸으면 건너뜀)
async function continueQueue(): Promise<void> {
  while (claudeQueue.length > 0 && current) {
    const next = claudeQueue.shift();
    queueDone++;
    const f = current.areas
      .flatMap((a) => a.findings)
      .find((x) => x.claudeTask === next?.task && x.severity !== "ok");
    if (f && next) {
      await runClaude(f, next.label);
      return;
    }
  }
}

async function runClaude(f: FindingView, label: string): Promise<void> {
  if (!current || !f.claudeTask) return;
  const path = current.path;
  const before = current.score;
  panel(
    `${label}: 실행 중${queueTotal > 1 ? ` (${queueDone + 1}/${queueTotal})` : ""}`,
    "Claude가 폴더를 읽고 대상 파일만 고치고 있습니다.",
  );
  $("log").hidden = false;
  panelButtons(
    button(
      "중단",
      () => void api.claude({ type: "stop" }).catch(showError),
      "btn danger allow-busy",
    ),
  );
  const elapsed = h("span", { class: "elapsed" });
  $("panel-note").replaceChildren(
    elapsed,
    ". 실행 전 대상 파일을 백업했습니다. 중단하면 원래대로 되돌립니다.",
  );
  startElapsed(elapsed);
  $("panel-close").hidden = true; // 실행 중에는 중단 버튼을 가리지 않는다
  busy = true;
  render();
  try {
    const r = await api.claude({ type: "start", path, taskId: f.claudeTask });
    state = await api.getState();
    locked = r.status === "ready";
    claudeResult(r, path, before);
    if (r.status !== "ready") {
      current = await api.diagnose(path);
      // 바뀐 게 없으면 다음 작업으로, 중단·오류면 남은 작업은 하지 않는다
      if (r.status === "unchanged") window.setTimeout(() => void continueQueue(), 0);
      else if (claudeQueue.length > 0) {
        $("panel-note").textContent +=
          ` 남은 Claude 작업 ${claudeQueue.length}개는 실행하지 않았습니다.`;
        claudeQueue = [];
      }
    }
  } catch (e) {
    claudeQueue = [];
    showError(e);
  } finally {
    stopElapsed();
    setBusy(false);
  }
}

const UNDO_STATUS: Record<string, string> = {
  restored: "원래 내용으로 복원",
  deleted: "새로 만든 파일 삭제",
  skipped: "이미 원래 내용이라 그대로 둠",
  failed: "되돌리지 못함",
  untouched: "손대지 않음",
};

// "오늘 12:07"처럼 짧게 (오늘이 아니면 날짜도)
function whenText(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? `오늘 ${time}`
    : `${d.toLocaleDateString("ko-KR")} ${time}`;
}

const undoTo = new Map<string, number>(); // 폴더별 마지막 고치기 전 점수 (되돌리기 확인에 보여 줌)

async function undo(): Promise<void> {
  if (!current) return;
  rememberFocus();
  const path = current.path;
  const before = current.score;
  setBusy(true);
  try {
    const r: UndoView = await api.undo(path, false);
    if (r.kind === "none") {
      panel("되돌리기", "이 폴더에서 되돌릴 반영 기록이 없습니다");
      closeOnly();
      return;
    }
    if (r.kind !== "preview") return;
    const changed = r.items.filter((i) => i.modifiedSince && !i.alreadyOriginal);
    locked = true;
    const removed = r.items.filter((i) => !i.existedBefore && !i.alreadyOriginal).length;
    const restored = r.items.filter((i) => i.existedBefore && !i.alreadyOriginal).length;
    panel(
      "마지막으로 고친 것 되돌리기",
      [
        removed ? `새로 만든 파일 ${removed}개 지우기` : "",
        restored ? `파일 ${restored}개 원래대로` : "",
      ]
        .filter(Boolean)
        .join(", ") +
        `\n${whenText(r.createdAt)}에 고친 것을 되돌립니다. ` +
        (undoTo.has(path)
          ? `점수 ${before} → ${undoTo.get(path)}점으로 돌아갑니다.`
          : "점수도 고치기 전으로 돌아갑니다.") +
        (changed.length > 0
          ? " 반영 뒤 다시 바뀐 파일이 있어, 되돌리면 그 변경도 사라집니다."
          : ""),
      changed.length > 0 ? "error" : "",
      true,
    );
    $("panel-message").classList.add("lead");
    $("outside").hidden = false;
    $("outside").replaceChildren(
      ...r.items.map((i) =>
        h(
          "li",
          {},
          `${i.path} — ${
            i.alreadyOriginal
              ? "이미 원래 내용"
              : i.existedBefore
                ? "원래 내용으로 복원"
                : "새로 만든 파일이라 삭제"
          }${i.modifiedSince && !i.alreadyOriginal ? " (반영 뒤 바뀜)" : ""}`,
        ),
      ),
    );
    panelButtons(
      button(
        "되돌리기",
        () => {
          void (async () => {
            setBusy(true);
            try {
              const done = await api.undo(path, true);
              current = await api.diagnose(path);
              state = await api.getState(); // 최근 폴더 점수도 새로
              locked = false;
              if (done.kind === "done") {
                panel(
                  done.ok ? "되돌렸습니다" : "일부를 되돌리지 못했습니다",
                  scoreChange(before, current.score),
                  done.ok ? "" : "error",
                );
                $("panel-message").classList.add("lead");
                $("outside").hidden = false;
                $("outside").replaceChildren(
                  ...done.statuses.map((s) =>
                    h(
                      "li",
                      {},
                      `${s.path} — ${UNDO_STATUS[s.status] ?? s.status}${s.error ? ` (${s.error})` : ""}`,
                    ),
                  ),
                );
                closeOnly();
              }
            } catch (e) {
              showError(e);
            } finally {
              setBusy(false);
            }
          })();
        },
        "btn danger-fill deliberate",
      ),
      button("취소", closePanel),
    );
  } catch (e) {
    showError(e);
  } finally {
    setBusy(false);
  }
}

async function saveReport(): Promise<void> {
  if (!current) return;
  try {
    const file = await api.saveReport(current.path);
    if (file === null) return;
    panel("리포트 저장", `저장했습니다: ${file}`);
    closeOnly();
  } catch (e) {
    showError(e);
  }
}

// ---- 그리기 ----

const SEVERITY = { fail: "위험", warn: "주의", ok: "통과" };
const KIND_NAME = { dev: "개발 저장소", docs: "문서·기획 폴더" };
const USAGE_NAME = { solo: "혼자", team: "팀" };

// 할 일 한 줄: 같은 고치기로 풀리는 진단 항목은 한 줄로 묶는다
interface Todo {
  key: string;
  kind: "fix" | "claude" | "manual";
  primary: FindingView; // 고치기 버튼을 가진 항목
  top: FindingView; // 제목에 쓸 항목 (가장 위험한 것)
  items: FindingView[]; // 이 할 일로 해결되는 진단 항목 (primary 포함)
  severity: "fail" | "warn";
  penalty: number; // 이 할 일의 진단 항목 감점 합
  gain: number; // 고치면 오르는 점수 (커밋 전)
  gainNote?: string; // 커밋하면 더 오르는 점수
  sharedNote?: string; // 다른 할 일의 항목도 함께 풀려 더 오를 때
}

function head(message: string): string {
  return message.split(" / ")[0] ?? message;
}

// 묶인 항목 중 제목에 쓸 것: 위험이 먼저, 같으면 사람이 가장 걱정할 위험부터
const RISK_ORDER = [
  "settings/env-read-deny",
  "settings/env-edit-deny",
  "hooks/present",
  "settings/bypass",
  "settings/missing",
];
function topOf(items: FindingView[]): FindingView | undefined {
  const rank = (f: FindingView) =>
    (f.severity === "fail" ? 0 : 100) +
    (RISK_ORDER.includes(f.id) ? RISK_ORDER.indexOf(f.id) : RISK_ORDER.length);
  return [...items].sort((a, b) => rank(a) - rank(b))[0];
}

// 할 일 제목: 무엇이 위험한가 (쉬운 말이 없으면 진단 문장)
function riskTitle(f: FindingView): string {
  return f.detail?.risk ?? head(f.message);
}

function buildTodos(d: DiagnosisView): Todo[] {
  const problems = d.areas
    .flatMap((a) => a.findings)
    .filter((f) => f.severity !== "ok" && !f.notApplicable);
  const owners = new Set(problems.filter((f) => f.fixNo !== undefined).map((f) => f.fixNo));
  const todos: Todo[] = [];
  for (const f of problems) {
    if (f.fixNo === undefined && f.fixSharedWith !== undefined && owners.has(f.fixSharedWith))
      continue; // 다른 줄의 고치기에 함께 들어간다
    if (f.needsCommit) continue; // 커밋은 요약 카드의 단계가 맡는다
    const no = f.fixNo;
    const items =
      no !== undefined ? problems.filter((x) => x.fixNo === no || x.fixSharedWith === no) : [f];
    const severity = items.some((x) => x.severity === "fail") ? "fail" : "warn";
    const penalty = items.reduce(
      (s, x) => s + (x.severity === "fail" ? d.weights.fail : d.weights.warn),
      0,
    );
    // settings.json을 새로 만드는 줄: 커밋하기 전까지 "커밋 여부"가 위험으로 남으므로 그만큼 덜 오른다
    const creates =
      d.committedScore !== undefined && items.some((x) => x.id === "settings/missing");
    const own = penalty - (creates ? d.weights.fail : 0);
    // 바로 고치기는 미리 보기와 같은 계산(이 고치기 하나만 적용)으로 오르는 점수를 쓴다
    const engine = no !== undefined ? d.fixes.find((x) => x.no === no)?.gain : undefined;
    todos.push({
      key: no !== undefined ? `fix:${no}` : `item:${f.id}:${todos.length}`,
      kind: no !== undefined ? "fix" : f.claudeTask ? "claude" : "manual",
      primary: f,
      top: topOf(items) ?? f,
      items,
      severity,
      penalty,
      gain: engine ?? own,
      gainNote: creates ? `나머지 ${d.weights.fail}점은 커밋하면 오릅니다` : undefined,
      sharedNote:
        engine !== undefined && engine > own
          ? "설정 파일을 새로 만들면서 다른 할 일의 항목도 함께 풀려 그만큼 더 오릅니다. 다른 할 일과 함께 고치면 겹치는 점수는 한 번만 오릅니다."
          : undefined,
    });
  }
  const rank = (t: Todo) => (t.severity === "fail" ? 0 : 1);
  return todos.sort((a, b) => rank(a) - rank(b) || b.penalty - a.penalty);
}

// "할 일: …" 한 줄
function todoLine(t: Todo, d: DiagnosisView): string {
  const ids = new Set(t.items.map((x) => x.id));
  if (t.kind === "manual") return t.top.judgment ?? t.top.detail?.todo ?? "직접 판단이 필요합니다";
  if (ids.has("settings/env-read-deny") && ids.has("settings/env-edit-deny"))
    return "Claude가 .env를 읽지도 고치지도 못하게 막습니다";
  if (t.top.detail?.todo) return t.top.detail.todo;
  if (t.kind === "claude")
    return `Claude가 ${t.top.claudeTargets?.join(", ") ?? "기준이 정한 파일"}을 씁니다`;
  return d.fixes.find((x) => x.no === t.primary.fixNo)?.title ?? "";
}

function svgIcon(d: string, cls = "ico"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", cls);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

// 위험·주의·통과를 색에만 맡기지 않고 글자로 말한다
function sevBadge(sev: "fail" | "warn" | "ok" | "na", label: string): HTMLElement {
  return h("span", { class: `badge ${sev}` }, label);
}

function claudeButton(f: FindingView): HTMLElement[] {
  const blocked = busy || locked || (state?.running ?? false);
  const label = f.claudeLabel ?? "Claude로 반영";
  const b = keyed(
    button(label, () => confirmClaude(f), "btn sm soft"),
    `claude:${f.id}`,
  );
  b.setAttribute("aria-label", `${label}: ${riskTitle(f)}`);
  const why = claudeBlocked();
  b.disabled = blocked || why !== null;
  // 꺼진 이유는 마우스를 올리지 않아도 보이게 버튼 아래에 적는다
  return why && !blocked ? [b, h("span", { class: "why-off" }, why)] : [b];
}

function toggleLink(id: string, openLabel: string, closedLabel: string): HTMLElement {
  const open = expanded.has(id);
  const t = keyed(
    h("button", { class: "linkish", type: "button" }, open ? openLabel : closedLabel),
    id,
  );
  t.setAttribute("aria-expanded", String(open));
  t.addEventListener("click", () => {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
  });
  return t;
}

// 용어 풀이: 사용법·용어 창에 전부, 확인창에는 본문에 나온 말만
const GLOSSARY: { term: string; test: RegExp; text: string }[] = [
  {
    term: ".env",
    test: /\.env/,
    text: "API 키·비밀번호 같은 비밀 값을 담는 설정 파일입니다. Claude가 읽으면 대화 기록에 그대로 남습니다.",
  },
  {
    term: "settings.json",
    test: /settings\.json/,
    text: "Claude Code의 보호 규칙을 담는 설정 파일입니다. 저장소의 .claude/settings.json은 팀 공용, settings.local.json은 내 PC 전용, ~/.claude/settings.json은 내 PC의 모든 폴더에 적용됩니다.",
  },
  {
    term: "권한 우회 모드",
    test: /권한 우회|bypass/i,
    text: "Claude가 묻지 않고 모든 파일 수정·명령 실행을 하는 모드입니다(--dangerously-skip-permissions). 설정 파일로 켜지 못하게 막을 수 있습니다.",
  },
  {
    term: "검사(훅)",
    test: /훅|hook|검사/i,
    text: "Claude가 명령을 실행하기 직전에 자동으로 도는 작은 스크립트입니다. 강제 푸시처럼 되돌리기 어려운 명령이면 멈춥니다.",
  },
  {
    term: "CLAUDE.md",
    test: /CLAUDE\.md/,
    text: "Claude Code가 대화를 시작할 때마다 읽는 작업 지침 파일입니다. 빌드·테스트 방법과 규칙을 적습니다.",
  },
  {
    term: "플러그인",
    test: /플러그인|plugin/i,
    text: "팀 공용 스킬(계획·검증 등)과 검사를 묶어 나눠 쓰는 Claude Code 확장입니다.",
  },
  {
    term: "PR (검토 요청)",
    test: /\bPR\b|검토 요청/,
    text: "바로 올리지 않고, 팀원이 바뀐 내용을 보고 승인한 뒤 합치는 방식입니다.",
  },
  {
    term: "스테이징",
    test: /스테이징|staging/i,
    text: "커밋에 넣으려고 git에 미리 골라 둔 변경입니다. 앱은 직접 만든 파일만 커밋하고, 따로 골라 둔 변경은 건드리지 않습니다.",
  },
  {
    term: "커밋, push",
    test: /커밋|commit|push/i,
    text: "커밋은 바뀐 파일을 git 기록에 남기는 것, push(팀원에게 보내기)는 그 기록을 원격 저장소로 올려 팀원이 받게 하는 것입니다.",
  },
  {
    term: "DESIGN.md",
    test: /DESIGN\.md/,
    text: "화면의 색·글꼴·간격 기준을 적은 문서입니다. Claude가 화면을 고칠 때 이 기준을 따릅니다.",
  },
];

// 확인창 본문에 나온 낯선 말 풀이 (접어 둔다)
function termsFold(text: string): HTMLElement | null {
  const items = GLOSSARY.filter((g) => g.test.test(text));
  return items.length > 0
    ? h("details", { class: "manual" }, h("summary", {}, "용어 풀이"), glossaryList(items))
    : null;
}

function glossaryList(items: typeof GLOSSARY): HTMLElement {
  return h(
    "dl",
    { class: "glossary" },
    ...items.flatMap((g) => [h("dt", {}, g.term), h("dd", {}, g.text)]),
  );
}

// 설정 파일 만들기와 .env 규칙은 "고치면" 문장 하나가 함께 말한다
const SETTINGS_GROUP = ["settings/missing", "settings/env-read-deny", "settings/env-edit-deny"];

// 펼친 본문의 한 줄 (왼쪽 이름, 오른쪽 한두 문장)
function bodyRow(label: string, ...content: Child[]): HTMLElement {
  return h("div", {}, h("dt", {}, label), h("dd", {}, ...content));
}

function renderTodo(t: Todo, d: DiagnosisView): HTMLElement {
  const f = t.primary;
  const top = t.top;
  const id = `todo:${t.key}`;
  const open = expanded.has(id);
  const blocked = busy || locked || (state?.running ?? false);
  const title = riskTitle(top);
  const toggle = () => {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
  };

  const bodyId = `body-${t.key.replace(/[^a-z0-9-]/gi, "-")}`;
  const headBtn = keyed(
    h(
      "button",
      { class: "todo-head", type: "button" },
      sevBadge(t.severity, SEVERITY[t.severity]),
      h(
        "span",
        { class: "todo-text" },
        h("span", { class: "todo-title" }, title),
        h("span", { class: "todo-sub" }, `할 일: ${todoLine(t, d)}`),
      ),
      h("span", { class: "sr-only" }, `, 고치면 +${t.gain}점`),
    ),
    id,
  );
  headBtn.setAttribute("aria-expanded", String(open));
  headBtn.setAttribute("aria-controls", bodyId);
  headBtn.addEventListener("click", toggle);

  const pts = h("span", { class: "todo-pts" }, `+${t.gain}점`);
  pts.setAttribute("aria-hidden", "true");
  const act = h("div", { class: "todo-act" });
  if (t.kind === "fix" && f.fixNo !== undefined) {
    const no = f.fixNo;
    const b = keyed(
      button("바뀔 내용 보기", () => void fix([no]), "btn sm"),
      `fix:${f.id}`,
    );
    b.setAttribute("aria-label", `바뀔 내용 보기: ${title}`);
    b.disabled = blocked;
    act.append(b);
  } else if (t.kind === "claude") act.append(...claudeButton(f));
  // 펼치기 표시: 키보드·읽기 프로그램은 머리 버튼으로 다룬다
  const chev = h("span", { class: "icon-btn chev-btn" }, svgIcon("M6 9l6 6 6-6", "ico chev"));
  chev.setAttribute("aria-hidden", "true");
  chev.addEventListener("click", toggle);

  const row = h("div", { class: "todo-row" }, headBtn, pts, act, chev);
  const box = h("div", { class: `todo${open ? " open" : ""}` }, row);
  if (!open) return box;

  const det = top.detail;
  const body = h("dl", { class: "todo-body" });
  body.id = bodyId;
  // 왜 위험한가요: 쉬운 설명. 직접 해야 하는 일은 무엇을 고칠지(예: 허용된 명령 목록)도 보여 준다
  const found = t.kind === "manual" && det?.risk ? `점검 결과: ${top.message}` : null;
  body.append(
    bodyRow(
      "왜 위험한가요",
      h("p", {}, det?.why ?? top.message),
      found ? h("p", { class: "also" }, found) : null,
    ),
  );
  // 고치면: 바뀌는 것 + (설정 파일·.env 규칙 밖에서) 함께 해결되는 것 + 커밋해야 오르는 점수
  const ids = new Set(t.items.map((x) => x.id));
  const others = t.items.filter((x) => x !== top && !SETTINGS_GROUP.includes(x.id)).map(riskTitle);
  const read = ids.has("settings/env-read-deny");
  const edit = ids.has("settings/env-edit-deny");
  const envFix =
    read || edit
      ? `Claude 설정 파일(.claude/settings.json)${ids.has("settings/missing") ? "을 새로 만들어" : "에"} .env ${read && edit ? "읽기와 고치기를" : read ? "읽기를" : "고치기를"} 막는 규칙을 넣습니다. 다른 설정은 그대로입니다.`
      : null;
  const fixText = envFix ?? det?.fix ?? (t.kind === "manual" ? null : todoLine(t, d));
  if (fixText || others.length > 0 || t.sharedNote)
    body.append(
      bodyRow(
        "고치면",
        fixText ? h("p", {}, fixText) : null,
        others.length > 0 ? h("p", { class: "also" }, `함께 해결: ${others.join(", ")}`) : null,
        t.gainNote
          ? h(
              "p",
              { class: "also" },
              `지금 고치면 +${t.gain}점입니다. ${t.gainNote} (요약 카드의 2단계).`,
            )
          : null,
        t.sharedNote ? h("p", { class: "also" }, `+${t.gain}점: ${t.sharedNote}`) : null,
      ),
    );
  if (det?.limit) body.append(bodyRow("못 막는 것", h("p", {}, det.limit)));
  if (f.example) {
    const exId = `${f.id}:example`;
    body.append(
      bodyRow(
        "예시",
        toggleLink(exId, "예시 접기", "예시 보기"),
        expanded.has(exId) ? h("div", { class: "example" }, h("pre", {}, f.example)) : null,
      ),
    );
  }
  // 본문 아래: 바로 고치기와 Claude로 반영이 둘 다 되면 Claude 버튼, 그리고 이 항목의 통과 기준
  const acts = h("div", { class: "todo-acts" });
  if (t.kind === "fix" && f.claudeTask) acts.append(...claudeButton(f));
  if (d.criteria.some((c) => c.id === top.id)) {
    const crit = keyed(
      button("점검 기준에서 이 항목 보기", () => showCriterion(top.id), "text-btn"),
      `crit:${t.key}`,
    );
    acts.append(crit);
  }
  if (acts.childElementCount > 0) body.append(acts);
  box.append(body);
  return box;
}

function passedItem(f: FindingView): HTMLElement {
  const na = f.notApplicable === true;
  return h(
    "div",
    { class: "passed-item" },
    sevBadge(na ? "na" : "ok", na ? "해당 없음" : "통과"),
    h("span", {}, head(f.message)),
  );
}
// Claude 버튼을 끄는 이유 (없으면 null)
function claudeBlocked(): string | null {
  const c = state?.claude;
  if (!c?.ok) return "Claude Code를 설치하면 쓸 수 있습니다";
  if (c.loggedIn === false) return "Claude Code에 로그인하면 쓸 수 있습니다";
  return null;
}

function claudeStatusLine(): HTMLElement {
  const c = state?.claude;
  if (!c) return h("span", {}, "Claude Code 확인 중");
  if (!c.ok)
    return h("span", { class: "dot-line bad" }, `Claude Code 없음 (${c.error ?? "찾지 못함"})`);
  // "2.1.83 (Claude Code)"처럼 이름이 붙어 오면 뗀다
  const version = `Claude Code ${(c.version ?? "").replace(/\s*\(Claude Code\)/, "")}`.trim();
  if (c.loggedIn === false)
    return h(
      "span",
      { class: "dot-line bad" },
      `${version} · 로그인 필요 (터미널에서 claude 실행 후 /login)`,
    );
  if (c.loggedIn)
    return h(
      "span",
      {
        class: "dot-line good",
        title: c.account ? `${c.account}${c.plan ? ` · ${c.plan}` : ""}` : "",
      },
      `${version} · 로그인됨`,
    );
  return h("span", { class: "dot-line good" }, `${version} (로그인 확인 불가 버전)`);
}

function scoreTone(score: number | undefined): string {
  if (score === undefined) return "";
  return score >= READY_SCORE ? " good" : score < 50 ? " bad" : "";
}

// 폴더가 있는 위치 (목록에서 이름 아래 한 줄)
function parentOf(path: string): string {
  const name = folderName(path);
  return path.slice(0, path.length - name.length).replace(/[\\/]+$/, "") || path;
}

function recentMeta(r: AppState["recent"][number]): string {
  const usage = r.usage ?? r.seen;
  return [usage ? USAGE_NAME[usage] : "", parentOf(r.path)].filter(Boolean).join(" · ");
}

function renderRecent(): void {
  if (!state) return;
  const blocked = busy || locked || (state.running ?? false);
  $("recent").replaceChildren(
    ...(state.recent.length === 0
      ? [h("li", { class: "none" }, "아직 없음")]
      : state.recent.map((r) => {
          const name = folderName(r.path);
          const isCurrent = current?.path === r.path;
          const unsent = isCurrent && current !== null && pushLeft(current) !== undefined;
          const score = unsent ? "보내기 전" : r.score !== undefined ? `${r.score}점` : "";
          const b = keyed(
            h(
              "button",
              {
                type: "button",
                title: r.path,
                class: `recent-item${isCurrent ? " current" : ""}`,
              },
              h(
                "span",
                { class: "recent-text" },
                h("span", { class: "name" }, name),
                h("span", { class: "where" }, recentMeta(r)),
              ),
              h("span", { class: `pts${unsent ? " warn" : scoreTone(r.score)}` }, score),
            ),
            `recent:${r.path}`,
          );
          if (isCurrent) b.setAttribute("aria-current", "true");
          b.setAttribute("aria-label", `${name} ${score}, ${recentMeta(r)}`);
          b.addEventListener("click", () => void openFolder(r.path));
          const x = keyed(
            h(
              "button",
              {
                class: "icon-btn recent-x",
                type: "button",
                title: "목록에서 빼기",
              },
              svgIcon("M6 6l12 12M18 6L6 18"),
            ),
            `forget:${r.path}`,
          );
          x.setAttribute("aria-label", `목록에서 빼기: ${name}`);
          x.disabled = blocked;
          x.addEventListener("click", () => void forget(r.path));
          return h("li", {}, b, x);
        })),
  );
}

// 최근 폴더 목록에서만 뺀다 (폴더와 백업은 그대로)
async function forget(path: string): Promise<void> {
  try {
    state = await api.forgetFolder(path);
    render();
    ($("recent").querySelector<HTMLElement>("button") ?? $("open")).focus();
  } catch (e) {
    showError(e);
  }
}

// 사용법 3단계: 처음 화면과 사용법·용어 창에 같은 내용
const GUIDE = [
  ["폴더 열기", "점검할 저장소의 맨 위 폴더(.git이 있는 폴더)를 고릅니다."],
  ["위험 확인", "Claude가 할 수 있는 위험한 일을 위험한 것부터 할 일로 보여 드립니다."],
  ["미리 보고 고치기", "바뀔 내용을 먼저 보고 고칩니다. 고친 뒤에도 되돌릴 수 있습니다."],
];
for (const list of document.querySelectorAll(".guide"))
  list.replaceChildren(
    ...GUIDE.map(([title, text], i) =>
      h(
        "li",
        {},
        h("span", { class: "guide-no" }, String(i + 1)),
        h("b", {}, title ?? ""),
        h("span", {}, text ?? ""),
      ),
    ),
  );

function renderHome(): void {
  if (!state) return;
  const si = state.standardInfo;
  $("home-standard").textContent =
    `적용 기준: ${si.name} ${si.version}${si.file ? "" : " (기본 내장)"}`;
  $("home-recent-box").hidden = state.recent.length === 0;
  const blocked = busy || locked || state.running;
  $("home-recent").replaceChildren(
    ...state.recent.map((r) => {
      const name = folderName(r.path);
      const open = keyed(
        button("열기", () => void openFolder(r.path), "btn sm"),
        `home:${r.path}`,
      );
      open.setAttribute("aria-label", `${name} 열기`);
      open.disabled = blocked;
      return h(
        "li",
        { class: "home-row" },
        h("div", { title: r.path }, h("b", {}, name), h("small", {}, recentMeta(r))),
        h(
          "span",
          { class: `pts${scoreTone(r.score)}` },
          r.score !== undefined ? `${r.score}점` : "",
        ),
        open,
      );
    }),
  );
}

// 처음 화면으로: 확인창·Claude 실행 중에는 가지 않는다
function goHome(): void {
  if (locked || busy || state?.running) return;
  if (!$("panel").hidden) closePanel();
  current = null;
  notice = "";
  expanded.clear();
  render();
  $("home-open").focus();
}

const TABS = [
  ["results", "tab-results", "view-results"],
  ["recommend", "tab-recommend", "view-recommend"],
  ["criteria", "tab-criteria", "view-criteria"],
] as const;
let tab: (typeof TABS)[number][0] = "results";
let showPassed = (() => {
  try {
    return localStorage.getItem("showPassed") === "1";
  } catch {
    return false;
  }
})();

function setTab(t: typeof tab, focus = false): void {
  tab = t;
  // 탭을 바꾸면 남아 있던 결과 알림은 닫는다
  if ($("panel").classList.contains("toast")) {
    $("panel").hidden = true;
    document.body.classList.remove("has-toast");
  }
  render();
  if (focus) $(`tab-${t}`).focus();
}

function renderTabs(): void {
  for (const [t, id, view] of TABS) {
    const on = tab === t;
    const b = $(id);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    $(view).hidden = !on;
  }
}

// 고치면 무엇이 달라지는지 한 문장으로 (바로 고칠 수 있는 것 기준)
function fixEffect(todos: Todo[]): string | null {
  const ids = new Set(
    todos.filter((t) => t.kind === "fix").flatMap((t) => t.items.map((x) => x.id)),
  );
  const env = ids.has("settings/env-read-deny") || ids.has("settings/env-edit-deny");
  const hook = ids.has("hooks/present");
  if (env && hook) return "Claude가 .env를 열지 못하고, 위험한 명령은 실행 전에 멈춥니다";
  if (env) return "Claude가 .env를 열지 못합니다";
  if (hook) return "위험한 명령은 실행 전에 멈춥니다";
  if (ids.has("settings/bypass")) return "묻지 않고 실행하는 모드를 켤 수 없습니다";
  return null;
}

function renderHero(d: DiagnosisView, todos: Todo[]): void {
  const team = d.usage === "team";
  const ready = d.score >= READY_SCORE;
  const n = d.fixes.length;
  const fixTo =
    d.expectedScore !== undefined && d.expectedScore > d.score ? d.expectedScore : undefined;
  const commitTo = team ? d.committedScore : undefined;
  // 앱이 한 커밋이 아직 원격에 없으면 끝났다고 하지 않는다 (팀 저장소만)
  const unpushed = pushLeft(d) !== undefined;
  const noRemote = pushLeft(d)?.noRemote === true;
  const selfPush = team && selfPushPaths.has(d.path) && d.pushPending !== undefined;
  const { pending, cmd } = commitInfo(d);
  const rest = todos.length - todos.filter((t) => t.kind === "fix").length;
  const base = baseline.get(d.path); // 이번에 열었을 때 점수 (전후 비교)
  const rose = base !== undefined && base < d.score;
  const finished = n === 0 && rest === 0 && !pending && !unpushed;

  let headline: string;
  const effect = fixEffect(todos);
  if (n > 0)
    headline = effect
      ? `${n}개를 고치면 ${effect}`
      : `${n}개를 고치면 ${commitTo ?? fixTo ?? d.score}점이 됩니다`;
  else if (team && pending) headline = "고친 설정을 커밋하고 팀원에게 보내면 모두에게 적용됩니다";
  else if (unpushed)
    headline = noRemote
      ? "원격 저장소를 연결해야 팀원에게 보낼 수 있습니다"
      : "팀원에게 보내면 같은 설정이 모두에게 적용됩니다";
  else if (rest > 0)
    headline = ready
      ? `목표 ${READY_SCORE}점을 넘었습니다. 남은 할 일 ${rest}개로 더 올릴 수 있습니다`
      : `남은 할 일 ${rest}개는 Claude로 쓰거나 직접 해야 합니다`;
  else
    headline = rose
      ? `${base}점에서 ${d.score}점이 됐습니다. 모든 항목을 통과했습니다`
      : "모든 항목을 통과했습니다";
  $("headline").textContent = headline;

  $("score").textContent = String(d.score);
  $("score").parentElement?.classList.toggle("stale", loading);
  // 위험·주의 개수는 할 일 목록 머리가 할 일 단위로 말한다 (여기서는 점수만)
  $("breakdown").textContent = loading
    ? "점검 중…"
    : [
        base !== undefined && base !== d.score ? `열었을 때 ${base}점` : "",
        fixTo !== undefined ? `고치면 ${fixTo}점` : "",
        commitTo !== undefined ? `커밋하면 ${commitTo}점` : "",
        `목표 ${READY_SCORE}점`,
      ]
        .filter(Boolean)
        .join(" · ");

  const pct = (v: number | undefined) => `${Math.max(0, Math.min(100, v ?? 0))}%`;
  $("bar-now").style.width = pct(d.score);
  $("bar-fix").style.width = pct(fixTo ?? d.score);
  $("bar-commit").style.width = pct(commitTo ?? fixTo ?? d.score);

  const off = busy || locked || (state?.running ?? false);
  const fixAll = $("fix-all") as HTMLButtonElement;
  fixAll.hidden = n === 0;
  fixAll.textContent = n === 1 ? "바뀔 내용 보고 고치기" : `${n}개 한 번에 고치기`;
  fixAll.setAttribute(
    "aria-label",
    `바로 고칠 수 있는 ${n}개 고치기${fixTo !== undefined ? `, 약 ${fixTo}점` : ""}`,
  );
  fixAll.disabled = off;
  // 바로 고칠 게 없고 커밋만 남았으면 주 버튼은 커밋
  const commitBtn = $("hero-commit") as HTMLButtonElement;
  commitBtn.hidden = !team || !pending || cmd === null;
  commitBtn.className = `btn lg${n > 0 ? "" : " solid"}`;
  commitBtn.disabled = off;
  const pushBtn = $("hero-push") as HTMLButtonElement;
  pushBtn.hidden = !unpushed || pending || noRemote;
  pushBtn.className = `btn lg${n > 0 ? "" : " solid"}`;
  pushBtn.disabled = off;
  // 원격 저장소가 없으면 앱이 보낼 수 없으니, 직접 보내기로 하고 끝낼 수 있게 한다
  const selfBtn = $("hero-self-push") as HTMLButtonElement;
  selfBtn.hidden = !unpushed || pending || !noRemote;
  selfBtn.disabled = off;
  // 모두 끝나면 결과를 남기는 리포트 저장이 주 버튼
  const reportBtn = $("hero-report") as HTMLButtonElement;
  reportBtn.hidden = !finished;
  reportBtn.disabled = off;

  const msg =
    n > 0
      ? team
        ? "팀 저장소라 고친 뒤 커밋하고 팀원에게 보내야 끝납니다. 고치기 전에 바뀔 내용을 먼저 보여 드리고, 커밋하기 전까지는 되돌릴 수 있습니다."
        : "혼자 쓰는 저장소라 고치기만 하면 끝납니다. 고치기 전에 바뀔 내용을 먼저 보여 드리고, 고친 뒤에도 되돌릴 수 있습니다."
      : team && pending
        ? `앱이 만든 파일만 커밋합니다. 커밋하면 ${commitTo ?? d.score + d.weights.fail}점이 됩니다.`
        : unpushed
          ? noRemote
            ? "이 저장소에는 원격 저장소(remote)가 연결돼 있지 않습니다. 원격을 연결한 뒤 ‘다시 점검’을 누르면 여기서 보낼 수 있습니다. 직접 보낼 거라면 ‘보내기는 직접 할게요’를 누르세요."
            : "보내기 전에 보낼 커밋을 한 번 더 보여 드립니다."
          : finished
            ? (team && pushedPaths.has(d.path)
                ? "팀 저장소에 올렸습니다. 팀원이 최신 내용을 받으면(pull) 같은 설정이 적용됩니다. "
                : selfPush
                  ? "커밋은 끝났습니다. 팀원에게는 직접 보내 주세요. "
                  : "더 고칠 것이 없습니다. ") + "결과를 남겨 두려면 리포트를 저장하세요."
            : "";
  $("hero-msg").hidden = msg === "";
  $("hero-msg-text").textContent = msg;
}

// 커밋: 점수가 80을 넘는 마지막 걸음이라 할 일 목록에 한 줄로 둔다 (명령 복사)
// 커밋할 게 남았는지(이미 만든 settings.json이 커밋 전)와 복사할 명령
function commitInfo(d: DiagnosisView): { pending: boolean; cmd: string | null } {
  const pending = d.areas.flatMap((a) => a.findings).some((f) => f.needsCommit);
  const cmd =
    commitCmds.get(d.path) ??
    (pending
      ? `git add .claude/settings.json && git commit -m "chore: Claude Code 팀 설정 추가"`
      : null);
  return { pending, cmd };
}

// 팀에 적용하기: 고치기 → 커밋 → 팀원에게 보내기를 요약 카드에 단계로 보여 준다 (git 저장소에서 커밋이 필요한 폴더만).
// 실행은 단계에 맞는 주 버튼 하나가 맡고, 터미널 명령은 "자세히 (개발자용)" 안에 둔다
const pushedPaths = new Set<string>(); // 이번 실행에서 앱이 보낸(push) 폴더
const selfPushPaths = new Set<string>(); // 원격 저장소가 없어 보내기는 직접 하기로 한 폴더 (이번 실행)

// 앱이 보내기를 맡을 커밋이 남았는가 (팀 저장소이고, 직접 보내기로 하지 않았을 때)
function pushLeft(d: DiagnosisView): DiagnosisView["pushPending"] {
  return d.usage === "team" && !selfPushPaths.has(d.path) ? d.pushPending : undefined;
}

function renderSteps(d: DiagnosisView): void {
  const { pending, cmd } = commitInfo(d);
  const push = pushLeft(d);
  const self = selfPushPaths.has(d.path) && d.pushPending !== undefined;
  const n = d.fixes.length;
  const claudeLeft = buildTodos(d).filter((t) => t.kind === "claude").length;
  const committed = committedPaths.has(d.path);
  const pushed = (pushedPaths.has(d.path) || self) && !push && !pending;
  // 혼자 쓰는 저장소는 고치면 끝이라 단계를 보이지 않는다
  const show =
    d.usage === "team" &&
    (pending || push !== undefined || committed || d.committedScore !== undefined);
  const box = $("steps");
  box.hidden = !show;
  if (!show) {
    box.replaceChildren();
    return;
  }
  type StepState = "done" | "now" | "next";
  const fixState: StepState = n > 0 ? "now" : "done";
  const commitState: StepState = pending
    ? n > 0
      ? "next"
      : "now"
    : push || committed || pushed
      ? "done"
      : "next";
  const pushState: StepState = pushed ? "done" : push && !pending && n === 0 ? "now" : "next";
  const label = { done: "끝남", now: "지금", next: "다음" };
  const step = (no: number, title: string, sub: string, s: StepState) =>
    h(
      "li",
      { class: `step ${s}` },
      h("span", { class: "step-no" }, s === "done" ? icon("ok") : String(no)),
      h(
        "span",
        { class: "step-text" },
        h("span", { class: "step-title" }, title),
        h("span", { class: "step-sub" }, sub),
      ),
      h("span", { class: "sr-only" }, ` (${label[s]})`),
    );
  const list = h(
    "ol",
    { class: "step-list" },
    step(
      1,
      "고치기",
      n > 0
        ? `${n}개 남음`
        : claudeLeft > 0
          ? `바로 고칠 것은 끝남, Claude 할 일 ${claudeLeft}개 남음`
          : "설정 파일을 고쳤습니다",
      fixState,
    ),
    step(
      2,
      "커밋",
      commitState === "done"
        ? "git 기록에 남겼습니다"
        : `이 PC의 git 기록에 남깁니다 (+${d.weights.fail}점)`,
      commitState,
    ),
    step(
      3,
      "팀원에게 보내기",
      pushState === "done"
        ? self
          ? "직접 보내기로 했습니다"
          : "팀 저장소에 올렸습니다"
        : push?.noRemote
          ? "원격 저장소를 먼저 연결해야 합니다"
          : "팀 저장소에 올려 팀원이 받게 합니다",
      pushState,
    ),
  );
  // 개발자용: 실제 git 명령 (복사해서 직접 해도 된다)
  const cmds: HTMLElement[] = [];
  if (pending && cmd)
    cmds.push(h("div", { class: "cmd-row" }, h("code", {}, cmd), copyButton(cmd)));
  if (push?.noRemote && !pending) {
    const p = `git remote add origin <저장소 주소> && git push -u origin ${push.branch}`;
    cmds.push(
      h("p", { class: "dev-line" }, "원격 저장소가 없습니다. 저장소 주소를 연결한 뒤 보내세요"),
      h("div", { class: "cmd-row" }, h("code", {}, p), copyButton(p)),
    );
  } else if (push && !pending) {
    const p = push.target ? "git push" : `git push -u origin ${push.branch}`;
    cmds.push(
      h(
        "p",
        { class: "dev-line" },
        `${push.branch} → 팀 저장소(${push.target ?? "origin, 새 브랜치"})`,
      ),
      h("div", { class: "cmd-row" }, h("code", {}, p), copyButton(p)),
    );
  }
  if ((committed || push) && !pushed)
    cmds.push(h("p", { class: "dev-line" }, "커밋한 뒤 되돌리려면: git revert HEAD"));
  const dev =
    cmds.length > 0
      ? h("details", { class: "manual" }, h("summary", {}, "자세히 (개발자용)"), ...cmds)
      : null;
  box.replaceChildren(list, ...(dev ? [dev] : []));
}

// 보낼 커밋 요약: 앱이 만든 커밋과 그 밖의 커밋을 나눠 말한다
function pushSummary(commits: { mine: boolean }[], ahead: number | null): string {
  const n = ahead ?? commits.length;
  const mine = commits.filter((c) => c.mine).length;
  if (n === 0 || mine === n) return "앱이 커밋한 변경을 팀 저장소에 올립니다";
  return `앱이 커밋한 변경과 다른 커밋 ${n - mine}개를 함께 올립니다`;
}

// 팀원에게 보내기: 어디로 보낼지 확인 → push → 다시 점검
async function pushFlow(): Promise<void> {
  if (!current) return;
  rememberFocus();
  const path = current.path;
  setBusy(true);
  try {
    const r = await api.push(path, false);
    if (r.kind === "none") {
      panel(r.reason.startsWith("이미") ? "이미 보냈습니다" : "아직 보낼 수 없습니다", r.reason);
      closeOnly();
      current = await api.diagnose(path);
      return;
    }
    if (r.kind !== "preview") return;
    locked = true;
    panel(
      "3단계: 팀원에게 보내기",
      `${pushSummary(r.commits, r.ahead)}\n` +
        "팀이 PR(검토 요청)로 올린다면 보내지 말고 취소하세요. 모르면 팀 담당자에게 먼저 물어보세요. 보낸 뒤에는 앱에서 되돌릴 수 없습니다.",
      "",
      true,
    );
    $("panel-message").classList.add("lead");
    // 브랜치·대상·커밋 목록은 개발자용으로 접어 둔다 (다른 커밋이 섞이면 첫 줄이 이미 말한다)
    $("diffs").replaceChildren(
      ...[termsFold(`push ${$("panel-message").textContent ?? ""}`)].filter((x) => x !== null),
      h(
        "details",
        { class: "manual" },
        h("summary", {}, "자세히 (개발자용)"),
        h(
          "p",
          { class: "dev-line" },
          `${r.branch} → ${r.target}` + (r.newBranch ? " (팀 저장소에 새 브랜치를 만듭니다)" : ""),
        ),
        h(
          "ul",
          { class: "outside" },
          ...r.commits.map((c) =>
            h(
              "li",
              {},
              h("code", {}, c.sha),
              ` ${c.subject}`,
              c.mine ? h("span", { class: "tag accent" }, "앱이 만든 커밋") : null,
            ),
          ),
        ),
      ),
    );
    $("panel-note").textContent = "로그인이 필요하면 git 로그인 창이 뜰 수 있습니다.";
    if (/^(main|master)$/.test(r.branch)) $("panel-message").classList.add("caution");
    panelButtons(
      button(
        "팀원에게 보내기",
        () => {
          void (async () => {
            setBusy(true);
            try {
              await api.push(path, true);
              pushedPaths.add(path);
              current = await api.diagnose(path);
              state = await api.getState();
              locked = false;
              panel(
                "보냈습니다",
                "팀 저장소에 올렸습니다\n팀원이 최신 내용을 받으면 모두에게 같은 설정이 적용됩니다",
              );
              $("panel-message").classList.add("lead");
              closeOnly();
            } catch (e) {
              showError(e, () => void pushFlow(), "보내지 못했습니다");
            } finally {
              setBusy(false);
            }
          })();
        },
        "btn primary deliberate",
      ),
      button("취소", closePanel),
    );
  } catch (e) {
    showError(e, () => void pushFlow(), "보내지 못했습니다");
  } finally {
    setBusy(false);
  }
}

function renderResults(d: DiagnosisView): void {
  const todos = buildTodos(d);
  const total = todos.length;
  renderHero(d, todos);
  renderSteps(d);
  const team = d.usage === "team";
  $("todo-title").textContent =
    total > 0
      ? `할 일 ${total}개`
      : team && commitInfo(d).pending
        ? "남은 단계: 커밋"
        : pushLeft(d)
          ? "남은 단계: 팀원에게 보내기"
          : "할 일이 없습니다";
  const failTodos = todos.filter((t) => t.severity === "fail").length;
  $("todo-hint").textContent = [
    failTodos ? `위험 ${failTodos}개` : "",
    total - failTodos ? `주의 ${total - failTodos}개` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("todo-hint").hidden = total === 0;

  const active = document.activeElement as HTMLElement | null;
  const activeKey = $("todos").contains(active) ? (active?.dataset.key ?? null) : null;
  const groups: { kind: Todo["kind"]; label: string }[] = [
    { kind: "fix", label: "바로 고칠 수 있습니다" },
    {
      kind: "claude",
      label: "Claude가 써 줍니다 (건당 약 1분, 사용량 약 $0.1~0.3)",
    },
    { kind: "manual", label: "직접 해야 합니다" },
  ];
  // 묶음이 하나뿐이면 묶음 이름 없이 목록만
  const kinds = new Set(todos.map((t) => t.kind));
  const out: HTMLElement[] = [];
  for (const g of groups) {
    const items = todos.filter((t) => t.kind === g.kind);
    if (items.length === 0) continue;
    if (kinds.size > 1 || g.kind !== "fix") {
      let label: HTMLElement = h("h3", { class: "group-label" }, g.label);
      // Claude 작업이 둘 이상이면 한 번에 처리하는 버튼 (제목 옆)
      if (g.kind === "claude" && items.length > 1) {
        const all = keyed(
          button(
            `Claude로 모두 처리 (${items.length}개)`,
            () => confirmClaudeAll(items.map((t) => t.primary)),
            "btn sm soft",
          ),
          "claude:all",
        );
        all.disabled = busy || locked || (state?.running ?? false) || claudeBlocked() !== null;
        label = h("div", { class: "group-head" }, label, all);
      }
      out.push(label);
    }
    out.push(...items.map((t) => renderTodo(t, d)));
  }
  $("todos").replaceChildren(...out);
  if (activeKey && !$("todos").contains(document.activeElement)) focusKey(activeKey);

  const all = d.areas.flatMap((a) => a.findings);
  const passed = all.filter((f) => f.severity === "ok" || f.notApplicable);
  const ok = passed.filter((f) => !f.notApplicable).length;
  const na = passed.length - ok;
  const toggle = $("passed-toggle");
  ($("passed-line") as HTMLElement).hidden = passed.length === 0;
  toggle.setAttribute("aria-expanded", String(showPassed));
  toggle.classList.toggle("open", showPassed);
  $("passed-label").textContent = showPassed
    ? "통과한 점검 항목 접기"
    : `통과한 점검 항목 ${ok}개 보기${na > 0 ? `, 해당 없음 ${na}개` : ""}`;
  $("passed").hidden = !showPassed;
  $("passed").replaceChildren(...passed.map(passedItem));
}
// 위험·주의를 색에만 맡기지 않고 글자로도 구분한다
const CRIT_STATUS = {
  ok: "통과",
  warn: "안 됨 (주의)",
  fail: "안 됨 (위험)",
  na: "해당 없음",
  pending: "확인 전",
};

// ---- 추천 세팅: 묶음을 누르면 기존 미리 보기 → 적용 흐름으로 간다 (새 쓰기 경로 없음) ----

const BUNDLES: {
  key: string;
  title: string;
  advice: string;
  teamOnly?: boolean;
  match: (id: string, team: boolean) => boolean;
}[] = [
  {
    key: "protect",
    title: "기본 보호",
    advice:
      "Claude가 .env(API 키·비밀번호)를 읽거나 고치지 못하게 막고, 강제 푸시나 rm -rf 같은 명령은 실행 전에 멈추게 합니다. 어떤 저장소든 가장 먼저 넣기를 권합니다.",
    // 혼자 쓰는 폴더는 팀 공유 묶음이 없으니 권한 우회 모드 막기도 기본 보호에 넣는다
    match: (id, team) =>
      [
        "settings/missing",
        "settings/env-read-deny",
        "settings/env-edit-deny",
        "hooks/present",
      ].includes(id) ||
      (!team && id === "settings/bypass"),
  },
  {
    key: "work",
    title: "작업 방식",
    advice:
      "Claude가 대화마다 읽는 작업 지침(CLAUDE.md)에 빌드·검증 명령을 적어 둡니다. 그러면 Claude가 고친 뒤 테스트를 돌려 스스로 확인합니다.",
    match: (id) => id.startsWith("claude-md") || id.startsWith("file/"),
  },
  {
    key: "team",
    title: "팀 공유",
    teamOnly: true,
    advice:
      "팀원 누구도 묻지 않고 실행하는 모드를 켜지 못하게 막고, 설정 파일을 커밋해 팀원 모두에게 같은 보호를 적용합니다.",
    match: (id) => ["settings/bypass", "settings/committed"].includes(id),
  },
];

function renderBundles(d: DiagnosisView): void {
  const team = d.usage === "team";
  const off = busy || locked || (state?.running ?? false);
  const findings = d.areas.flatMap((a) => a.findings).filter((f) => !f.notApplicable);
  const { pending } = commitInfo(d);
  const allTodos = buildTodos(d);
  const cards: HTMLElement[] = [];
  const done: string[] = [];
  let first = true; // 남은 묶음 중 맨 위만 주 버튼
  const taken = new Set<string>(); // 할 일은 맞는 묶음 중 첫 묶음 하나에만 넣는다
  for (const b of BUNDLES) {
    if (b.teamOnly && !team) continue;
    // 남은 것은 점검 결과와 같은 "할 일" 단위로 센다 (같은 고치기로 풀리는 항목은 하나)
    const todos = allTodos.filter(
      (t) => !taken.has(t.key) && t.items.some((x) => b.match(x.id, team)),
    );
    for (const t of todos) taken.add(t.key);
    const steps: string[] = [];
    if (b.teamOnly && pending) steps.push("설정 파일을 커밋해 팀원에게 보냅니다");
    else if (b.teamOnly && pushLeft(d))
      steps.push(
        pushLeft(d)?.noRemote
          ? "원격 저장소를 연결한 뒤 커밋한 설정을 팀원에게 보냅니다"
          : "커밋한 설정을 팀원에게 보냅니다",
      );
    const okItems = findings.filter((f) => b.match(f.id, team) && f.severity === "ok");
    if (todos.length === 0 && steps.length === 0) {
      if (okItems.length > 0) done.push(b.title);
      continue;
    }
    const nos = todos.flatMap((t) =>
      t.kind === "fix" && t.primary.fixNo !== undefined ? [t.primary.fixNo] : [],
    );
    const claude = todos.filter((t) => t.kind === "claude").map((t) => t.primary);
    const acts: HTMLElement[] = [];
    const cls = (primary: boolean) => `btn${primary ? " solid" : ""}`;
    if (nos.length > 0) {
      const fixBtn = keyed(
        button("바뀔 내용 보고 고치기", () => void fix(nos), cls(first)),
        `bundle:${b.key}`,
      );
      fixBtn.setAttribute("aria-label", `${b.title}: 바뀔 내용 보고 고치기`);
      fixBtn.disabled = off;
      acts.push(fixBtn);
    }
    if (claude.length === 1 && claude[0]) acts.push(...claudeButton(claude[0]));
    else if (claude.length > 1) {
      const all = keyed(
        button(`Claude로 ${claude.length}개 쓰기`, () => confirmClaudeAll(claude), "btn soft"),
        `bundle-claude:${b.key}`,
      );
      all.disabled = off || claudeBlocked() !== null;
      acts.push(all);
    }
    // 팀 공유: 고칠 것이 없고 커밋·보내기만 남았으면 그 단계 버튼
    if (b.teamOnly && nos.length === 0 && (pending || (pushLeft(d) && !pushLeft(d)?.noRemote))) {
      const step = pending
        ? button("변경 커밋하기", () => void commitFlow(), cls(first))
        : button("팀원에게 보내기", () => void pushFlow(), cls(first));
      step.disabled = off;
      acts.push(step);
    }
    first = false;
    // 남은 할 일 → 남은 단계(커밋·보내기) → 이미 된 것 순서
    const line = (badge: HTMLElement, text: string) => h("li", {}, badge, h("span", {}, text));
    const lines = [
      ...todos.map((t) => line(sevBadge(t.severity, SEVERITY[t.severity]), todoLine(t, d))),
      ...steps.map((s) => line(sevBadge("na", "다음"), s)),
      ...okItems.map((f) =>
        line(
          sevBadge("ok", "됨"),
          // 커밋 항목의 할 일 문장은 보내기까지 말하므로, 된 것은 커밋까지만 말한다
          f.id === "settings/committed"
            ? "설정 파일을 커밋했습니다"
            : (f.detail?.todo ?? head(f.message)),
        ),
      ),
    ];
    const count = [
      todos.length > 0 ? `할 일 ${todos.length}개` : "",
      steps.length > 0 ? (pending ? "커밋 남음" : "보내기 남음") : "",
    ]
      .filter(Boolean)
      .join(", ");
    cards.push(
      h(
        "section",
        { class: "card bundle" },
        h("div", { class: "sec-h" }, h("h2", {}, b.title), h("p", {}, count)),
        h("p", { class: "bundle-advice" }, b.advice),
        h("ul", { class: "bundle-items" }, ...lines),
        acts.length > 0 ? h("div", { class: "row-btns" }, ...acts) : null,
      ),
    );
  }
  // 자동으로 고치지 않는 항목: 직접 하라는 조언
  const risky = findings.find((f) => f.id === "settings/risky-allow" && f.severity !== "ok");
  if (risky)
    cards.push(
      h(
        "section",
        { class: "card bundle" },
        h("div", { class: "sec-h" }, h("h2", {}, "직접 확인할 것")),
        h("p", { class: "bundle-advice" }, risky.detail?.why ?? risky.message),
        h("p", { class: "bundle-advice" }, `점검 결과: ${risky.message}`),
      ),
    );
  // 모두 들어 있으면 소개 문장과 "이미 들어 있는 묶음" 줄 대신 한 문장으로 말한다
  const allDone = cards.length === 0;
  if (allDone)
    cards.push(
      h(
        "section",
        { class: "card" },
        h(
          "p",
          { class: "bundle-advice" },
          done.length > 0
            ? `추천하는 세팅이 모두 들어 있습니다: ${done.join(", ")}`
            : "추천하는 세팅이 모두 들어 있습니다.",
        ),
      ),
    );
  $("bundles").replaceChildren(...cards);
  $("rec-intro").hidden = allDone;
  $("bundles-done").hidden = allDone || done.length === 0;
  $("bundles-done").textContent = `이미 들어 있는 묶음: ${done.join(", ")}`;
}

const critId = (id: string) => `crit-${id.replace(/[^a-z0-9-]/gi, "-")}`;

// 할 일에서 [점검 기준에서 이 항목 보기]: 기준 탭으로 옮겨 그 줄에 포커스
function showCriterion(id: string): void {
  setTab("criteria");
  const row = document.getElementById(critId(id));
  if (!row) return;
  row.tabIndex = -1;
  row.scrollIntoView({ block: "center" });
  row.focus({ preventScroll: true });
}

function renderCriteria(d: DiagnosisView): void {
  const si = state?.standardInfo;
  $("standard").textContent = si ? `${si.name} ` : d.standardName;
  $("standard").append(h("span", { class: "std-ver" }, si?.version ?? ""));
  $("std-desc").textContent =
    d.standardSource === "shared"
      ? "지금 이 기준으로 점검합니다. 앱의 기본 점검에 사내 기준 파일이 정한 항목을 더했습니다. 더한 항목에는 '사내' 표시가 있습니다."
      : "지금 앱에 들어 있는 기본 기준으로 점검합니다. 팀 기준 파일(standard.json)을 고르면 필수 섹션·필수 파일·사내 플러그인을 더 볼 수 있습니다.";
  $("std-path").textContent = si?.path ?? "기본 내장";
  $("std-path").title = si?.path ?? "";
  $("reset-standard").hidden = !si?.file;
  $("w-fail").textContent = `−${d.weights.fail}점`;
  $("w-warn").textContent = `−${d.weights.warn}점`;

  const c = d.criteria;
  $("crit-title").textContent = `점검 항목 ${c.length}개`;
  const count = (s: string[]) => c.filter((x) => s.includes(x.status)).length;
  const sum = [
    [`통과 ${count(["ok"])}`, "good"],
    [`위험 ${count(["fail"])}`, "bad"],
    [`주의 ${count(["warn"])}`, "warn"],
    [`확인 전 ${count(["pending"])}`, ""],
    [`해당 없음 ${count(["na"])}`, ""],
  ].filter(([t]) => !String(t).endsWith(" 0"));
  $("crit-sum").replaceChildren(
    "이 폴더: ",
    ...sum.flatMap(([t, cls], i) => [i > 0 ? " · " : "", h("b", { class: cls }, t)]),
  );

  const out: HTMLElement[] = [];
  let group = "";
  for (const x of c) {
    if (x.group !== group) {
      group = x.group;
      out.push(h("h3", { class: "crit-group" }, group));
    }
    const tone =
      x.status === "ok" ? "good" : x.status === "fail" || x.status === "warn" ? x.status : "muted";
    out.push(
      h(
        "div",
        { class: "crit-row", id: critId(x.id) },
        h(
          "div",
          { class: "crit-main" },
          h(
            "div",
            { class: "crit-title" },
            x.title,
            x.company ? h("span", { class: "tag accent" }, "사내") : null,
          ),
          h("div", { class: "crit-rule" }, x.rule),
        ),
        h(
          "div",
          { class: "crit-pen" },
          // 열 머리는 화면용이라, 읽어 주는 프로그램에는 칸마다 열 이름을 붙인다
          h("span", { class: "sr-only" }, "안 지키면 "),
          h("b", { class: x.penalty.includes("위험") ? "fail" : "warn" }, x.penalty),
          x.penaltyNote ? h("span", {}, x.penaltyNote) : null,
        ),
        h(
          "div",
          { class: `crit-status ${tone}` },
          h("span", { class: "sr-only" }, "이 폴더 "),
          h("b", {}, CRIT_STATUS[x.status]),
          x.note ? h("span", {}, x.note) : null,
        ),
      ),
    );
  }
  $("criteria").replaceChildren(...out);
}

function render(): void {
  if (state) {
    renderRecent();
    const si = state.standardInfo;
    $("open-guide").hidden = !si.guideUrl;
    const se = $("standard-error");
    se.hidden = !state.standardError;
    se.textContent = state.standardError ? `기본 기준으로 점검합니다: ${state.standardError}` : "";
    $("claude-status").replaceChildren(claudeStatusLine());
    const u = state.update;
    $("update").hidden = !u || dismissedUpdate === u.latest;
    $("update-text").textContent = u
      ? `새 버전 ${u.latest}이 있습니다 (지금 ${u.current}).${u.note ? ` ${u.note}` : ""}`
      : "";
    $("update-open").hidden = !u?.downloadUrl;
  }

  const running = busy || (state?.running ?? false);
  const blocked = running || locked;
  for (const id of [
    "brand",
    "open",
    "home-open",
    "home-pick-standard",
    "pick-standard",
    "reset-standard",
    "claude-recheck",
  ])
    ($(id) as HTMLButtonElement).disabled = blocked;

  const dev = $("kind-dev") as HTMLInputElement;
  const docs = $("kind-docs") as HTMLInputElement;
  dev.disabled = docs.disabled = blocked || current === null;
  // 다시 진단하는 동안에는 방금 고른 값을 그대로 둔다 (끝나면 결과 값으로)
  if (!busy) {
    dev.checked = current?.kind === "dev";
    docs.checked = current?.kind === "docs";
  }
  // 직접 고른 종류여도 자동 판별 결과와 이유를 계속 보여 준다 (점수가 종류에 따라 달라지므로)
  const kn = $("kind-note");
  kn.textContent = !current
    ? "폴더를 열면 자동으로 판별합니다"
    : current.kindAuto
      ? `자동 판별: ${current.kindReason}`
      : `직접 지정: ${KIND_NAME[current.kind]} 기준으로 봅니다. 자동 판별은 ${KIND_NAME[current.kindGuess]}입니다 (${current.kindReason})`;
  kn.className = current && !current.kindAuto ? "warn-text" : "";
  $("kind-auto").hidden = !current || current.kindAuto;

  $("home").hidden = current !== null;
  $("report").hidden = current === null;
  if (!current) {
    renderHome();
    return;
  }
  $("path").textContent = folderName(current.path);
  $("path-full").textContent = current.path;
  $("path-full").title = current.path;
  const n = $("notice");
  n.hidden = !notice;
  n.textContent = notice;
  n.classList.toggle("same", noticeSame);
  ($("show-folder") as HTMLButtonElement).disabled = blocked;
  const blockedNote = $("blocked");
  blockedNote.hidden = !current.blocked;
  blockedNote.textContent = current.blocked
    ? `.claude/settings.json을 쓸 수 없어 설정 고치기를 막았습니다: ${current.blocked}`
    : "";
  const undoBtn = $("undo") as HTMLButtonElement;
  undoBtn.hidden = !current.canUndo;
  undoBtn.disabled = blocked;
  ($("rerun") as HTMLButtonElement).disabled = blocked;
  $("rerun-label").textContent = loading ? "점검 중…" : "다시 점검";
  ($("save-report") as HTMLButtonElement).disabled = blocked;

  // 사용 방식: 다시 진단하는 동안에는 누른 값을 그대로 보여 준다
  for (const [id, u] of [
    ["usage-solo", "solo"],
    ["usage-team", "team"],
  ] as const) {
    const b = $(id) as HTMLButtonElement;
    if (!busy) b.setAttribute("aria-pressed", String(current.usage === u));
    b.disabled = blocked;
  }
  $("usage-note").textContent = current.usageAuto
    ? current.usageReason
    : `직접 골랐습니다 (자동 추천은 ‘${USAGE_NAME[current.usageGuess]}’, ${current.usageReason})`;

  renderTabs();
  renderResults(current);
  renderBundles(current);
  renderCriteria(current);
}

// ---- 사용법·용어 창 ----

const help = $("help") as HTMLDialogElement;
let helpOpener: HTMLElement | null = null;
function openHelp(): void {
  if (help.open) return;
  helpOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  help.showModal();
  $("help-title").focus();
}
help.addEventListener("close", () => {
  if (helpOpener?.isConnected) helpOpener.focus();
  helpOpener = null;
});
$("help-close").addEventListener("click", () => help.close());
$("help-open").addEventListener("click", openHelp);
$("glossary").append(glossaryList(GLOSSARY));

// ---- 시작 ----

$("brand").addEventListener("click", goHome);
$("open").addEventListener("click", () => void openFolder());
$("home-open").addEventListener("click", () => void openFolder());
$("show-folder").addEventListener("click", () => {
  if (current) void api.showFolder(current.path).catch(showError);
});
$("open-guide").addEventListener("click", () => void api.openGuide().catch(showError));
// 통과 항목 펼치기는 이 PC에만 기억한다 (저장소를 쓸 수 없으면 기억하지 않음)
$("passed-toggle").addEventListener("click", () => {
  showPassed = !showPassed;
  try {
    localStorage.setItem("showPassed", showPassed ? "1" : "0");
  } catch {
    // 기억하지 못해도 이번 실행에는 적용된다
  }
  render();
});
// 탭은 좌우 화살표·Home·End로 옮긴다 (WAI-ARIA 탭 패턴)
for (const [t, id] of TABS) {
  $(id).addEventListener("click", () => setTab(t));
  $(id).addEventListener("keydown", (e) => {
    const at = TABS.findIndex(([x]) => x === tab);
    const to =
      e.key === "ArrowRight"
        ? (at + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (at + TABS.length - 1) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : -1;
    const next = TABS[to];
    if (next) {
      e.preventDefault();
      setTab(next[0], true);
    }
  });
}
// 사용 방식: 자동 추천과 같은 값을 고르면 직접 지정이 풀린다 (core가 처리)
for (const [id, u] of [
  ["usage-solo", "solo"],
  ["usage-team", "team"],
] as const)
  $(id).addEventListener("click", () => {
    if (current && current.usage !== u) void load(current.path, undefined, u);
  });
document.addEventListener("keydown", trapFocus);
// 단축키: Ctrl+O 폴더 열기, F5·Ctrl+R 다시 점검 (버튼이 꺼져 있으면 무시). 사용법 창이 열린 동안에는 쓰지 않는다
document.addEventListener("keydown", (e) => {
  if (help.open) return;
  const enabled = (id: string) => !($(id) as HTMLButtonElement).disabled;
  if (e.ctrlKey && e.key.toLowerCase() === "o" && enabled("open")) {
    e.preventDefault();
    void openFolder();
  } else if ((e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) && current) {
    e.preventDefault();
    if (enabled("rerun")) void load(current.path);
  } else if (
    e.ctrlKey &&
    e.key === "Enter" &&
    !busy &&
    !e.repeat &&
    ($("panel").hidden || Date.now() - panelOpenedAt > 400)
  ) {
    // 창이 막 열린 직후(0.4초)의 Ctrl+Enter는 무시한다: 두 번 눌러 미리 보기를 건너뛰지 않게
    // Ctrl+Enter: 열린 확인창의 주 버튼, 확인창이 없으면 점검 결과의 주 버튼(고치기·커밋하기)
    const modal = !$("panel").hidden && !$("scrim").hidden;
    const usable = (el: HTMLElement | null) =>
      el !== null && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
    const target = modal
      ? $("panel-btns").querySelector<HTMLElement>(".btn.primary:not(.deliberate)")
      : current && tab === "results"
        ? ([$("fix-all"), $("hero-commit"), $("hero-push")].find(usable) ?? null)
        : null;
    if (usable(target)) {
      e.preventDefault();
      target?.click();
    }
  } else if (e.ctrlKey && e.key.toLowerCase() === "z" && current && $("scrim").hidden) {
    // Ctrl+Z: 마지막으로 고친 것 되돌리기 (확인창을 거친다)
    const u = $("undo") as HTMLButtonElement;
    e.preventDefault();
    if (!u.hidden && !u.disabled) void undo();
    else if (u.hidden && !busy) {
      const afterCommit = current.pushPending !== undefined || committedPaths.has(current.path);
      panel(
        "되돌릴 수 없습니다",
        afterCommit
          ? "커밋한 뒤에는 앱에서 되돌릴 수 없습니다. 되돌려야 하면 팀 담당자에게 물어보세요."
          : "이 폴더에서 되돌릴 고치기 기록이 없습니다.",
      );
      if (afterCommit)
        $("diffs").replaceChildren(
          h(
            "details",
            { class: "manual" },
            h("summary", {}, "자세히 (개발자용)"),
            h(
              "div",
              { class: "cmd-row" },
              h("code", {}, "git revert HEAD"),
              copyButton("git revert HEAD"),
            ),
          ),
        );
      closeOnly();
    }
  } else if (e.ctrlKey && ["1", "2", "3"].includes(e.key) && current && $("scrim").hidden) {
    // Ctrl+1·2·3: 탭 옮기기
    e.preventDefault();
    setTab(TABS[Number(e.key) - 1]?.[0] ?? "results", true);
  }
});
for (const id of ["kind-dev", "kind-docs"])
  $(id).addEventListener("change", (e) => {
    const kind = (e.target as HTMLInputElement).value as Kind;
    if (!current) return;
    if (kind === "docs" && current.kindGuess === "dev") confirmLooserKind();
    else void load(current.path, kind);
  });

// 개발 저장소로 판별된 폴더를 문서 기준으로 보면 보는 항목이 줄어 점수가 오른다: 이유를 알리고 확인
function confirmLooserKind(): void {
  if (!current) return;
  const path = current.path;
  locked = true;
  panel(
    "문서·기획 폴더 기준으로 볼까요?",
    `이 폴더는 개발 저장소로 판별됐습니다 (${current.kindReason}). 문서 기준으로 보면 검증 명령, 위험 명령 검사, 화면 규칙(DESIGN.md) 같은 개발 항목을 보지 않아 점수가 올라갈 수 있습니다. 리포트에는 직접 지정으로 남습니다.`,
    "",
    true,
  );
  panelButtons(
    button(
      "문서 기준으로 보기",
      () => {
        closePanel();
        void load(path, "docs");
      },
      "btn primary",
    ),
    button("취소", closePanel),
  );
  render();
}
$("kind-auto").addEventListener("click", () => {
  if (!current) return;
  void load(current.path, "auto").then(() =>
    ($(current?.kind === "docs" ? "kind-docs" : "kind-dev") as HTMLInputElement).focus(),
  );
});
$("claude-recheck").addEventListener("click", () => {
  setBusy(true);
  void api
    .getState(true)
    .then((s) => {
      state = s;
    })
    .catch(showError)
    .finally(() => setBusy(false));
});
$("update-open").addEventListener("click", () => void api.openUpdate().catch(showError));
$("update-close").addEventListener("click", () => {
  dismissedUpdate = state?.update?.latest ?? null;
  render();
});
$("rerun").addEventListener("click", () => current && void load(current.path));
$("undo").addEventListener("click", () => void undo());
$("save-report").addEventListener("click", () => void saveReport());
$("hero-report").addEventListener("click", () => void saveReport());
$("fix-all").addEventListener("click", () => current && void fix(current.fixes.map((f) => f.no)));
$("panel-close").addEventListener("click", closePanel);
$("hero-commit").addEventListener("click", () => void commitFlow());
$("hero-push").addEventListener("click", () => void pushFlow());
$("hero-self-push").addEventListener("click", () => {
  if (!current) return;
  selfPushPaths.add(current.path);
  render();
});
// Esc로 패널 닫기 (Claude 실행 중에는 닫기 버튼이 없으므로 닫지 않는다)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !help.open && !$("panel").hidden && !$("panel-close").hidden)
    closePanel();
});
function pickStandard(): void {
  void api
    .pickStandard()
    .then(async (s) => {
      state = s;
      if (current) await load(current.path);
      else render();
    })
    .catch(showError);
}
$("pick-standard").addEventListener("click", pickStandard);
$("home-pick-standard").addEventListener("click", pickStandard);
$("reset-standard").addEventListener("click", () => {
  locked = true;
  panel(
    "기본 기준으로 되돌릴까요?",
    "사내 기준 파일 대신 앱에 들어 있는 기본 기준으로 점검합니다. 사내 기준 파일은 지우지 않고, ‘사내 기준 파일 바꾸기’로 다시 고를 수 있습니다.",
    "",
    true,
  );
  panelButtons(button("기본 기준으로", resetStandard, "btn primary"), button("취소", closePanel));
  render();
});
function resetStandard(): void {
  closePanel();
  void api
    .pickStandard(true)
    .then(async (s) => {
      state = s;
      if (current) await load(current.path);
      else render();
    })
    .catch(showError);
}
api.onEvent((e) => {
  if (e.type === "progress") logLine(e.progress);
});
void refreshState().catch(showError);
