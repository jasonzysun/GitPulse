import { useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
import { check, type Update as PendingAppUpdate } from "@tauri-apps/plugin-updater";
import { ControlPanel } from "./components/ControlPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { Workbench } from "./components/Workbench";
import {
  type AppSettings,
  type ExtractResult,
  type GitIdentity,
  type MonthlyReportResult,
  type RepoInfo,
  type UpdateSummary,
  STORAGE_KEY,
  buildExtractOptions,
  buildMonthlyOptions,
  loadSettings,
  parseProjectNames,
  validateExtractSettings,
  validateOutputSettings,
  validateRequiredSettings,
  validateWorkspaceSettings,
} from "./model";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/preview.css";
import "./styles/dialogs.css";
import "./styles/theme.css";

function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [monthlyReport, setMonthlyReport] = useState("");
  const [activePreview, setActivePreview] = useState<"monthly" | "summary">("summary");
  const [status, setStatus] = useState("就绪");
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
  const previewText = activePreview === "monthly" ? monthlyReport : summaryText;
  const resolvedTheme = settings.themeMode === "system" ? systemTheme : settings.themeMode;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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
      const result = await invoke<ExtractResult>("extract_commits", {
        options: buildExtractOptions(settings, projectNames),
      });
      setRepos(result.repos);
      setSummaryText(result.detailedText || result.summaryText);
      setWarnings(result.warnings);
      setCommitCount(result.commits.length);
      setActivePreview("summary");
      setStatus(`已提取 ${result.commits.length} 条提交`);
    }, () => validateExtractSettings(settings));
  }

  async function generateMonthlyReport() {
    await runTask("正在生成上月月报", async () => {
      const result = await invoke<MonthlyReportResult>("generate_monthly_report", {
        options: buildMonthlyOptions(settings, projectNames),
      });
      setMonthlyReport(result.reportText);
      setWarnings(result.warnings);
      setLastOutputFile(result.outputFile);
      setCommitCount(result.commitCount);
      setActivePreview("monthly");
      setStatus(result.outputFile ? `${result.monthLabel} 月报已生成` : `${result.monthLabel} 月报已生成，未写入文件`);
    });
  }

  async function copyPreview() {
    if (!previewText) return;
    await navigator.clipboard.writeText(previewText);
    setStatus("内容已复制到剪贴板");
  }

  async function saveSummary() {
    if (!summaryText) return;
    await runTask("正在保存摘要", async () => {
      const outputFile = await invoke<string>("save_text_file", {
        outputDir: settings.outputDir,
        fileName: `git_commits_${settings.startDate}_to_${settings.endDate}.md`,
        content: summaryText,
      });
      setLastOutputFile(outputFile);
      setStatus("摘要已保存");
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

  async function replacePendingUpdate(nextUpdate: PendingAppUpdate | null) {
    if (pendingUpdate && pendingUpdate !== nextUpdate) {
      await pendingUpdate.close().catch(() => undefined);
    }
    setPendingUpdate(nextUpdate);
  }

  return (
    <main className="app-root">
      <ControlPanel
        settings={settings}
        updateSetting={updateSetting}
        chooseDirectory={chooseDirectory}
      />
      <Workbench
        repos={repos}
        previewText={previewText}
        activePreview={activePreview}
        status={status}
        warnings={warnings}
        isBusy={isBusy}
        lastOutputFile={lastOutputFile}
        summaryText={summaryText}
        repoCount={repos.length}
        commitCount={commitCount}
        onExtract={extractCommits}
        onGenerateMonthly={generateMonthlyReport}
        onCopy={copyPreview}
        onSaveSummary={saveSummary}
        canSaveSummary={settings.outputEnabled}
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
