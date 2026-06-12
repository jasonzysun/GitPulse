import { useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
import { check, type Update as PendingAppUpdate } from "@tauri-apps/plugin-updater";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { SettingsDialog } from "./components/SettingsDialog";
import { Workbench } from "./components/Workbench";
import {
  type AppSettings,
  type DateRange,
  type ExtractResult,
  type GitIdentity,
  type LoadedSettingsState,
  type MonthlyReportResult,
  type PreviewMode,
  type RepoInfo,
  type UpdateSummary,
  STORAGE_KEY,
  buildExtractOptions,
  buildMonthlyOptions,
  getTodayRange,
  loadSettingsState,
  parseProjectNames,
  validateExtractSettings,
  validateMonthlySettings,
  validateOutputSettings,
  validateRequiredSettings,
  validateWorkspaceSettings,
} from "./model";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/preview.css";
import "./styles/dialogs.css";
import "./styles/onboarding.css";
import "./styles/theme.css";

type CopyNotice = {
  id: number;
  message: string;
  tone: "success" | "error";
};

function App() {
  const [loadedSettings] = useState<LoadedSettingsState>(loadSettingsState);
  const [settings, setSettings] = useState<AppSettings>(loadedSettings.settings);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [customReport, setCustomReport] = useState("");
  const [customRange, setCustomRange] = useState<DateRange>(getTodayRange);
  const [monthlyReport, setMonthlyReport] = useState("");
  const [monthlyLabel, setMonthlyLabel] = useState("");
  const [activePreview, setActivePreview] = useState<PreviewMode>("summary");
  const [status, setStatus] = useState(
    loadedSettings.recoveredLegacyApiKey ? "已迁移旧配置中的 API Key" : "就绪",
  );
  const [copyNotice, setCopyNotice] = useState<CopyNotice | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastOutputFile, setLastOutputFile] = useState("");
  const [commitCount, setCommitCount] = useState(0);
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);
  const [appVersion, setAppVersion] = useState("读取中");
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [updateMessage, setUpdateMessage] = useState("当前版本信息读取中");
  const [updateProgress, setUpdateProgress] = useState("");
  const [updateBusy, setUpdateBusy] = useState<"checking" | "installing" | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingAppUpdate | null>(null);

  const projectNames = useMemo(() => parseProjectNames(settings.projectNamesText), [settings.projectNamesText]);
  const previewText = activePreview === "monthly" ? monthlyReport : activePreview === "custom" ? customReport : summaryText;
  const resolvedTheme = settings.themeMode === "system" ? systemTheme : settings.themeMode;
  const aiConfigured =
    settings.aiProvider === "codex-oauth"
      ? Boolean(settings.aiModel.trim())
      : Boolean(settings.aiBaseUrl.trim() && settings.aiModel.trim() && settings.aiApiKey.trim());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    getVersion()
      .then((version) => {
        setAppVersion(version);
        setUpdateMessage(`当前版本 v${version}，可手动检查更新`);
      })
      .catch(() => {
        setAppVersion("开发环境");
        setUpdateMessage("当前是浏览器预览，在线更新仅在桌面应用中可用");
      });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onMediaChange);

    let unlistenTheme: (() => void) | undefined;
    try {
      const appWindow = getCurrentWindow();
      appWindow.theme().then((theme) => theme && setSystemTheme(theme)).catch(() => undefined);
      appWindow.onThemeChanged(({ payload }) => setSystemTheme(payload)).then((unlisten) => {
        unlistenTheme = unlisten;
      }).catch(() => undefined);
    } catch {
      // Running in a browser-only preview has no Tauri window API.
    }

    return () => {
      media.removeEventListener("change", onMediaChange);
      unlistenTheme?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    try {
      getCurrentWindow().setTheme(settings.themeMode === "system" ? null : settings.themeMode).catch(() => undefined);
    } catch {
      // Browser-only preview fallback.
    }
  }, [resolvedTheme, settings.themeMode]);

  useEffect(() => {
    if (settings.author) return;

    invoke<GitIdentity>("get_git_identity")
      .then((identity) => {
        if (!identity.userName) return;
        setSettings((current) => {
          if (current.author) return current;
          return { ...current, author: identity.userName };
        });
        setStatus(`已读取本机 Git 作者：${identity.userName}`);
      })
      .catch(() => {
        setStatus("未读取到本机 Git 作者，可手动填写");
      });
  }, []);

  useEffect(() => {
    if (!settings.rootDir) return;
    scanWorkspace();
  }, [settings.rootDir]);

  useEffect(() => {
    return () => {
      pendingUpdate?.close().catch(() => undefined);
    };
  }, [pendingUpdate]);

  async function chooseDirectory(field: "rootDir" | "outputDir") {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") updateSetting(field, selected);
  }

  async function scanWorkspace() {
    await runTask("正在扫描仓库", async () => {
      const result = await invoke<RepoInfo[]>("scan_repos", { rootDir: settings.rootDir });
      setRepos(result);
      setStatus(`已发现 ${result.length} 个仓库`);
    }, () => validateWorkspaceSettings(settings));
  }

  async function extractCommits() {
    await runTask("正在提取提交记录", async () => {
      const dailyRange = getTodayRange();
      const result = await invoke<ExtractResult>("extract_commits", {
        options: buildExtractOptions(settings, projectNames, dailyRange, false),
      });
      setRepos(result.repos);
      setSummaryText(result.detailedText || result.summaryText);
      setWarnings(result.warnings);
      setCommitCount(result.commits.length);
      setActivePreview("summary");
      setStatus("日报已生成");
    }, () => validateExtractSettings(settings));
  }

  async function generateCustomReport(range: DateRange) {
    await runTask("正在生成自定义报告", async () => {
      const result = await invoke<ExtractResult>("extract_commits", {
        options: buildExtractOptions(settings, projectNames, range, false),
      });
      setRepos(result.repos);
      setCustomRange(range);
      setCustomReport(result.detailedText || result.summaryText);
      setWarnings(result.warnings);
      setCommitCount(result.commits.length);
      setActivePreview("custom");
      setStatus("自定义报告已生成");
    }, () => validateExtractSettings(settings, range));
  }

  async function generateMonthlyReport() {
    await runTask("正在生成上月月报", async () => {
      const result = await invoke<MonthlyReportResult>("generate_monthly_report", {
        options: buildMonthlyOptions(settings, projectNames, false),
      });
      setMonthlyReport(result.reportText);
      setMonthlyLabel(result.monthLabel);
      setWarnings(result.warnings);
      setLastOutputFile(result.outputFile);
      setCommitCount(result.commitCount);
      setActivePreview("monthly");
      setStatus(result.outputFile ? `${result.monthLabel} 月报已生成` : `${result.monthLabel} 月报已生成，未写入文件`);
    }, () => validateMonthlySettings(settings));
  }

  async function polishReport() {
    await runTask("AI 正在润色", async () => {
      if (activePreview === "monthly") {
        const result = await invoke<MonthlyReportResult>("generate_monthly_report", {
          options: buildMonthlyOptions(settings, projectNames, true),
        });
        setMonthlyReport(result.reportText);
        setMonthlyLabel(result.monthLabel);
        setWarnings(result.warnings);
        setLastOutputFile(result.outputFile);
        setStatus(hasAiWarning(result.warnings) ? "AI 润色失败" : "AI 润色已完成");
      } else {
        const range = activePreview === "custom" ? customRange : getTodayRange();
        const result = await invoke<ExtractResult>("extract_commits", {
          options: buildExtractOptions(settings, projectNames, range, true),
        });
        if (activePreview === "custom") {
          setCustomReport(result.detailedText || result.summaryText);
        } else {
          setSummaryText(result.detailedText || result.summaryText);
        }
        setWarnings(result.warnings);
        setStatus(hasAiWarning(result.warnings) ? "AI 润色失败" : "AI 润色已完成");
      }
    }, () => validateExtractSettings(settings));
  }

  async function copyPreview() {
    if (!previewText) return;
    try {
      await navigator.clipboard.writeText(previewText);
      setStatus("内容已复制到剪贴板");
      setCopyNotice({ id: Date.now(), message: "已复制到剪贴板", tone: "success" });
    } catch {
      setStatus("复制失败，请重试");
      setCopyNotice({ id: Date.now(), message: "复制失败，请重试", tone: "error" });
    }
  }

  async function saveReport() {
    if (!previewText || !settings.outputEnabled) return;
    let fileName: string;
    if (activePreview === "monthly") {
      fileName = `monthly_report_${monthlyLabel}.md`;
    } else {
      const range = activePreview === "custom" ? customRange : getTodayRange();
      fileName = `git_commits_${range.startDate}_to_${range.endDate}.md`;
    }
    await runTask("正在导出报告", async () => {
      const outputFile = await invoke<string>("save_text_file", {
        outputDir: settings.outputDir,
        fileName,
        content: previewText,
      });
      setLastOutputFile(outputFile);
      setStatus("报告已导出");
    }, () => validateOutputSettings(settings));
  }

  async function checkForUpdates() {
    setUpdateBusy("checking");
    setUpdateProgress("");
    setUpdateMessage("正在检查更新");

    try {
      const nextUpdate = await check({ timeout: 20000 });
      await replacePendingUpdate(nextUpdate);

      if (!nextUpdate) {
        setUpdateSummary(null);
        setUpdateMessage(`当前已是最新版本 v${appVersion}`);
        return;
      }

      setUpdateSummary({
        currentVersion: nextUpdate.currentVersion,
        version: nextUpdate.version,
        notes: nextUpdate.body || "本次版本未提供更新说明。",
        date: nextUpdate.date,
      });
      setUpdateMessage(`发现新版本 v${nextUpdate.version}`);
    } catch (error) {
      setUpdateSummary(null);
      setUpdateMessage(formatUpdaterError(error));
    } finally {
      setUpdateBusy(null);
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) {
      setUpdateMessage("请先检查更新");
      return;
    }

    setUpdateBusy("installing");
    setUpdateProgress("正在下载安装包");
    setUpdateMessage(`正在安装 v${pendingUpdate.version}`);

    try {
      let total = 0;
      let downloaded = 0;

      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setUpdateProgress(total > 0 ? `已下载 0 / ${formatBytes(total)}` : "开始下载更新包");
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setUpdateProgress(total > 0 ? `已下载 ${formatBytes(downloaded)} / ${formatBytes(total)}` : `已下载 ${formatBytes(downloaded)}`);
        }
        if (event.event === "Finished") {
          setUpdateProgress("下载完成，正在准备安装");
        }
      });

      setUpdateMessage("更新包已准备就绪，应用将退出并完成安装");
    } catch (error) {
      setUpdateMessage(formatUpdaterError(error));
      setUpdateProgress("");
    } finally {
      setUpdateBusy(null);
    }
  }

  async function runTask(label: string, task: () => Promise<void>, validate = () => validateRequiredSettings(settings)) {
    setIsBusy(true);
    setStatus(label);
    setWarnings([]);
    try {
      validate();
      await task();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleRepo(repoPath: string, enabled: boolean) {
    setSettings((current) => {
      const disabled = current.disabledRepos.filter((path) => path !== repoPath);
      if (!enabled) disabled.push(repoPath);
      return { ...current, disabledRepos: disabled };
    });
  }

  async function replacePendingUpdate(nextUpdate: PendingAppUpdate | null) {
    if (pendingUpdate && pendingUpdate !== nextUpdate) {
      await pendingUpdate.close().catch(() => undefined);
    }
    setPendingUpdate(nextUpdate);
  }

  if (!settings.onboardingDone) {
    return (
      <OnboardingWizard
        settings={settings}
        repos={repos}
        isBusy={isBusy}
        updateSetting={updateSetting}
        chooseDirectory={chooseDirectory}
        onComplete={() => updateSetting("onboardingDone", true)}
      />
    );
  }

  return (
    <main className="app-root">
      <Workbench
        repos={repos}
        previewText={previewText}
        activePreview={activePreview}
        copyNotice={copyNotice}
        status={status}
        warnings={warnings}
        isBusy={isBusy}
        lastOutputFile={lastOutputFile}
        summaryText={activePreview === "custom" ? customReport : summaryText}
        repoCount={repos.length}
        commitCount={commitCount}
        author={settings.author}
        dailyDate={getTodayRange().startDate}
        customRange={customRange}
        aiEnabled={settings.aiEnabled}
        aiConfigured={aiConfigured}
        onExtract={extractCommits}
        onGenerateCustom={generateCustomReport}
        onGenerateMonthly={generateMonthlyReport}
        onPolish={polishReport}
        onCopy={copyPreview}
        onExport={saveReport}
        canExport={settings.outputEnabled && Boolean(settings.outputDir.trim())}
        disabledRepos={settings.disabledRepos}
        onToggleRepo={toggleRepo}
        onPreviewChange={setActivePreview}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        repos={repos}
        currentVersion={appVersion}
        updateSummary={updateSummary}
        updateMessage={updateMessage}
        updateProgress={updateProgress}
        updateBusy={updateBusy}
        updateSetting={updateSetting}
        chooseDirectory={chooseDirectory}
        onCheckForUpdates={checkForUpdates}
        onInstallUpdate={installUpdate}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

function hasAiWarning(warnings: string[]) {
  return warnings.some((warning) => warning.includes("AI 润色失败"));
}

function formatUpdaterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("plugin") || message.includes("updater")) {
    return "当前环境暂不可用在线更新，请在桌面打包版中重试";
  }
  return message;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function readSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default App;
