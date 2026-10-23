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
  props: { class?: string; title?: string; type?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
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

const READY_SCORE = 80; // 이 점수 이상이면 "준비됨"

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

function panelButtons(...btns: HTMLButtonElement[]): void {
  // 확인창의 주 버튼은 Ctrl+Enter로도 누른다
  for (const b of btns)
    if (b.classList.contains("primary")) {
      b.title = "Ctrl+Enter";
      b.setAttribute("aria-keyshortcuts", "Control+Enter");
    }
  $("panel-btns").replaceChildren(...btns);
}

// 결과·안내만 보여 주는 패널: 뒤 화면을 막지 않는다 (확인이 필요한 패널만 모달)
function closeOnly(): void {
  panelButtons(button("닫기", closePanel));
  $("panel").classList.add("toast");
  setModal(false);
  locked = false;
  render();
}

function closePanel(): void {
  stopElapsed();
  $("panel").hidden = true;
  setModal(false);
  locked = false;
  render();
  // 버튼이 다시 그려졌으면 같은 이름표의 새 버튼으로, 없으면 보고서 제목으로
  const visible = (el: HTMLElement | null) =>
    el?.isConnected && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
  if (visible(returnFocus)) returnFocus?.focus();
  else if (visible($("hero-commit"))) $("hero-commit").focus();
  else if (!focusKey(returnKey)) {
    if (busy) pendingReturn = { el: returnFocus, key: returnKey };
    $("path").focus();
  }
  returnFocus = null;
  returnKey = null;
}

// 확인 패널이 열린 동안에는 뒤 화면(사이드바·보고서·알림)을 통째로 비활성(inert)으로 만든다:
// 클릭도 Tab도 닿지 않는다
function setModal(on: boolean): void {
  $("scrim").hidden = !on;
  $("panel").setAttribute("aria-modal", String(on));
  for (const el of document.querySelectorAll<HTMLElement>(".side, #report, #update, #empty"))
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
  return m?.[1] ? `${m[1]} && git commit -m "Claude Code 팀 설정"` : null;
}
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
      "변경 커밋하기",
      `파일 ${r.files.length}개를 커밋합니다\n커밋한 뒤 원격 저장소에 push해야 팀원이 받습니다. push는 직접 하세요.`,
      "",
      true,
    );
    $("panel-message").classList.add("lead");
    $("outside").hidden = false;
    $("outside").replaceChildren(...r.files.map((f) => h("li", {}, h("code", {}, f))));
    $("panel-note").textContent =
      `커밋 메시지: ${r.message} · 앱이 만든 파일만 커밋하고, 따로 스테이징해 둔 변경은 그대로 둡니다.`;
    panelButtons(
      button(
        "커밋하기",
        () => {
          void (async () => {
            setBusy(true);
            try {
              await api.commit(path, true);
              commitCmds.delete(path);
              current = await api.diagnose(path);
              state = await api.getState();
              locked = false;
              panel(
                "커밋했습니다",
                scoreChange(before, current.score) +
                  (current.score >= READY_SCORE ? "\n준비됨: 팀 기준을 통과했습니다" : ""),
              );
              $("panel-message").classList.add("lead");
              $("panel-note").textContent = "팀원에게 보내려면 터미널에서 git push 하세요.";
              closeOnly();
            } catch (e) {
              showError(e);
            } finally {
              setBusy(false);
            }
          })();
        },
        "btn primary",
      ),
      button("취소", closePanel),
    );
  } catch (e) {
    showError(e);
  } finally {
    setBusy(false);
  }
}

