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

test("explains when onboarding workspace contains no git repositories", async ({ page }) => {
  await launchApp(page, {
    settings: createSettings({
      onboardingDone: false,
      rootDirs: [],
      outputEnabled: false,
      outputDir: "",
      author: "",
    }),
    dialogResponses: [["C:/empty-workspace"]],
    scanRepos: [],
    gitIdentity: {
      userName: "Playwright Tester",
      userEmail: "playwright@example.com",
    },
  });

  await page.getByRole("button", { name: "开始配置" }).click();
  await page.getByRole("button", { name: /点击选择文件夹|继续添加目录/ }).click();

  await expect(page.getByText("暂未发现 Git 仓库")).toBeVisible();
  await expect(page.getByText("目录本身或子目录需要包含 `.git`。")).toBeVisible();
  await expect(page.getByText("公司同步盘或权限受限目录可能需要换到本地路径。")).toBeVisible();

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("Git 作者")).toHaveValue("Playwright Tester");
});

test("renders onboarding setup with dark theme surfaces", async ({ page }) => {
  await launchApp(page, {
    settings: createSettings({
      onboardingDone: false,
      rootDirs: [],
      outputEnabled: false,
      outputDir: "",
      author: "",
      themeMode: "dark",
    }),
    dialogResponses: [["C:/empty-workspace"]],
    scanRepos: [],
    gitIdentity: {
      userName: "Playwright Tester",
      userEmail: "playwright@example.com",
    },
  });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "开始配置" }).click();
  await page.getByRole("button", { name: /点击选择文件夹|继续添加目录/ }).click();
  await expect(page.getByText("暂未发现 Git 仓库")).toBeVisible();

  const setupColors = await page.evaluate(() => {
    const card = document.querySelector(".onboarding-card");
    const emptyWorkspace = document.querySelector(".onboarding-empty-workspace");
    return {
      cardBackground: card ? getComputedStyle(card).backgroundColor : "",
      emptyWorkspaceBackground: emptyWorkspace ? getComputedStyle(emptyWorkspace).backgroundColor : "",
    };
  });

  expect(cssRgbBrightness(setupColors.cardBackground)).toBeLessThan(90);
  expect(cssRgbBrightness(setupColors.emptyWorkspaceBackground)).toBeLessThan(110);

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("Git 作者")).toHaveValue("Playwright Tester");

  const authorInputBackground = await page.getByLabel("Git 作者").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(cssRgbBrightness(authorInputBackground)).toBeLessThan(70);
});

function cssRgbBrightness(value: string) {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  expect(channels).toHaveLength(3);
  return (channels[0] + channels[1] + channels[2]) / 3;
}
