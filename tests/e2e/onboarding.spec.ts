import { expect, test } from "@playwright/test";
import {
  createRepo,
  createSettings,
  expectWorkbench,
  launchApp,
} from "./support/tauri";

test("completes onboarding with mocked workspace scan", async ({ page }) => {
  const repos = [createRepo("C:/workspace/gitpulse", "gitpulse", "main")];

  await launchApp(page, {
    settings: createSettings({
      onboardingDone: false,
      rootDirs: [],
      outputEnabled: false,
      outputDir: "",
      author: "",
    }),
    dialogResponses: [["C:/workspace"]],
    scanRepos: repos,
    gitIdentity: {
      userName: "Playwright Tester",
      userEmail: "playwright@example.com",
    },
  });

  await expect(page.getByRole("heading", { name: "三步开始生成工作报告" })).toBeVisible();
  await page.getByRole("button", { name: "开始配置" }).click();
  await page.getByRole("button", { name: /点击选择文件夹|继续添加目录/ }).click();
  await expect(page.getByText("已发现 1 个 Git 仓库")).toBeVisible();

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("Git 作者")).toHaveValue("Playwright Tester");

  await page.getByLabel("Git 作者").fill("");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expectWorkbench(page);
  await expect(page.getByRole("button", { name: "全部作者" })).toBeVisible();
  await expect(page.locator(".repo-display-name").filter({ hasText: "gitpulse" })).toBeVisible();
});
