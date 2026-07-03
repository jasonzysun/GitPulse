import { expect, test } from "@playwright/test";
import {
  createHistoryEntry,
  createRepo,
  createRepoCache,
  createSettings,
  expectWorkbench,
  launchApp,
} from "./support/tauri";

const repos = [createRepo("C:/workspace/gitpulse", "gitpulse", "main")];
const settings = createSettings({
  rootDirs: ["C:/workspace"],
  outputEnabled: true,
  outputDir: "C:/exports",
  author: "Playwright Tester",
});

test("renders mocked diagnostics in settings", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    diagnosticsResult: {
      items: [
        {
          id: "git",
          label: "Git 命令",
          severity: "ok",
          message: "Git 命令可用。",
          action: "",
        },
        {
          id: "network-github",
          label: "GitHub 网络",
          severity: "warning",
          message: "GitHub 可连接，但返回 HTTP 429。",
          action: "检查代理、公司网络策略或 GitHub 访问限制。",
        },
        {
          id: "output-dir",
          label: "输出目录",
          severity: "error",
          message: "输出目录不存在。",
          action: "请在设置中重新选择可用目录。",
        },
      ],
      okCount: 1,
      warningCount: 1,
      errorCount: 1,
    },
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "诊断" }).click();

  await expect(page.getByText("1 异常")).toBeVisible();
  await expect(page.getByText("1 提醒")).toBeVisible();
  await expect(page.getByText("1 正常")).toBeVisible();
  await expect(page.getByText("Git 命令可用。")).toBeVisible();
  await expect(page.getByText("GitHub 可连接，但返回 HTTP 429。")).toBeVisible();
  await expect(page.getByText("请在设置中重新选择可用目录。")).toBeVisible();
});

test("generates and exports a daily report", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    extractResults: [
      {
        repos,
        summaryText: "# 今日工作报告\n\n- 完成浏览器级诊断校验\n- 接入 GitHub Actions 日常门禁",
        detailedText: "",
        warnings: [],
        commits: [{ id: 1 }, { id: 2 }],
      },
    ],
    outputDir: "C:/exports",
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: "生成日报" }).click();

  await expect(page.getByText("完成浏览器级诊断校验")).toBeVisible();
  await expect(page.getByText(/日报 · \d{4}-\d{2}-\d{2}/)).toBeVisible();

  await page.locator("button.preview-save-button").click();

  await expect(page.getByText(/输出文件：.*\.md/)).toBeVisible();
  await expect(page.locator(".history-badge.exported")).toBeVisible();

  const saveCalls = await page.evaluate(() =>
    window.__mockTauri.calls.filter((call) => call.cmd === "save_report_file"),
  );
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0].args.format).toBe("markdown");
});

test("shows actionable guidance for empty daily reports", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    extractResults: [
      {
        repos,
        summaryText: "- 未检索到提交记录。",
        detailedText: "",
        warnings: [],
        commits: [],
      },
    ],
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: "生成日报" }).click();

  await expect(page.getByText("本次报告没有匹配到提交")).toBeVisible();
  await expect(page.getByText(/日报 · \d{4}-\d{2}-\d{2} · 作者：Playwright Tester · 1 个启用仓库/)).toBeVisible();
  await expect(page.getByText("若已填写作者，请核对 Git name/email；留空会按全部作者提取。")).toBeVisible();
  await expect(page.getByRole("button", { name: "检查作者/分支" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新扫描仓库", exact: true })).toBeVisible();
});

test("generates and exports a weekly report", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    periodResults: {
      weekly: {
        reportText: "# 2026-W27 工作周报\n\n- 接入 Playwright 汶览器级端到端护栏\n- 补齐周报生成路径回归",
        outputFile: "C:/exports/weekly_report_2026-W27.md",
        warnings: [],
        periodLabel: "2026-W27",
        reportKind: "weekly",
        projectCount: 1,
        commitCount: 2,
      },
    },
    outputDir: "C:/exports",
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: "周报" }).click();
  await page.getByRole("button", { name: "生成周报" }).click();

  await expect(page.getByText("接入 Playwright 汶览器级端到端护栏")).toBeVisible();
  await expect(page.getByText(/周报 · 2026-W27/)).toBeVisible();
  await expect(page.getByText(/输出文件：.*weekly_report_2026-W27\.md/)).toBeVisible();

  await page.locator("button.preview-save-button").click();

  await expect(page.locator(".history-badge.exported")).toBeVisible();

  const generateCalls = await page.evaluate(() =>
    window.__mockTauri.calls.filter((call) => call.cmd === "generate_period_report"),
  );
  expect(generateCalls).toHaveLength(1);
  expect(generateCalls[0].args.options.reportKind).toBe("weekly");

  const saveCalls = await page.evaluate(() =>
    window.__mockTauri.calls.filter((call) => call.cmd === "save_report_file"),
  );
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0].args.format).toBe("markdown");
  expect(saveCalls[0].args.baseName).toContain("weekly_report_2026-W27");
});

test("generates and exports a monthly report", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    periodResults: {
      monthly: {
        reportText: "# 2026-06 工作月报\n\n- 完成报告逻辑拆分与导出能力加固\n- 修复 Conventional Commits scope 剥离",
        outputFile: "C:/exports/monthly_report_2026-06.md",
        warnings: [],
        periodLabel: "2026-06",
        reportKind: "monthly",
        projectCount: 2,
        commitCount: 5,
      },
    },
    outputDir: "C:/exports",
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: "月报" }).click();
  await page.getByRole("button", { name: "生成月报" }).click();

  await expect(page.getByText("完成报告逻辑拆分与导出能力加固")).toBeVisible();
  await expect(page.getByText(/月报 · 2026-06/)).toBeVisible();
  await expect(page.getByText(/输出文件：.*monthly_report_2026-06\.md/)).toBeVisible();

  await page.locator("button.preview-save-button").click();

  await expect(page.locator(".history-badge.exported")).toBeVisible();

  const generateCalls = await page.evaluate(() =>
    window.__mockTauri.calls.filter((call) => call.cmd === "generate_period_report"),
  );
  expect(generateCalls).toHaveLength(1);
  expect(generateCalls[0].args.options.reportKind).toBe("monthly");

  const saveCalls = await page.evaluate(() =>
    window.__mockTauri.calls.filter((call) => call.cmd === "save_report_file"),
  );
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0].args.baseName).toContain("monthly_report_2026-06");
});

test("opens and clears report history", async ({ page }) => {
  await launchApp(page, {
    settings,
    repoCache: createRepoCache(["C:/workspace"], repos),
    reportHistory: [
      createHistoryEntry({
        id: "history-weekly",
        mode: "weekly",
        title: "周报 · 2026-W27",
        periodLabel: "2026-W27",
        range: { startDate: "2026-06-29", endDate: "2026-07-05" },
        commitCount: 3,
        reportText: "# 2026年第27周工作周报\n\n- 处理诊断网络检查\n- 清理历史记录展示",
      }),
    ],
  });

  await expectWorkbench(page);
  await page.getByRole("button", { name: /周报 · 2026-W27/ }).click();
  await expect(page.getByText("处理诊断网络检查")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "清空" }).click();

  await expect(page.getByText("生成报告后会在这里保留最近记录，可重新打开、复制或按同一周期重新生成。")).toBeVisible();
});
