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

// 통과 항목 숨기기는 이 PC에만 기억한다 (저장소를 쓸 수 없으면 기억하지 않음)
function readHideOk(): boolean {
  try {
    return localStorage.getItem("hideOk") === "1";
  } catch {
    return false;
  }
}
let hideOk = readHideOk();

const READY_SCORE = 80; // 이 점수 이상이면 "준비됨"

// 상태 아이콘 (직접 그린 SVG, 굵기 하나)
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATH = {
  fail: "M7 7l10 10M17 7L7 17",
  warn: "M12 6v7M12 17.5v.01",
  ok: "M6 12.5l4 4 8-9",
  na: "M7 12h10",
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
  return `점수 ${before} → ${after}점 (${d > 0 ? "+" : ""}${d})`;
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

function panel(title: string, message = "", tone: "" | "error" = ""): void {
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
  $("panel-btns").replaceChildren(...btns);
}

// 결과·안내만 보여 주는 패널: 뒤 화면을 막지 않는다 (확인이 필요한 패널만 모달)
function closeOnly(): void {
  panelButtons(button("닫기", closePanel));
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
  if (returnFocus?.isConnected && !(returnFocus as HTMLButtonElement).disabled) returnFocus.focus();
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

function showError(e: unknown): void {
  locked = false;
  panel("오류", (e as Error).message ?? String(e), "error");
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
    m.textContent =
      `${r.items.length}개 고치기 · 진단 항목 ${r.resolves}개 해결 · 파일 ${r.previews.length}개` +
      (newFiles > 0 ? ` (새 파일 ${newFiles})` : "") +
      ` · 예상 점수 ${before} → ${r.expectedScore}점`;
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
      "적용 전 원본은 자동으로 백업되고, [↶ 마지막 반영 되돌리기]로 언제든 되돌릴 수 있습니다.";
    panelButtons(applyBtn, button("취소", closePanel));
    await update();
  };

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      const done = await api.fix(path, chosen, true);
      current = await api.diagnose(path);
      locked = false;
      if (done.kind === "applied") {
        panel("적용했습니다", scoreChange(before, current.score));
        $("panel-note").textContent = `${done.commitHint} · 원본 백업: ${done.backupDir}`;
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
      ? "아직 원본이 백업돼 있습니다. [버리고 원래대로]를 누르면 원래 내용으로 돌립니다."
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
          action === "keep" ? scoreChange(before, current.score) : done.message,
        );
        if (action === "keep")
          $("panel-note").textContent =
            current.kind === "dev"
              ? "바뀐 파일을 git에 커밋해야 팀원 전원에게 적용됩니다. [↶ 마지막 반영 되돌리기]로 되돌릴 수 있습니다."
              : "[↶ 마지막 반영 되돌리기]로 되돌릴 수 있습니다.";
        closeOnly();
        render();
      } catch (e) {
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
  panel(`${label}: 실행 전 확인`, "Claude Code가 이 폴더를 읽고 아래 파일만 고칩니다.");
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
      fact("결과", "바뀐 내용을 먼저 보여 드리고, [적용]을 눌러야 반영됩니다."),
    ),
  );
  panelButtons(
    button("실행", () => void runClaude(f, label), "btn primary"),
    button("취소", closePanel),
  );
  render();
}