function showError(e: unknown): void {
  locked = false;
  panel("처리하지 못했습니다", (e as Error).message ?? String(e), "error");
  closeOnly();
  render();
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

// 파일 하나: 접을 수 있는 요약 줄(경로·새 파일·줄 수·출처) + diff
function fileBlock(p: Pick<FilePreview, "path" | "diff">, open: boolean, meta = ""): HTMLElement {
  const d = h(
    "details",
    { class: "file" },
    h(
      "summary",
      {},
      h("span", { class: "file-path" }, p.path),
      meta ? h("span", { class: "file-meta" }, meta) : null,
    ),
    diffPre(p.diff),
  );
  d.open = open;
  return d;
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
    text = `끝 (${p.ok ? "성공" : "실패"}${p.costUsd !== undefined ? `, 사용량 약 ${Math.max(10, Math.round((p.costUsd * 1400) / 10) * 10)}원` : ""})`;
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

let notice = ""; // 점수가 바뀐 이유 (폴더 종류를 바꿨을 때)

async function load(path: string, kind?: Kind | "auto"): Promise<void> {
  const prev = current?.path === path ? current : null;
  const at = document.activeElement as HTMLElement | null;
  const back = at && at !== document.body ? { id: at.id, key: at.dataset.key ?? null } : null;
  let failed = false; // 실패하면 오류 패널에 포커스를 둔다
  loading = true;
  setBusy(true);
  try {
    current = await api.diagnose(path, kind);
    notice =
      kind !== undefined && prev && prev.kind !== current.kind
        ? `폴더 종류를 바꿔 진단 기준이 달라졌습니다: 점수 ${prev.score} → ${current.score}점`
        : "";
    state = await api.getState();
  } catch (e) {
    failed = true;
    showError(e);
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
  const all = current.fixes.filter((f) => nos.includes(f.no));
  let chosen = [...nos];
  locked = true;
  const applyBtn = button("적용", () => void apply(), "btn primary");
  const files = h("div", {});

  // 고를 항목: 체크를 바꾸면 패널 전체를 다시 그리지 않고 요약·파일만 바꾼다 (포커스·스크롤 유지)
  const picker = (): HTMLElement => {
    const box = h("fieldset", { class: "pick" }, h("legend", {}, "고칠 항목"));
    for (const item of all) {
      const cb = h("input", { type: "checkbox" });
      cb.checked = chosen.includes(item.no);
      cb.addEventListener("change", () => {
        chosen = cb.checked
          ? [...chosen, item.no].sort((a, b) => a - b)
          : chosen.filter((n) => n !== item.no);
        void update().catch(showError);
      });
      box.append(h("label", { class: "pick-item" }, cb, item.title));
    }
    return box;
  };

  const update = async (): Promise<void> => {
    const m = $("panel-message");
    if (chosen.length === 0) {
      m.textContent = "고칠 항목을 하나 이상 고르세요.";
      files.replaceChildren();
      applyBtn.disabled = true;
      return;
    }
    const r = await api.fix(path, chosen, false);
    if (r.kind !== "preview") return;
    const newFiles = r.previews.filter((p) => p.isNew).length;
    // 첫 줄은 크게(한 문장 요약), 다음 줄은 세부. 다 고를 때만 커밋 뒤 점수를 안다
    const commitTo = chosen.length === all.length ? current?.committedScore : undefined;
    m.className = "panel-message lead";
    m.textContent =
      `할 일 ${r.items.length}개를 고치면 ${before} → ${r.expectedScore}점` +
      `\n문제 ${r.resolves}건 해결 · 파일 ${r.previews.length}개` +
      (newFiles > 0 ? ` (새 파일 ${newFiles})` : "") +
      (commitTo !== undefined
        ? ` · 고친 뒤 커밋하면 ${commitTo}점${commitTo >= READY_SCORE ? "으로 준비됨" : ""}`
        : r.expectedScore < READY_SCORE
          ? ` · 준비됨(${READY_SCORE}점)까지는 다른 할 일이 더 필요합니다`
          : "");
    files.replaceChildren(
      ...r.previews.map((p) =>
        fileBlock(
          p,
          // 사람이 읽을 설정 파일만 펼치고, 원본을 그대로 복사하는 파일은 접어 둔다
          r.previews.length === 1 || (p.note === undefined && p.added <= 60),
          [p.isNew ? "새 파일" : "수정", `${p.added}줄 추가`, p.note].filter(Boolean).join(" · "),
        ),
      ),
    );
    applyBtn.disabled = false;
  };

  const title = all.length === 1 ? `바뀔 내용 확인: ${all[0]?.title ?? ""}` : "바뀔 내용 확인";
  const show = async (): Promise<void> => {
    panel(title);
    $("diffs").replaceChildren(...(all.length > 1 ? [picker()] : []), files);
    $("panel-note").textContent =
      "적용 전 원본은 자동으로 백업되고, ‘마지막 반영 되돌리기’로 언제든 되돌릴 수 있습니다.";
    panelButtons(applyBtn, button("취소", closePanel));
    await update();
    $("diffs").querySelector<HTMLElement>(".pick input, .file summary")?.focus();
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
        panel(
          "적용했습니다",
          scoreChange(before, current.score) +
            (commitTo !== undefined
              ? `\n이제 커밋하면 ${commitTo}점${commitTo >= READY_SCORE ? ", 준비됨" : ""}`
              : ""),
        );
        $("panel-message").classList.add("lead");
        const note = $("panel-note");
        note.textContent = "원본은 백업해 두었습니다. ‘마지막 반영 되돌리기’로 되돌릴 수 있습니다.";
        note.title = done.backupDir;
        closeOnly();
      }
      state = await api.getState();
    } catch (e) {
      showError(e);
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
                (current.kind === "dev" ? "\n바뀐 파일을 커밋해야 팀원 모두에게 적용됩니다" : "")
            : done.message,
        );
        if (action === "keep") {
          $("panel-message").classList.add("lead");
          $("panel-note").textContent = "‘마지막 반영 되돌리기’로 되돌릴 수 있습니다.";
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
  panel(`${label}: 실행 전 확인`, "Claude Code가 이 폴더를 읽고 아래 파일만 고칩니다.", "", true);
  const targets = f.claudeTargets?.join(", ") ?? "표준이 정한 파일";
  const fact = (k: string, v: string) => h("li", {}, h("b", {}, k), " ", v);
  $("diffs").replaceChildren(
    h(
      "ul",
      { class: "facts" },
      fact("고칠 파일", targets),
      fact("걸리는 시간", "보통 1분 안팎. 10분이 넘으면 자동으로 멈추고 원래대로 돌립니다."),
      fact(
        "사용량",
        "Claude 사용량이 듭니다. 작은 저장소 기준 1회 약 150~400원어치($0.1~0.3)이고, 요금제 한도에서 차감됩니다.",
      ),
      fact("안전", "명령 실행과 .env 읽기는 막혀 있고, 실행 전에 원본을 백업합니다."),
      fact("결과", "바뀐 내용을 먼저 보여 드리고, ‘적용’을 눌러야 반영됩니다."),
    ),
  );
  panelButtons(
    button(
      "Claude 실행 · 약 150~400원",
      () => {
        claudeQueue = [];
        queueTotal = 1;
        queueDone = 0;
        void runClaude(f, label);
      },
      "btn primary",
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
    "Claude Code가 이 폴더를 읽고 아래 파일만 고칩니다. 하나씩 실행하고, 결과마다 적용할지 고른 뒤 다음으로 넘어갑니다.",
    "",
    true,
  );
  const targets = [...new Set(list.flatMap((f) => f.claudeTargets ?? []))].join(", ");
  const fact = (k: string, v: string) => h("li", {}, h("b", {}, k), " ", v);
  $("diffs").replaceChildren(
    h(
      "ul",
      { class: "facts" },
      fact("고칠 파일", targets || "표준이 정한 파일"),
      fact("걸리는 시간", `건당 보통 1분 안팎, 모두 ${n}건. 10분이 넘는 건은 자동으로 멈춥니다.`),
      fact(
        "사용량",
        `작은 저장소 기준 모두 약 ${150 * n}~${400 * n}원어치이고, 요금제 한도에서 차감됩니다.`,
      ),
      fact("안전", "명령 실행과 .env 읽기는 막혀 있고, 실행마다 원본을 백업합니다."),
      fact("중간에 멈추기", "실행 중 ‘중단’을 누르거나 오류가 나면 남은 작업은 실행하지 않습니다."),
    ),
  );
  panelButtons(
    button(
      `Claude 실행 · 약 ${150 * n}~${400 * n}원`,
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
      "btn primary",
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
    button("중단", () => void api.claude({ type: "stop" }).catch(showError), "btn danger"),
  );
  const elapsed = h("span", { class: "elapsed" });
  $("panel-note").replaceChildren(
    elapsed,
    " · 실행 전 대상 파일을 백업했습니다. 중단하면 원래대로 되돌립니다.",
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
      "마지막 반영 되돌리기",
      [
        removed ? `새로 만든 파일 ${removed}개 지우기` : "",
        restored ? `파일 ${restored}개 원래대로` : "",
      ]
        .filter(Boolean)
        .join(", ") +
        `
${new Date(r.createdAt).toLocaleString()} 반영을 되돌립니다. 점수도 그 전으로 돌아갑니다.` +
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
        "btn danger-fill",
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

// 할 일 한 줄: 같은 고치기로 풀리는 진단 항목은 한 줄로 묶는다
interface Todo {
  key: string;
  kind: "fix" | "claude" | "manual";
  primary: FindingView;
  items: FindingView[]; // 이 할 일로 해결되는 진단 항목 (primary 포함)
  severity: "fail" | "warn";
  penalty: number; // 이 할 일의 진단 항목 감점 합
  gain: number; // 고치면 오르는 점수 (커밋 전)
  gainNote?: string; // 커밋하면 더 오르는 점수
}

function head(message: string): string {
  return message.split(" / ")[0] ?? message;
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
    if (f.needsCommit) continue; // 커밋 줄이 따로 보여 준다
    const no = f.fixNo;
    const items =
      no !== undefined ? problems.filter((x) => x.fixNo === no || x.fixSharedWith === no) : [f];
    const severity = items.some((x) => x.severity === "fail") ? "fail" : "warn";
    todos.push({
      key: no !== undefined ? `fix:${no}` : `item:${f.id}:${todos.length}`,
      kind: no !== undefined ? "fix" : f.claudeTask ? "claude" : "manual",
      primary: f,
      items,
      severity,
      penalty: items.reduce(
        (s, x) => s + (x.severity === "fail" ? d.weights.fail : d.weights.warn),
        0,
      ),
      gain: 0,
    });
    // settings.json을 새로 만드는 줄: 커밋하기 전까지 "커밋 여부"가 위험으로 남으므로 그만큼 덜 오른다
    const t = todos[todos.length - 1];
    if (t) {
      const creates =
        d.committedScore !== undefined && items.some((x) => x.id === "settings/missing");
      t.gain = t.penalty - (creates ? d.weights.fail : 0);
      if (creates) t.gainNote = `커밋 후 +${d.weights.fail}`;
    }
  }
  const rank = (t: Todo) => (t.severity === "fail" ? 0 : 1);
  return todos.sort((a, b) => rank(a) - rank(b) || b.penalty - a.penalty);
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

function sevBadge(sev: keyof typeof ICON_PATH, label: string): HTMLElement {
  return h("span", { class: `badge ${sev}` }, h("span", { class: "sr-only" }, label), icon(sev));
}

function claudeButton(f: FindingView): HTMLElement[] {
  const blocked = busy || locked || (state?.running ?? false);
  const label = f.claudeLabel ?? "Claude로 반영";
  const b = keyed(
    button(label, () => confirmClaude(f), "btn soft small"),
    `claude:${f.id}`,
  );
  b.setAttribute("aria-label", `${label}: ${head(f.message)}`);
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

// 용어 풀이: 할 일을 펼치면 문장에 나온 말만, [점검 기준] 탭에는 전부
const GLOSSARY: { term: string; test: RegExp; text: string }[] = [
  {
    term: ".env",
    test: /\.env/,
    text: "API 키·비밀번호 같은 비밀 값을 담는 설정 파일입니다. Claude가 읽으면 대화와 요청에 그대로 들어갑니다.",
  },
  {
    term: "settings.json",
    test: /settings\.json/,
    text: "Claude Code의 권한 규칙을 담는 파일입니다. 저장소의 .claude/settings.json은 팀 공용, settings.local.json은 내 PC 전용입니다.",
  },
  {
    term: "권한 우회 모드",
    test: /권한 우회|bypass/i,
    text: "Claude가 묻지 않고 모든 파일 수정·명령 실행을 하는 모드입니다(--dangerously-skip-permissions). 팀 설정으로 켜지 못하게 막을 수 있습니다.",
  },
  {
    term: "훅",
    test: /훅|hook/i,
    text: "Claude가 명령을 실행하기 직전에 자동으로 도는 검사 스크립트입니다. 강제 푸시처럼 되돌리기 어려운 명령이면 멈춥니다.",
  },
  {
    term: "CLAUDE.md",
    test: /CLAUDE\.md/,
    text: "Claude Code가 대화를 시작할 때마다 읽는 팀 지침 파일입니다. 빌드·테스트 방법과 팀 규칙을 적습니다.",
  },
  {
    term: "플러그인",
    test: /플러그인|plugin/i,
    text: "팀 공용 스킬(계획·검증 등)과 훅을 묶어 나눠 쓰는 Claude Code 확장입니다.",
  },
  {
    term: "커밋·push",
    test: /커밋|commit|push/i,
    text: "커밋은 바뀐 파일을 git 기록에 남기는 것, push는 그 기록을 원격 저장소로 보내 팀원이 받게 하는 것입니다.",
  },
  {
    term: "DESIGN.md",
    test: /DESIGN\.md/,
    text: "화면의 색·글꼴·간격 기준을 적은 문서입니다. Claude가 화면을 고칠 때 이 기준을 따릅니다.",
  },
];

function termsIn(text: string): typeof GLOSSARY {
  return GLOSSARY.filter((g) => g.test.test(text));
}

function glossaryList(items: typeof GLOSSARY): HTMLElement {
  return h(
    "dl",
    { class: "glossary" },
    ...items.flatMap((g) => [h("dt", {}, g.term), h("dd", {}, g.text)]),
  );
}

// 오른쪽 고정 열: 고치면 오르는 점수와 접기 표시. 키보드·읽기 프로그램은 머리 버튼으로 다룬다
function pointsTail(
  gain: number,
  note: string | undefined,
  open: boolean | null,
  toggle?: () => void,
): HTMLElement {
  const tail = h(
    "div",
    { class: "todo-tail" },
    h(
      "span",
      { class: "todo-pts" },
      `+${gain}점`,
      note ? h("span", { class: "todo-pts-note" }, note) : null,
    ),
    open === null
      ? h("span", { class: "chev-space" })
      : svgIcon(open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6", "ico chev"),
  );
  tail.setAttribute("aria-hidden", "true");
  if (toggle) tail.addEventListener("click", toggle);
  return tail;
}

function renderTodo(t: Todo, d: DiagnosisView): HTMLElement {
  const f = t.primary;
  const id = `todo:${t.key}`;
  const open = expanded.has(id);
  const blocked = busy || locked || (state?.running ?? false);
  const fixTitle = d.fixes.find((x) => x.no === f.fixNo)?.title;
  const sub =
    t.kind === "fix"
      ? `고치면: ${fixTitle ?? ""}${t.items.length > 1 ? ` · 문제 ${t.items.length}건` : ""}`
      : t.kind === "claude"
        ? `Claude가 폴더를 읽고 씁니다 · 대상: ${f.claudeTargets?.join(", ") ?? "표준이 정한 파일"}`
        : (f.judgment ?? "직접 판단이 필요합니다");

  const bodyId = `body-${t.key.replace(/[^a-z0-9-]/gi, "-")}`;
  const headBtn = keyed(
    h(
      "button",
      { class: "todo-head", type: "button" },
      sevBadge(t.severity, SEVERITY[t.severity]),
      h(
        "span",
        { class: "todo-text" },
        h("span", { class: "todo-title" }, head(f.message)),
        h("span", { class: "todo-sub" }, sub),
      ),
      h("span", { class: "sr-only" }, `, 고치면 +${t.gain}점`),
    ),
    id,
  );
  headBtn.setAttribute("aria-expanded", String(open));
  headBtn.setAttribute("aria-controls", bodyId);
  headBtn.addEventListener("click", () => {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
  });

  const row = h("div", { class: "todo-row" }, headBtn);
  if (t.kind === "claude") row.append(h("div", { class: "todo-act" }, ...claudeButton(f)));
  row.append(pointsTail(t.gain, t.gainNote, open, () => headBtn.click()));

  const box = h("div", { class: `todo${open ? " open" : ""}` }, row);
  if (!open) return box;

  const det = f.detail;
  const body = h("div", { class: "todo-body" });
  body.id = bodyId;
  if (det?.why)
    body.append(h("div", { class: "kv" }, h("b", {}, "왜 문제인가요"), h("p", {}, det.why)));
  const extra = f.message.split(" / ").slice(1);
  if (t.items.length > 1 || extra.length > 0) {
    const list = h("ul", { class: "covered" });
    for (const x of t.items) {
      const pts = x.severity === "fail" ? d.weights.fail : d.weights.warn;
      list.append(
        h(
          "li",
          {},
          h("span", {}, head(x.message)),
          h("span", { class: `covered-pts ${x.severity}` }, `${SEVERITY[x.severity]} −${pts}`),
        ),
      );
      for (const r of x.message.split(" / ").slice(1))
        list.append(h("li", { class: "covered-sub" }, r));
    }
    body.append(
      h(
        "div",
        { class: "kv" },
        h("b", {}, t.items.length > 1 ? "함께 해결되는 문제" : "자세히"),
        list,
      ),
    );
  }
  if (det?.fix) body.append(h("div", { class: "kv" }, h("b", {}, "고치면"), h("p", {}, det.fix)));
  if (det?.limit)
    body.append(h("div", { class: "kv" }, h("b", {}, "남는 한계"), h("p", {}, det.limit)));
  const words = termsIn([f.message, sub, det?.why ?? "", det?.fix ?? ""].join(" ")).slice(0, 3);
  if (words.length > 0)
    body.append(h("div", { class: "kv" }, h("b", {}, "용어"), glossaryList(words)));
  if (t.kind === "manual" && f.judgment)
    body.append(h("div", { class: "kv" }, h("b", {}, "할 일"), h("p", {}, f.judgment)));
  if (f.example) {
    const exId = `${f.id}:example`;
    body.append(h("div", {}, toggleLink(exId, "예시 접기", "예시 보기")));
    if (expanded.has(exId))
      body.append(
        h(
          "div",
          { class: "example" },
          h("div", { class: "example-label" }, "예시"),
          h("pre", {}, f.example),
        ),
      );
  }
  const acts = h("div", { class: "todo-acts" });
  if (t.kind === "fix" && f.fixNo !== undefined) {
    const no = f.fixNo;
    const b = keyed(
      button("이 할 일만 고치기", () => void fix([no]), "btn soft"),
      `fix:${f.id}`,
    );
    b.setAttribute("aria-label", `이 할 일만 고치기: ${head(f.message)}`);
    b.disabled = blocked;
    acts.append(b);
    if (f.claudeTask) acts.append(...claudeButton(f));
  }
  if (acts.childElementCount > 0) body.append(acts);
  box.append(body);
  return box;
}

function passedItem(f: FindingView): HTMLElement {
  const na = f.notApplicable === true;
  return h(
    "div",
    { class: `passed-item${na ? " na" : ""}` },
    sevBadge(na ? "na" : "ok", na ? "해당 없음" : "통과"),
    h("span", {}, head(f.message)),
    na ? h("span", { class: "tag" }, "해당 없음") : null,
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
    return h("span", { class: "dot-line bad" }, `Claude Code 없음 · ${c.error ?? "찾지 못함"}`);
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

function renderRecent(): void {
  if (!state) return;
  $("recent").replaceChildren(
    ...(state.recent.length === 0
      ? [h("li", { class: "small muted" }, "아직 없음")]
      : state.recent.map((r) => {
          const score = r.score !== undefined ? `${r.score}점` : "";
          const tone =
            r.score === undefined
              ? ""
              : r.score >= READY_SCORE
                ? " good"
                : r.score < 50
                  ? " bad"
                  : "";
          const b = keyed(
            h(
              "button",
              {
                type: "button",
                title: r.path,
                class: current?.path === r.path ? "current" : undefined,
              },
              h(
                "span",
                { class: "recent-text" },
                h("span", { class: "name" }, folderName(r.path)),
                h("span", { class: "where" }, r.path),
              ),
              h("span", { class: `pts${tone}` }, score),
            ),
            `recent:${r.path}`,
          );
          if (current?.path === r.path) b.setAttribute("aria-current", "true");
          b.setAttribute(
            "aria-label",
            `${folderName(r.path)} ${score}${r.kind ? " (폴더 종류 직접 지정)" : ""} — ${r.path}`,
          );
          b.addEventListener("click", () => void openFolder(r.path));
          return h("li", {}, b);
        })),
  );
}

let tab: "results" | "criteria" = "results";
let showPassed = (() => {
  try {
    return localStorage.getItem("showPassed") === "1";
  } catch {
    return false;
  }
})();

function setTab(t: typeof tab, focus = false): void {
  tab = t;
  render();
  if (focus) $(t === "results" ? "tab-results" : "tab-criteria").focus();
}

function renderTabs(): void {
  for (const [t, id, view] of [
    ["results", "tab-results", "view-results"],
    ["criteria", "tab-criteria", "view-criteria"],
  ] as const) {
    const on = tab === t;
    const b = $(id);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    $(view).hidden = !on;
  }
}

function renderHero(d: DiagnosisView, todos: Todo[]): void {
  const ready = d.score >= READY_SCORE;
  const n = d.fixes.length;
  const fixTo =
    d.expectedScore !== undefined && d.expectedScore > d.score ? d.expectedScore : undefined;
  const commitTo = d.committedScore;
  const pill = $("status-pill");
  pill.textContent = ready ? "준비됨" : "아직 준비 전";
  pill.className = `pill ${ready ? "good" : "warn"}`;
  $("std-line").textContent =
    `${d.standardName} 기준` + (d.kindAuto ? "" : ` · ${KIND_NAME[d.kind]}로 직접 지정`);

  let headline: string;
  if (ready)
    headline =
      todos.length === 0
        ? "모든 항목을 통과했습니다"
        : `팀 기준을 통과했습니다\n남은 할 일 ${todos.length}개로 더 올릴 수 있습니다`;
  else if (n > 0 && fixTo !== undefined && fixTo >= READY_SCORE)
    headline = `${n}개를 고치면\n팀 기준을 통과합니다`;
  else if (commitTo !== undefined && commitTo >= READY_SCORE)
    headline =
      n > 0
        ? `${n}개 고치고 커밋하면\n팀 기준을 통과합니다`
        : "설정을 커밋하면\n팀 기준을 통과합니다";
  else if (n > 0) headline = `${n}개를 고치면\n${commitTo ?? fixTo ?? d.score}점까지 오릅니다`;
  else headline = `할 일 ${todos.length}개가 남았습니다`;
  $("headline").textContent = headline;

  const score = $("score");
  score.textContent = String(d.score);
  score.parentElement?.classList.toggle("stale", loading);
  const { fail, warn } = d.counts;
  const parts = [
    fail ? `위험 ${fail}건 × ${d.weights.fail}` : "",
    warn ? `주의 ${warn}건 × ${d.weights.warn}` : "",
  ].filter(Boolean);
  const lost = fail * d.weights.fail + warn * d.weights.warn;
  $("breakdown").textContent = loading
    ? "점검 중…"
    : parts.length > 0
      ? `100점에서 ${parts.join(" + ")} = −${lost}점`
      : "감점 없음";

  const pct = (v: number | undefined) => `${Math.max(0, Math.min(100, v ?? 0))}%`;
  $("bar-now").style.width = pct(d.score);
  $("bar-fix").style.width = pct(fixTo ?? d.score);
  $("bar-commit").style.width = pct(commitTo ?? fixTo ?? d.score);
  const legend = [
    h("li", {}, h("i", { class: "sw now" }), `지금 ${d.score}점`),
    fixTo !== undefined ? h("li", {}, h("i", { class: "sw fix" }), `고치면 ${fixTo}점`) : null,
    commitTo !== undefined
      ? h("li", {}, h("i", { class: "sw commit" }), `커밋하면 ${commitTo}점`)
      : null,
    h("li", {}, h("i", { class: "sw goal" }), `${READY_SCORE}점부터 준비됨`),
  ];
  $("legend").replaceChildren(...legend.filter((x): x is HTMLLIElement => x !== null));

  const fixAll = $("fix-all") as HTMLButtonElement;
  fixAll.hidden = n === 0;
  fixAll.textContent = `${n}개 바로 고치기`;
  fixAll.setAttribute(
    "aria-label",
    `바로 고칠 수 있는 ${n}개 고치기${fixTo !== undefined ? `, 약 ${fixTo}점` : ""}`,
  );
  fixAll.disabled = busy || locked || (state?.running ?? false);
  // 바로 고칠 게 없고 커밋만 남았으면 주 버튼은 커밋 명령 복사
  const { pending, cmd } = commitInfo(d);
  const commitBtn = $("hero-commit") as HTMLButtonElement;
  commitBtn.hidden = n > 0 || !pending || cmd === null;
  commitBtn.disabled = busy || locked || (state?.running ?? false);
  $("fix-caption").textContent =
    n > 0
      ? "바뀌는 내용을 먼저 보여 드립니다\n" +
        (commitTo !== undefined
          ? "고친 뒤 바로 커밋할 수 있습니다"
          : "적용한 뒤에도 되돌릴 수 있습니다")
      : pending
        ? `앱이 만든 파일만 커밋합니다\n커밋하면 ${commitTo ?? d.score + d.weights.fail}점이 됩니다`
        : "";
}

// 커밋: 점수가 80을 넘는 마지막 걸음이라 할 일 목록에 한 줄로 둔다 (명령 복사)
// 커밋할 게 남았는지(이미 만든 settings.json이 커밋 전)와 복사할 명령
function commitInfo(d: DiagnosisView): { pending: boolean; cmd: string | null } {
  const pending = d.areas.flatMap((a) => a.findings).some((f) => f.needsCommit);
  const cmd =
    commitCmds.get(d.path) ??
    (pending ? `git add .claude/settings.json && git commit -m "Claude Code 팀 설정"` : null);
  return { pending, cmd };
}

function renderCommit(d: DiagnosisView): HTMLElement[] {
  const { pending, cmd } = commitInfo(d);
  if (!pending && d.committedScore === undefined) return [];
  const row = h(
    "div",
    { class: "todo commit" },
    h(
      "div",
      { class: "todo-row" },
      h(
        "div",
        { class: "todo-head static" },
        sevBadge("commit", "커밋"),
        h(
          "span",
          { class: "todo-text" },
          h("span", { class: "todo-title" }, "설정을 git에 커밋하기"),
          h(
            "span",
            { class: "todo-sub" },
            pending
              ? "커밋하고 push하면 팀원 모두에게 같은 설정이 적용됩니다"
              : "바로 고치기를 적용한 뒤 커밋합니다",
          ),
          h("span", { class: "sr-only" }, `, 커밋하면 +${d.weights.fail}점`),
        ),
      ),
      pointsTail(d.weights.fail, undefined, null),
    ),
  );
  if (cmd && pending)
    row.append(
      h(
        "div",
        { class: "cmd-row in-todo" },
        h("code", {}, cmd),
        keyed(
          button("커밋하기", () => void commitFlow(), "btn soft small"),
          "commit:row",
        ),
        copyButton(cmd),
      ),
    );
  return [h("h3", { class: "group-label" }, "커밋해서 팀에 적용합니다"), row];
}

function renderResults(d: DiagnosisView): void {
  const todos = buildTodos(d);
  const commit = renderCommit(d);
  const total = todos.length + (commit.length > 0 ? 1 : 0);
  renderHero(d, todos);
  $("todo-title").textContent = total > 0 ? `할 일 ${total}개` : "할 일이 없습니다";
  $("todo-hint").hidden = todos.length === 0 || expanded.size > 0; // 한 번 펼쳐 보면 힌트는 뺀다

  const active = document.activeElement as HTMLElement | null;
  const activeKey = $("todos").contains(active) ? (active?.dataset.key ?? null) : null;
  const groups: { kind: Todo["kind"]; label: string }[] = [
    { kind: "fix", label: "바로 고칠 수 있습니다" },
    { kind: "claude", label: "Claude가 써 줍니다 · 건당 약 1분, 150~400원" },
    { kind: "manual", label: "직접 해야 합니다" },
  ];
  const out: HTMLElement[] = [];
  for (const g of groups) {
    const items = todos.filter((t) => t.kind === g.kind);
    if (items.length === 0) continue;
    let label: HTMLElement = h("h3", { class: "group-label" }, g.label);
    // Claude 작업이 둘 이상이면 한 번에 처리하는 버튼 (제목 옆, 제목 밖)
    if (g.kind === "claude" && items.length > 1) {
      const all = keyed(
        button(
          `모두 처리 (${items.length}개)`,
          () => confirmClaudeAll(items.map((t) => t.primary)),
          "btn soft small",
        ),
        "claude:all",
      );
      all.disabled = busy || locked || (state?.running ?? false) || claudeBlocked() !== null;
      label = h("div", { class: "group-head" }, label, all);
    }
    out.push(label, ...items.map((t) => renderTodo(t, d)));
  }
  $("todos").replaceChildren(...out, ...commit);
  if (activeKey && !$("todos").contains(document.activeElement)) focusKey(activeKey);

  const all = d.areas.flatMap((a) => a.findings);
  const passed = all.filter((f) => f.severity === "ok" || f.notApplicable);
  const ok = passed.filter((f) => !f.notApplicable).length;
  const na = passed.length - ok;
  const toggle = $("passed-toggle");
  toggle.hidden = passed.length === 0;
  toggle.setAttribute("aria-expanded", String(showPassed));
  toggle.classList.toggle("open", showPassed);
  $("passed-label").textContent = showPassed
    ? "통과한 항목 접기"
    : `통과한 항목 ${ok}개 보기${na > 0 ? ` · 해당 없음 ${na}개` : ""}`;
  $("passed").hidden = !showPassed;
  $("passed").replaceChildren(...passed.map(passedItem));
}

const CRIT_STATUS = {
  ok: "통과",
  warn: "안 됨",
  fail: "안 됨",
  na: "해당 없음",
  pending: "확인 전",
};

function renderCriteria(d: DiagnosisView): void {
  const si = state?.standardInfo;
  $("standard").textContent = si ? `${si.name} ` : d.standardName;
  $("standard").append(h("span", { class: "std-ver" }, si?.version ?? ""));
  $("std-desc").textContent =
    d.standardSource === "shared"
      ? "지금 이 기준으로 점검합니다. 앱의 기본 점검에 사내 표준 파일이 정한 항목을 더했습니다. 더한 항목에는 '사내' 표시가 있습니다."
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
    [`안 됨 ${count(["fail", "warn"])}`, "bad"],
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
        { class: "crit-row" },
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
  if ($("glossary").childElementCount === 0) $("glossary").append(glossaryList(GLOSSARY));
}

function render(): void {
  if (state) {
    renderRecent();
    const si = state.standardInfo;
    $("empty-standard").textContent =
      `적용 기준: ${si.name} ${si.version}${si.file ? "" : " (기본 내장)"}`;
    $("open-guide").hidden = !si.guideUrl;
    const se = $("standard-error");
    se.hidden = !state.standardError;
    se.textContent = state.standardError ? `기본 표준으로 진단합니다: ${state.standardError}` : "";
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
    "open",
    "empty-open",
    "empty-pick-standard",
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
  kn.className = `small ${current && !current.kindAuto ? "warn-text" : "muted"}`;
  $("kind-auto").hidden = !current || current.kindAuto;
  $("side-kind").textContent = current
    ? `${KIND_NAME[current.kind]} (${current.kindAuto ? "자동 판별" : "직접 지정"})`
    : "";

  $("empty").hidden = current !== null;
  $("report").hidden = current === null;
  if (!current) return;
  $("path").textContent = folderName(current.path);
  $("path-full").textContent = current.path;
  $("path-full").title = current.path;
  const n = $("notice");
  n.hidden = !notice;
  n.textContent = notice;
  ($("show-folder") as HTMLButtonElement).disabled = blocked;
  const blockedNote = $("blocked");
  blockedNote.hidden = !current.blocked;
  blockedNote.textContent = current.blocked
    ? `.claude/settings.json을 쓸 수 없어 설정 고치기를 막았습니다: ${current.blocked}`
    : "";
  const undoBtn = $("undo") as HTMLButtonElement;
  undoBtn.hidden = !current.canUndo;
  undoBtn.disabled = blocked;
  const rerun = $("rerun") as HTMLButtonElement;
  rerun.disabled = blocked;
  rerun.textContent = loading ? "점검 중…" : "다시 점검";
  ($("save-report") as HTMLButtonElement).disabled = blocked;

  renderTabs();
  renderResults(current);
  renderCriteria(current);
}

// ---- 시작 ----

$("open").addEventListener("click", () => void openFolder());
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
$("tab-results").addEventListener("click", () => setTab("results"));
$("tab-criteria").addEventListener("click", () => setTab("criteria"));
// 탭은 좌우 화살표로 옮긴다 (WAI-ARIA 탭 패턴)
for (const id of ["tab-results", "tab-criteria"])
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setTab(tab === "results" ? "criteria" : "results", true);
    }
  });
document.addEventListener("keydown", trapFocus);
// 단축키: Ctrl+O 폴더 열기, F5·Ctrl+R 다시 점검 (버튼이 꺼져 있으면 무시)
document.addEventListener("keydown", (e) => {
  const enabled = (id: string) => !($(id) as HTMLButtonElement).disabled;
  if (e.ctrlKey && e.key.toLowerCase() === "o" && enabled("open")) {
    e.preventDefault();
    void openFolder();
  } else if ((e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) && current) {
    e.preventDefault();
    if (enabled("rerun")) void load(current.path);
  } else if (e.ctrlKey && e.key === "Enter") {
    // Ctrl+Enter: 열린 확인창의 주 버튼, 확인창이 없으면 점검 결과의 주 버튼(바로 고치기·커밋하기)
    const modal = !$("panel").hidden && !$("scrim").hidden;
    const usable = (el: HTMLElement | null) =>
      el !== null && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
    const target = modal
      ? $("panel-btns").querySelector<HTMLElement>(".btn.primary")
      : current && tab === "results"
        ? ([$("fix-all"), $("hero-commit")].find(usable) ?? null)
        : null;
    if (usable(target)) {
      e.preventDefault();
      target?.click();
    }
  } else if (e.ctrlKey && (e.key === "1" || e.key === "2") && current && $("scrim").hidden) {
    // Ctrl+1·2: 탭 옮기기
    e.preventDefault();
    setTab(e.key === "1" ? "results" : "criteria", true);
  }
});
$("empty-open").addEventListener("click", () => void openFolder());
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
    `이 폴더는 개발 저장소로 판별됐습니다 (${current.kindReason}). 문서 기준으로 보면 검증 명령·위험 명령 차단 훅·화면 규칙(DESIGN.md) 같은 개발 항목을 보지 않아 점수가 올라갈 수 있습니다. 리포트에는 직접 지정으로 남습니다.`,
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
$("fix-all").addEventListener("click", () => current && void fix(current.fixes.map((f) => f.no)));
$("panel-close").addEventListener("click", closePanel);
$("hero-commit").addEventListener("click", () => void commitFlow());
// Esc로 패널 닫기 (Claude 실행 중에는 닫기 버튼이 없으므로 닫지 않는다)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("panel").hidden && !$("panel-close").hidden) closePanel();
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
$("empty-pick-standard").addEventListener("click", pickStandard);
$("reset-standard").addEventListener("click", () => {
  locked = true;
  panel(
    "기본 표준으로 되돌릴까요?",
    "사내 표준 파일 대신 앱에 들어 있는 기본 표준으로 진단합니다. 표준 파일은 지우지 않고, ‘표준 파일 바꾸기’로 다시 고를 수 있습니다.",
    "",
    true,
  );
  panelButtons(button("기본 표준으로", resetStandard, "btn primary"), button("취소", closePanel));
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
