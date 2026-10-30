// 한 건만 미리 볼 때 "고친 뒤 커밋하면" 점수가 그 한 건 기준인지 (전부 고친 점수가 아니라).
// 커밋 점수는 git 저장소에서만 나와서 app.spec.ts와 따로 띄운다.
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let app: ElectronApplication;

test.beforeAll(async () => {
  const repo = await mkdtemp(join(tmpdir(), "cc-e2e-git-"));
  await writeFile(join(repo, "CLAUDE.md"), "# 앱\nnpm run test\n");
  await writeFile(join(repo, "package.json"), '{ "name": "app" }\n');
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init");
  git("add", ".");
  git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-m", "init");
  // 커밋한 사람이 2명이라 팀 저장소로 추천된다 (혼자면 커밋 점수가 없다)
  await writeFile(join(repo, "README.md"), "# 앱\n");
  git("add", ".");
  git("-c", "user.name=b", "-c", "user.email=b@example.com", "commit", "-m", "readme");
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

test("한 건만 미리 보기: 커밋 뒤 점수는 그 한 건을 고친 점수 + 커밋", async () => {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "폴더 열기…" }).click();
  await expect(page.locator(".todo-head").first()).toBeVisible();

  await page.locator(".todo-head").first().click();
  await page
    .getByRole("button", { name: /^이 할 일만 고치기/ })
    .first()
    .click();
  await expect(page.locator("#panel-message")).toContainText("고친 뒤 커밋하면");
  const summary = (await page.locator("#panel-message").textContent()) ?? "";
  const after = Number(/고치면 \d+ → (\d+)점/.exec(summary)?.[1]);
  const committed = Number(/고친 뒤 커밋하면 (\d+)점/.exec(summary)?.[1]);
  expect(committed).toBe(Math.min(100, after + 15));
});