async function runClaude(f: FindingView, label: string): Promise<void> {
  if (!current || !f.claudeTask) return;
  const path = current.path;
  const before = current.score;
  panel(`${label}: 실행 중`, "Claude가 폴더를 읽고 대상 파일만 고치고 있습니다.");
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
    if (r.status !== "ready") current = await api.diagnose(path);
  } catch (e) {
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
    panel(
      "마지막 반영 되돌리기",
      `${new Date(r.createdAt).toLocaleString()} 반영을 되돌립니다.` +
        (changed.length > 0
          ? " 반영 뒤 다시 바뀐 파일이 있어, 되돌리면 그 변경도 사라집니다."
          : ""),
      changed.length > 0 ? "error" : "",
    );
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
              locked = false;
              if (done.kind === "done") {
                panel(
                  done.ok ? "되돌렸습니다" : "일부를 되돌리지 못했습니다",
                  scoreChange(before, current.score),
                  done.ok ? "" : "error",
                );
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

function renderFinding(f: FindingView): HTMLElement {
  const acts = h("div", { class: "acts" });
  const blocked = busy || locked || (state?.running ?? false);
  if (f.fixNo !== undefined) {
    const no = f.fixNo;
    const b = keyed(
      button(f.fixLabel ?? "바로 고치기", () => void fix([no]), "btn small"),
      `fix:${f.id}`,
    );
    b.setAttribute("aria-label", `${f.fixLabel ?? "바로 고치기"}: ${f.message}`);
    b.disabled = blocked;
    acts.append(b);
  }
  if (f.claudeTask) {
    const label = f.claudeLabel ?? "Claude로 반영";
    const b = keyed(
      button(label, () => confirmClaude(f), "btn small"),
      `claude:${f.id}`,
    );
    b.setAttribute("aria-label", `${label}: ${f.message}`);
    const why = claudeBlocked();
    b.disabled = blocked || why !== null;
    acts.append(b);
    // 꺼진 이유는 마우스를 올리지 않아도 보이게 버튼 아래에 적는다
    if (why && !blocked) acts.append(h("div", { class: "why-off" }, why));
  }

  // [자세히]·[예시 보기]: 누르면 아래에 펼친다. 다시 그려도 펼친 상태를 기억한다
  // 진단 문장이 " / "로 이어져 있으면 첫 문장만 크게, 나머지는 보조 줄로
  const [head, ...rest] = f.message.split(" / ");
  const body = h(
    "div",
    {},
    h("div", { class: "msg" }, head ?? f.message),
    ...rest.map((r) => h("div", { class: "sub" }, r)),
  );
  // 버튼이 할 일을 대신 말해 주면 안내 문장은 생략한다
  if (f.judgment && f.fixNo === undefined && !f.claudeTask)
    body.append(h("div", { class: "judgment" }, f.judgment));
  const toggles = h("div", {});
  const more = h("div", {});
  const toggle = (key: string, label: string, make: () => HTMLElement) => {
    const id = `${f.id}:${key}`;
    const open = expanded.has(id);
    const t = keyed(
      h(
        "button",
        { class: "linkish", type: "button" },
        open ? (label === "자세히" ? "설명 접기" : "예시 접기") : label,
      ),
      id,
    );
    t.setAttribute("aria-expanded", String(expanded.has(id)));
    t.addEventListener("click", () => {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
    });
    toggles.append(t);
    if (expanded.has(id)) more.append(make());
  };
  const d = f.detail;
  if (d && f.severity !== "ok")
    toggle("detail", "자세히", () =>
      h(
        "div",
        { class: "more" },
        h("p", {}, h("b", {}, "왜 문제인가 "), d.why),
        d.fix ? h("p", {}, h("b", {}, "고치면 "), d.fix) : null,
        d.limit ? h("p", {}, h("b", {}, "남는 한계 "), d.limit) : null,
      ),
    );
  const example = f.example;
  if (example)
    toggle("example", "예시 보기", () =>
      h(
        "div",
        { class: "example" },
        h("div", { class: "example-label" }, "예시"),
        h("pre", {}, example),
      ),
    );
  if (toggles.childElementCount > 0) body.append(toggles, more);

  // 이 폴더 종류에 해당하지 않는 항목은 회색 "해당 없음" (통과로 세지 않음)
  const na = f.notApplicable === true;
  return h(
    "div",
    { class: `finding ${na ? "na" : f.severity}` },
    h(
      "span",
      { class: `badge ${na ? "na" : f.severity}` },
      h("span", { class: "sr-only" }, na ? "해당 없음" : SEVERITY[f.severity]),
      na ? icon("na") : icon(f.severity),
    ),
    body,
    acts,
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
  if (!c) return h("span", {}, "확인 중");
  if (!c.ok)
    return h(
      "span",
      { class: "error" },
      `✗ ${c.error ?? "찾지 못함"} — "Claude로 반영" 버튼이 꺼집니다`,
    );
  const version = `설치됨 ${c.version ?? ""}`.trim();
  if (c.loggedIn === false)
    return h(
      "span",
      { class: "error" },
      `✓ ${version} · ✗ 로그인 필요 — 터미널에서 claude를 실행해 /login 한 뒤 [다시 확인]`,
    );
  if (c.loggedIn)
    return h(
      "span",
      { class: "ok-text" },
      `✓ ${version} · 로그인됨${c.account ? ` (${c.account}${c.plan ? ` · ${c.plan}` : ""})` : ""}`,
    );
  return h("span", { class: "ok-text" }, `✓ ${version} (로그인 여부는 확인할 수 없는 버전)`);
}

function render(): void {
  if (state) {
    $("recent").replaceChildren(
      ...(state.recent.length === 0
        ? [h("li", { class: "small muted" }, "아직 없음")]
        : state.recent.map((r) => {
            const score = r.score !== undefined ? `${r.score}점` : "";
            const b = keyed(
              h(
                "button",
                { type: "button", title: r.path },
                h(
                  "span",
                  { class: "recent-text" },
                  h("span", { class: "name" }, folderName(r.path)),
                  h("span", { class: "where" }, r.path),
                ),
                h("span", { class: "pts" }, score + (r.kind ? " · 직접 지정" : "")),
              ),
              `recent:${r.path}`,
            );
            b.setAttribute("aria-label", `${folderName(r.path)} ${score} — ${r.path}`);
            b.addEventListener("click", () => void openFolder(r.path));
            return h("li", {}, b);
          })),
    );
    // 사내 표준: 이름·버전과 파일 이름만, 전체 경로는 마우스를 올리면
    const si = state.standardInfo;
    const std = $("standard");
    std.textContent = `${si.name} ${si.version}${si.file ? ` · ${si.file}` : " · 기본 내장"}`;
    std.title = si.path ?? "";
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
  for (const id of ["open", "empty-open", "pick-standard", "reset-standard", "claude-recheck"])
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
  const KIND_NAME = { dev: "개발 저장소", docs: "문서·기획 폴더" };
  const kn = $("kind-note");
  kn.textContent = !current
    ? "폴더를 열면 자동으로 판별합니다"
    : current.kindAuto
      ? `자동 판별: ${current.kindReason}`
      : `직접 지정: ${KIND_NAME[current.kind]} 기준으로 봅니다. 자동 판별은 ${KIND_NAME[current.kindGuess]}입니다 (${current.kindReason})`;
  kn.className = `small ${current && !current.kindAuto ? "warn-text" : "muted"}`;
  $("kind-auto").hidden = !current || current.kindAuto;

  $("empty").hidden = current !== null;
  $("report").hidden = current === null;
  if (!current) return;
  $("path").textContent = folderName(current.path);
  $("path-full").textContent = current.path;
  const n = $("notice");
  n.hidden = !notice;
  n.textContent = notice;
  ($("show-folder") as HTMLButtonElement).disabled = blocked;
  const score = $("score");
  score.textContent = String(current.score);
  score.className = `score ${current.score >= READY_SCORE ? "good" : current.score >= 50 ? "mid" : "bad"}${loading ? " stale" : ""}`;
  $("goal").textContent = loading
    ? "점검 중…"
    : current.score >= READY_SCORE
      ? "준비됨"
      : `${READY_SCORE}점 이상이면 준비됨`;
  $("counts").textContent =
    `위험 ${current.counts.fail} · 주의 ${current.counts.warn} · 통과 ${current.counts.ok}`;
  const how = $("score-how");
  how.setAttribute("aria-expanded", String(expanded.has("score:how")));
  const howText = $("score-how-text");
  howText.hidden = !expanded.has("score:how");
  howText.textContent = `100점에서 위험 1건마다 ${current.weights.fail}점, 주의 1건마다 ${current.weights.warn}점을 뺍니다 (감점은 사내 표준 파일에서 정합니다). ${READY_SCORE}점 이상이면 팀이 같은 기준으로 안전하게 쓸 준비가 된 것으로 봅니다. 폴더 종류(개발 저장소·문서 폴더)에 따라 보는 항목이 다릅니다.`;
  $("std-line").textContent = `사내 표준: ${current.standardName}`;
  const blockedNote = $("blocked");
  blockedNote.hidden = !current.blocked;
  blockedNote.textContent = current.blocked
    ? `.claude/settings.json을 쓸 수 없어 설정 고치기를 막았습니다: ${current.blocked}`
    : "";

  // 다음 할 일: 바로 고칠 수 있는 것을 한 번에 (진한 버튼은 이것 하나)
  const fixAll = $("fix-all") as HTMLButtonElement;
  fixAll.hidden = current.fixes.length === 0;
  fixAll.textContent =
    `바로 고칠 수 있는 ${current.fixes.length}개 고치기` +
    (current.expectedScore !== undefined && current.expectedScore > current.score
      ? ` → 약 ${current.expectedScore}점`
      : "");
  fixAll.disabled = blocked;
  const undoBtn = $("undo") as HTMLButtonElement;
  undoBtn.disabled = blocked || !current.canUndo;
  undoBtn.title = current.canUndo ? "" : "이 폴더에서 되돌릴 반영 기록이 없습니다";
  const rerun = $("rerun") as HTMLButtonElement;
  rerun.disabled = blocked;
  rerun.textContent = loading ? "점검 중…" : "다시 점검";
  ($("save-report") as HTMLButtonElement).disabled = blocked;

  // 통과 항목 숨기기: 영역에 문제가 없으면 "모두 통과 (N개)" 한 줄만
  ($("hide-ok") as HTMLInputElement).checked = hideOk;
  const active = document.activeElement as HTMLElement | null;
  const activeKey = $("areas").contains(active) ? (active?.dataset.key ?? null) : null;
  // 영역 제목 옆에 영역 상태, 이 폴더 종류에서 보지 않는 영역은 한 줄로 남긴다
  const AREAS: { area: string; title: string }[] = [
    { area: "security", title: "보안" },
    { area: "team", title: "팀 표준 (CLAUDE.md)" },
    { area: "docs", title: "문서·구조" },
    { area: "plugins", title: "스킬·플러그인" },
  ];
  $("areas").replaceChildren(
    ...AREAS.map(({ area, title }) => {
      const a = current?.areas.find((x) => x.area === area);
      if (!a)
        return h(
          "section",
          { class: "area" },
          areaHead(title, "해당 없음", "na"),
          h(
            "div",
            { class: "passed-note muted-note" },
            current?.kind === "docs"
              ? "문서·기획 폴더에서는 보는 항목이 없습니다"
              : "사내 표준에 이 영역의 항목이 없습니다",
          ),
        );
      const fail = a.findings.filter((f) => f.severity === "fail" && !f.notApplicable).length;
      const warn = a.findings.filter((f) => f.severity === "warn" && !f.notApplicable).length;
      const status =
        fail + warn === 0
          ? "모두 통과"
          : [fail ? `위험 ${fail}` : "", warn ? `주의 ${warn}` : ""].filter(Boolean).join(" · ");
      const tone = fail ? "fail" : warn ? "warn" : "ok";
      const shown = hideOk ? a.findings.filter((f) => f.severity !== "ok") : a.findings;
      const passed = a.findings.length - shown.length;
      return h(
        "section",
        { class: "area" },
        areaHead(a.title, status, tone),
        ...shown.map(renderFinding),
        hideOk && passed > 0 ? passedNote(shown.length === 0, passed) : null,
      );
    }),
  );
  if (activeKey && !$("areas").contains(document.activeElement)) focusKey(activeKey);
}

function areaHead(title: string, status: string, tone: string): HTMLElement {
  return h("h2", {}, title, h("span", { class: `area-status ${tone}` }, status));
}

// 숨긴 통과 항목: 누르면 숨기기를 끈다
function passedNote(allPassed: boolean, n: number): HTMLElement {
  const b = h(
    "button",
    { class: "linkish", type: "button" },
    allPassed ? `모두 통과 (${n}개) · 보기` : `통과 ${n}개 숨김 · 보기`,
  );
  b.addEventListener("click", () => {
    setHideOk(false);
  });
  return h("div", { class: "passed-note" }, b);
}

function setHideOk(v: boolean): void {
  hideOk = v;
  try {
    localStorage.setItem("hideOk", v ? "1" : "0");
  } catch {
    // 기억하지 못해도 이번 실행에는 적용된다
  }
  render();
}

// ---- 시작 ----

$("open").addEventListener("click", () => void openFolder());
$("show-folder").addEventListener("click", () => {
  if (current) void api.showFolder(current.path).catch(showError);
});
$("open-guide").addEventListener("click", () => void api.openGuide().catch(showError));
$("hide-ok").addEventListener("change", (e) => setHideOk((e.target as HTMLInputElement).checked));
$("score-how").addEventListener("click", () => {
  if (expanded.has("score:how")) expanded.delete("score:how");
  else expanded.add("score:how");
  render();
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
  }
});
$("empty-open").addEventListener("click", () => void openFolder());
for (const id of ["kind-dev", "kind-docs"])
  $(id).addEventListener("change", (e) => {
    const kind = (e.target as HTMLInputElement).value as Kind;
    if (current) void load(current.path, kind);
  });
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
// Esc로 패널 닫기 (Claude 실행 중에는 닫기 버튼이 없으므로 닫지 않는다)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("panel").hidden && !$("panel-close").hidden) closePanel();
});
$("pick-standard").addEventListener("click", () => {
  void api
    .pickStandard()
    .then(async (s) => {
      state = s;
      if (current) await load(current.path);
      else render();
    })
    .catch(showError);
});
$("reset-standard").addEventListener("click", () => {
  locked = true;
  panel(
    "기본 표준으로 되돌릴까요?",
    "사내 표준 파일 대신 앱에 들어 있는 기본 표준으로 진단합니다. 표준 파일은 지우지 않고, [표준 파일 선택]으로 다시 고를 수 있습니다.",
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
