// 화면. 파일 내용·메시지는 모두 textContent로만 넣는다 (HTML로 해석하지 않음, eng review R1).
import type {
  AppState,
  CcCheckupApi,
  ClaudeView,
  DiagnosisView,
  FilePreview,
  FindingView,
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

function setBusy(v: boolean): void {
  busy = v;
  render();
}

// ---- 진행·변경 확인 패널 ----

function panel(title: string, message = "", tone: "" | "error" = ""): void {
  $("panel").hidden = false;
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
  $("panel-note").textContent = "";
  $("panel-close").hidden = false;
}

function panelButtons(...btns: HTMLButtonElement[]): void {
  $("panel-btns").replaceChildren(...btns);
}

function closePanel(): void {
  $("panel").hidden = true;
}

function showError(e: unknown): void {
  panel("오류", (e as Error).message ?? String(e), "error");
  panelButtons(button("닫기", closePanel));
}

function diffBlock(path: string, diff: string, label = ""): HTMLElement {
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
  return h("div", { class: "diff" }, h("div", { class: "diff-title" }, path + label), pre);
}

function logLine(p: Progress): void {
  const log = $("log");
  log.hidden = false;
  let text = "";
  let cls = "";
  if (p.kind === "start") text = `Claude 시작${p.model ? ` (${p.model})` : ""}`;
  else if (p.kind === "text") text = p.text.trim().split("\n")[0] ?? "";
  else if (p.kind === "tool") text = `${p.name}${p.detail ? ` ${p.detail}` : ""}`;
  else if (p.kind === "tool-error") {
    text = `거부됨: ${p.text.split("\n")[0] ?? ""}`;
    cls = "err";
  } else if (p.kind === "result")
    text = `끝 (${p.ok ? "성공" : "실패"}${p.costUsd !== undefined ? `, $${p.costUsd.toFixed(2)}` : ""})`;
  if (!text) return;
  log.append(h("li", { class: cls }, text));
  log.scrollTop = log.scrollHeight;
}

// ---- 동작 ----

async function refreshState(): Promise<void> {
  state = await api.getState();
  render();
}

async function load(path: string): Promise<void> {
  setBusy(true);
  try {
    current = await api.diagnose(path);
    state = await api.getState();
  } catch (e) {
    showError(e);
  } finally {
    setBusy(false);
  }
}

async function openFolder(recent?: string): Promise<void> {
  try {
    const path = await api.pickFolder(recent);
    if (path !== null) {
      closePanel();
      await load(path);
    }
  } catch (e) {
    showError(e);
  }
}

async function fix(nos: number[]): Promise<void> {
  if (!current) return;
  const path = current.path;
  setBusy(true);
  try {
    const r = await api.fix(path, nos, false);
    if (r.kind !== "preview") return;
    panel("바뀔 내용 확인", "아래 내용을 적용할까요? 적용 전 원본은 자동으로 백업됩니다.");
    $("diffs").replaceChildren(
      ...r.previews.map((p: FilePreview) => diffBlock(p.path, p.diff, p.isNew ? " (새 파일)" : "")),
    );
    panelButtons(
      button(
        "적용",
        () => {
          void (async () => {
            setBusy(true);
            try {
              const done = await api.fix(path, nos, true);
              if (done.kind === "applied") {
                panel("적용했습니다", done.commitHint);
                $("panel-note").textContent = `원본 백업: ${done.backupDir}`;
                panelButtons(button("닫기", closePanel));
              }
              current = await api.diagnose(path);
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

function claudeResult(r: ClaudeView, path: string): void {
  $("panel-close").hidden = false;
  const titles: Record<string, string> = {
    ready: "Claude가 고친 내용 확인",
    unchanged: "바뀐 내용 없음",
    cancelled: "중단됨",
    timeout: "시간 초과",
    outside: "반영하지 않았습니다",
    error: "Claude 실행 실패",
    busy: "실행 중",
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
  $("diffs").replaceChildren(...r.diffs.map((d) => diffBlock(d.path, d.diff)));
  const finish = (action: "keep" | "discard") => () => {
    void (async () => {
      try {
        const done = await api.claude({ type: action });
        panel(action === "keep" ? "적용했습니다" : "취소했습니다", done.message);
        if (action === "keep")
          $("panel-note").textContent = "변경을 커밋해야 팀원 전원에게 적용됩니다";
        panelButtons(button("닫기", closePanel));
        current = await api.diagnose(path);
        state = await api.getState();
        render();
      } catch (e) {
        showError(e);
      }
    })();
  };
  if (r.status === "ready")
    panelButtons(button("적용", finish("keep"), "btn primary"), button("취소", finish("discard")));
  else panelButtons(button("닫기", closePanel));
}

async function runClaude(f: FindingView): Promise<void> {
  if (!current || !f.claudeTask) return;
  const path = current.path;
  panel(
    `${f.claudeLabel ?? "Claude로 반영"}: 실행 중`,
    "Claude가 폴더를 읽고 대상 파일만 고칩니다. 최대 10분 걸릴 수 있습니다.",
  );
  $("log").hidden = false;
  panelButtons(
    button(
      "중단",
      () => {
        void api.claude({ type: "stop" }).catch(showError);
      },
      "btn danger",
    ),
  );
  $("panel-note").textContent = "실행 전 대상 파일을 백업했습니다. 중단하면 원래대로 되돌립니다.";
  $("panel-close").hidden = true; // 실행 중에는 중단 버튼을 가리지 않는다
  busy = true;
  render();
  try {
    const r = await api.claude({ type: "start", path, taskId: f.claudeTask });
    state = await api.getState();
    claudeResult(r, path);
    if (r.status !== "ready") current = await api.diagnose(path);
  } catch (e) {
    showError(e);
  } finally {
    setBusy(false);
  }
}

async function undo(): Promise<void> {
  if (!current) return;
  const path = current.path;
  setBusy(true);
  try {
    const r: UndoView = await api.undo(path, false);
    if (r.kind === "none") {
      panel("되돌리기", "이 폴더에서 되돌릴 반영 기록이 없습니다");
      panelButtons(button("닫기", closePanel));
      return;
    }
    if (r.kind !== "preview") return;
    const changed = r.items.filter((i) => i.modifiedSince && !i.alreadyOriginal);
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
              if (done.kind === "done") {
                panel(
                  done.ok ? "되돌렸습니다" : "일부를 되돌리지 못했습니다",
                  done.statuses
                    .map((s) => `${s.path}: ${s.status}${s.error ? ` (${s.error})` : ""}`)
                    .join(", "),
                  done.ok ? "" : "error",
                );
                panelButtons(button("닫기", closePanel));
              }
              current = await api.diagnose(path);
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
    panelButtons(button("닫기", closePanel));
  } catch (e) {
    showError(e);
  }
}

// ---- 그리기 ----

const ICON = { fail: "✗", warn: "!", ok: "✓" };

function renderFinding(f: FindingView): HTMLElement {
  const acts = h("div", { class: "acts" });
  const running = busy || (state?.running ?? false);
  if (f.fixNo !== undefined) {
    const no = f.fixNo;
    const b = button(f.fixLabel ?? "바로 고치기", () => void fix([no]), "btn primary small");
    b.disabled = running;
    acts.append(b);
  }
  if (f.claudeTask) {
    const b = button(f.claudeLabel ?? "Claude로 반영", () => void runClaude(f), "btn small");
    b.disabled = running || !state?.claude.ok;
    if (!state?.claude.ok) b.title = "Claude Code를 설치하고 로그인하면 쓸 수 있습니다";
    acts.append(b);
  }
  return h(
    "div",
    { class: `finding ${f.severity}` },
    h("span", { class: `badge ${f.severity}`, title: f.severity }, ICON[f.severity]),
    h(
      "div",
      {},
      h("div", { class: "msg" }, f.message),
      f.judgment && f.fixNo === undefined ? h("div", { class: "judgment" }, f.judgment) : null,
    ),
    acts,
  );
}

function render(): void {
  if (state) {
    $("recent").replaceChildren(
      ...(state.recent.length === 0
        ? [h("li", { class: "small muted" }, "아직 없음")]
        : state.recent.map((r) => {
            const b = h(
              "button",
              { type: "button", title: r.path },
              h("span", { class: "name" }, r.path),
              h("span", { class: "pts" }, r.score !== undefined ? `${r.score}점` : ""),
            );
            b.addEventListener("click", () => void openFolder(r.path));
            return h("li", {}, b);
          })),
    );
    $("standard").textContent = state.standard;
    const se = $("standard-error");
    se.hidden = !state.standardError;
    se.textContent = state.standardError ? `기본 표준으로 진단합니다: ${state.standardError}` : "";
    $("claude-status").replaceChildren(
      state.claude.ok
        ? h("span", { class: "ok-text" }, `✓ 설치됨 ${state.claude.version ?? ""}`)
        : h(
            "span",
            { class: "error" },
            `✗ ${state.claude.error ?? "찾지 못함"} — "Claude로 반영" 버튼이 꺼집니다`,
          ),
    );
  }

  const running = busy || (state?.running ?? false);
  for (const id of ["open", "pick-standard", "reset-standard"])
    ($(id) as HTMLButtonElement).disabled = running;

  $("empty").hidden = current !== null;
  $("report").hidden = current === null;
  if (!current) return;
  $("path").textContent = current.path;
  const score = $("score");
  score.textContent = String(current.score);
  score.className = `score ${current.score >= 80 ? "good" : current.score >= 50 ? "mid" : "bad"}`;
  $("counts").textContent =
    `위험 ${current.counts.fail} · 주의 ${current.counts.warn} · 통과 ${current.counts.ok}`;
  $("std-line").textContent = `사내 표준: ${current.standard}`;
  const blocked = $("blocked");
  blocked.hidden = !current.blocked;
  blocked.textContent = current.blocked
    ? `.claude/settings.json을 쓸 수 없어 설정 고치기를 막았습니다: ${current.blocked}`
    : "";

  const fixAll = $("fix-all") as HTMLButtonElement;
  fixAll.hidden = current.fixes.length < 2;
  fixAll.disabled = running;
  ($("undo") as HTMLButtonElement).disabled = running || !current.canUndo;
  ($("rerun") as HTMLButtonElement).disabled = running;
  ($("save-report") as HTMLButtonElement).disabled = running;

  $("areas").replaceChildren(
    ...current.areas.map((a) =>
      h("section", { class: "area" }, h("h3", {}, a.title), ...a.findings.map(renderFinding)),
    ),
  );
}

// ---- 시작 ----

$("open").addEventListener("click", () => void openFolder());
$("rerun").addEventListener("click", () => current && void load(current.path));
$("undo").addEventListener("click", () => void undo());
$("save-report").addEventListener("click", () => void saveReport());
$("fix-all").addEventListener("click", () => current && void fix(current.fixes.map((f) => f.no)));
$("panel-close").addEventListener("click", closePanel);
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
  void api
    .pickStandard(true)
    .then(async (s) => {
      state = s;
      if (current) await load(current.path);
      else render();
    })
    .catch(showError);
});
api.onEvent((e) => {
  if (e.type === "progress") logLine(e.progress);
});
void refreshState().catch(showError);
