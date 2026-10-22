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
      "diagnose",
      "fix",
      "getState",
      "onEvent",
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
  await expect(page.getByText("보안", { exact: true })).toBeVisible();

  // Esc로 패널을 닫으면 포커스가 누른 버튼으로 돌아온다
  const fixAll = page.getByRole("button", { name: /바로 고칠 수 있는 \d+개 고치기/ });
  await fixAll.click();
  await expect(page.locator("#panel-title")).toHaveText("바뀔 내용 확인");
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
  await expect(fixAll).toBeFocused();

  await fixAll.click();
  await expect(page.locator("#panel-title")).toHaveText("바뀔 내용 확인");
  await expect(page.locator(".file-path").first()).toContainText(".claude/settings.json");
  // 미리 보는 동안 다른 고치기 버튼은 꺼진다
  await expect(page.getByRole("button", { name: "다시 점검" })).toBeDisabled();
  // 미리 보기의 예상 점수가 적용 후 실제 점수와 같다
  const summary = (await page.locator("#panel-message").textContent()) ?? "";
  const expected = Number(/예상 점수 \d+ → (\d+)점/.exec(summary)?.[1]);
  expect(expected).toBeGreaterThan(before);
  await page.locator("#panel-btns").getByRole("button", { name: "적용" }).click();
  await expect(page.locator("#panel-title")).toHaveText("적용했습니다");
  await expect(page.locator("#score")).toHaveText(String(expected));
  await expect(page.locator("#panel-message")).toContainText(`점수 ${before} →`);
  expect(await exists(join(repo, ".claude", "settings.json"))).toBe(true);
  await expect
    .poll(async () => Number(await page.locator("#score").textContent()))
    .toBeGreaterThan(before);

  await page.getByRole("button", { name: "↶ 마지막 반영 되돌리기" }).click();
  await expect(page.locator("#panel-title")).toHaveText("마지막 반영 되돌리기");
  await page.locator("#panel-btns").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.locator("#panel-title")).toHaveText("되돌렸습니다");
  expect(await exists(join(repo, ".claude"))).toBe(false);
  await expect.poll(async () => Number(await page.locator("#score").textContent())).toBe(before);

  // 폴더 종류: CLAUDE.md만 있는 폴더는 문서 폴더로 판별, 개발 저장소로 바꾸면 검증 명령을 본다
  await expect(page.locator("#kind-docs")).toBeChecked();
  await expect(page.locator("#kind-note")).toContainText("자동 판별");
  await page.locator("#kind-dev").check();
  await expect(page.locator("#kind-note")).toHaveText("직접 고른 종류입니다");
  await expect(page.getByText("CLAUDE.md에 검증 명령이 있습니다")).toBeVisible();
  await page.getByRole("button", { name: "자동 판별로 되돌리기" }).click();
  await expect(page.locator("#kind-docs")).toBeChecked();

  // [자세히]를 누르면 이유가 펼쳐진다
  await page.getByRole("button", { name: "자세히" }).first().click();
  await expect(page.locator(".more").first()).toContainText("왜 문제인가");

  // 통과 항목 숨기기
  await page.getByLabel("통과 항목 숨기기").check();
  await expect(page.locator(".finding.ok")).toHaveCount(0);
  await page.getByLabel("통과 항목 숨기기").uncheck();
  await expect(page.locator(".finding.ok").first()).toBeVisible();

  // F5로 다시 점검
  await page.keyboard.press("F5");
  await expect(page.locator("#rerun")).toHaveText("다시 점검");

  // 최근 폴더에 점수와 함께 남는다
  await expect(page.locator("#recent")).toContainText(`${before}점`);
});
