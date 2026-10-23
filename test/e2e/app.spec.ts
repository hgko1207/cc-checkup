// 설치형 앱 E2E (eng review R6): 폴더 열기 → 진단 → 바로 고치기 → 되돌리기.
// 네이티브 폴더 선택 창은 자동화할 수 없어 CC_CHECKUP_E2E_PICK으로 고를 폴더를 정한다.
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

let app: ElectronApplication;
let repo: string;

test.beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "cc-e2e-repo-"));
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "CLAUDE.md"), "# 앱\nnpm run test\n");
  // VS Code 터미널 등에서 물려받은 ELECTRON_RUN_AS_NODE가 있으면 Electron이 Node로 떠서 뺀다
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  void _;
  app = await electron.launch({
    args: ["dist/app/main.js"],
    cwd: process.cwd(),
    env: {
      ...env,
      CC_CHECKUP_E2E_PICK: repo,
      CC_CHECKUP_USER_DATA: await mkdtemp(join(tmpdir(), "cc-e2e-data-")),
      CC_CHECKUP_HOME: await mkdtemp(join(tmpdir(), "cc-e2e-home-")),
    },
  });
});

test.afterAll(async () => {
  await app?.close();
});

test("렌더러는 Node에 접근할 수 없고 정해진 함수만 보인다", async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { name: "점검할 폴더를 여세요" })).toBeVisible();
  const probe = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    api: Object.keys((window as unknown as { ccCheckup: object }).ccCheckup).sort(),
  }));
  expect(probe.require).toBe("undefined");
  expect(probe.process).toBe("undefined");
  expect(probe.api).toEqual(
    [
      "claude",
      "commit",
      "diagnose",
      "fix",
      "getState",
      "onEvent",
      "showFolder",
      "openGuide",
      "openUpdate",
      "pickFolder",
      "pickStandard",
      "saveReport",
      "undo",
    ].sort(),
  );
  const denied = await page.evaluate(() =>
    (window as unknown as { ccCheckup: { diagnose(p: string): Promise<unknown> } }).ccCheckup
      .diagnose("C:\\Windows")
      .then(
        () => "ok",
        (e: Error) => e.message,
      ),
  );
  expect(denied).toContain("허용되지 않은 폴더");
});

test("폴더 열기 → 진단 → 바로 고치기 → 되돌리기", async () => {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "폴더 열기…" }).click();
  await expect(page.locator("#path-full")).toHaveText(repo);
  const before = Number(await page.locator("#score").textContent());
  expect(before).toBeLessThan(100);
  await expect(page.locator("#headline")).not.toBeEmpty();
  await expect(page.locator("#breakdown")).toContainText("100점에서");
  await expect(page.locator(".todo-head").first()).toBeVisible();

  // Esc로 패널을 닫으면 포커스가 누른 버튼으로 돌아온다
  const fixAll = page.getByRole("button", { name: /바로 고칠 수 있는 \d+개 고치기/ });
  await fixAll.click();
  await expect(page.locator("#panel-title")).toHaveText("바뀔 내용 확인");
  // 모달: 뒤 화면은 inert, Shift+Tab·Tab을 여러 번 눌러도 패널 밖으로 나가지 않는다
  expect(await page.evaluate(() => (document.querySelector(".side") as HTMLElement).inert)).toBe(
    true,
  );
  for (const key of ["Shift+Tab", "Shift+Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    expect(
      await page.evaluate(() => document.getElementById("panel")!.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
  await expect(fixAll).toBeFocused();

  // Ctrl+Enter: 확인창이 없으면 맨 위 주 버튼(바로 고치기)
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#panel-title")).toHaveText("바뀔 내용 확인");
  await expect(page.locator(".file-path").first()).toContainText(".claude/settings.json");
  // 미리 보는 동안 다른 고치기 버튼은 꺼진다
  await expect(page.getByRole("button", { name: "다시 점검" })).toBeDisabled();
  // 미리 보기의 예상 점수가 적용 후 실제 점수와 같다
  const summary = (await page.locator("#panel-message").textContent()) ?? "";
  const expected = Number(/고치면 \d+ → (\d+)점/.exec(summary)?.[1]);
  expect(expected).toBeGreaterThan(before);
  await page.locator("#panel-btns").getByRole("button", { name: "적용" }).click();
  await expect(page.locator("#panel-title")).toHaveText("적용했습니다");
  await expect(page.locator("#score")).toHaveText(String(expected));
  await expect(page.locator("#panel-message")).toContainText(`점수 ${before} →`);
  expect(await exists(join(repo, ".claude", "settings.json"))).toBe(true);
  await expect
    .poll(async () => Number(await page.locator("#score").textContent()))
    .toBeGreaterThan(before);

  await page.getByRole("button", { name: "마지막 반영 되돌리기" }).click();
  await expect(page.locator("#panel-title")).toHaveText("마지막 반영 되돌리기");
  await page.locator("#panel-btns").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.locator("#panel-title")).toHaveText("되돌렸습니다");
  expect(await exists(join(repo, ".claude"))).toBe(false);
  await expect.poll(async () => Number(await page.locator("#score").textContent())).toBe(before);

  // 점검 기준 탭(Ctrl+2): 적용 중인 표준과 보는 항목 전체, 용어 풀이
  await page.keyboard.press("Control+2");
  await expect(page.getByRole("tab", { name: "점검 기준" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#crit-title")).toContainText("점검 항목");
  await expect(page.locator("#criteria")).toContainText("팀 공용 설정 파일");
  await expect(page.locator("#glossary")).toContainText("권한 우회 모드");

  // 폴더 종류: CLAUDE.md만 있는 폴더는 문서 폴더로 판별, 개발 저장소로 바꾸면 검증 명령을 본다
  await expect(page.locator("#kind-docs")).toBeChecked();
  await expect(page.locator("#criteria")).not.toContainText("검증 명령");
  await expect(page.locator("#kind-note")).toContainText("자동 판별");
  await page.locator("#kind-dev").check();
  await expect(page.locator("#kind-note")).toContainText("직접 지정: 개발 저장소 기준");
  await expect(page.locator("#kind-note")).toContainText("자동 판별은 문서·기획 폴더");
  await expect(page.locator("#notice")).toContainText("폴더 종류를 바꿔");
  // 다시 점검 뒤에도 키보드 포커스가 라디오에 남는다
  await expect(page.locator("#kind-dev")).toBeFocused();
  await expect(page.locator("#criteria")).toContainText("검증 명령");
  await page.getByRole("button", { name: "자동 판별로 되돌리기" }).click();
  await expect(page.locator("#kind-docs")).toBeChecked();

  // 점검 결과 탭: 할 일을 누르면 이유가 펼쳐진다
  await page.getByRole("tab", { name: "점검 결과" }).click();
  const firstTodo = page.locator(".todo-head").first();
  await firstTodo.click();
  await expect(firstTodo).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".todo-body").first()).toContainText("왜 문제인가요");

  // 통과 항목은 접혀 있고 누르면 펼친다
  const passed = page.locator("#passed-toggle");
  await expect(page.locator(".passed-item").first()).toBeHidden();
  await passed.click();
  await expect(page.locator(".passed-item").first()).toBeVisible();
  await passed.click();
  await expect(page.locator(".passed-item").first()).toBeHidden();

  // F5로 다시 점검
  await page.keyboard.press("F5");
  await expect(page.locator("#rerun")).toHaveText("다시 점검");

  // 최근 폴더에 점수와 함께 남는다
  await expect(page.locator("#recent")).toContainText(`${before}점`);
});
