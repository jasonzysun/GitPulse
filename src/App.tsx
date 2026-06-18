import { useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
import { check, type Update as PendingAppUpdate } from "@tauri-apps/plugin-updater";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { RepoMappingDialog } from "./components/RepoMappingDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Workbench } from "./components/Workbench";
import {
  type AppSettings,
  type CommitExtractProgress,
  type DateRange,
  type ExtractResult,
  type GitIdentity,
  type LoadedSettingsState,
  type PeriodReportResult,
  type ReportExportFormat,
  type PreviewMode,
  type ReportHistoryEntry,
  type RepoInfo,
  type RepoScanProgress,
  type UpdateSummary,
  type MappingScope,
  STORAGE_KEY,
  buildExtractOptions,
  buildPeriodReportOptions,
  clearReportHistory,
  clearRepoIndexCache,
  formatMonthLabel,
  getMonthRange,
  getPreviousMonthInput,
  getSingleDayRange,
  getToday,
  getTodayRange,
  getWeekLabel,
  getWeekRange,
  isAiKeyReference,
  loadReportHistory,
  loadRepoIndexCache,
  loadSettingsState,
  parseProjectNames,
  rememberReportHistoryEntry,
  saveRepoIndexCache,
  settingsForPersistence,
  updateReportHistoryEntry,
  upsertRepoMapping,
  validateExtractSettings,
  validateOutputSettings,
  validatePeriodReportSettings,
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
  const [repos, setRepos] = useState<RepoInfo[]>(() => loadRepoIndexCache(loadedSettings.settings.rootDirs)?.repos ?? []);
  const [summaryText, setSummaryText] = useState("");
  const [dailyDate, setDailyDate] = useState(getToday);
  const [customReport, setCustomReport] = useState("");
  const [customRange, setCustomRange] = useState<DateRange>(getTodayRange);
  const [weeklyReport, setWeeklyReport] = useState("");
  const [weeklyWeek, setWeeklyWeek] = useState(getWeekLabel);
  const [monthlyReport, setMonthlyReport] = useState("");
  const [monthlyMonth, setMonthlyMonth] = useState(getPreviousMonthInput);
  const [monthlyLabel, setMonthlyLabel] = useState("");
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>(loadReportHistory);
  const [activeHistoryId, setActiveHistoryId] = useState("");
  const [activePreview, setActivePreview] = useState<PreviewMode>("summary");
  const [status, setStatus] = useState(
    loadedSettings.recoveredCorruptedSettings
      ? "本地设置损坏，已恢复默认配置"
      : loadedSettings.recoveredLegacyApiKey
        ? "已迁移旧配置中的 AI 密钥引用"
        : "就绪",
  );
  const [copyNotice, setCopyNotice] = useState<CopyNotice | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isRepoScanning, setIsRepoScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<RepoScanProgress | null>(null);
  const [extractProgress, setExtractProgress] = useState<CommitExtractProgress | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<RepoInfo | null>(null);
  const [lastOutputFile, setLastOutputFile] = useState("");
  const [commitCount, setCommitCount] = useState(0);
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);
  const [appVersion, setAppVersion] = useState("读取中");
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [updateMessage, setUpdateMessage] = useState("当前版本信息读取中");
  const [updateProgress, setUpdateProgress] = useState("");
  const [updateBusy, setUpdateBusy] = useState<"checking" | "installing" | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingAppUpdate | null>(null);
  const aiApiKeySaveTimer = useRef<number | null>(null);

  const projectNames = useMemo(() => parseProjectNames(settings.projectNamesText), [settings.projectNamesText]);
  const dailyRange = useMemo(() => getSingleDayRange(dailyDate), [dailyDate]);
  const weeklyRange = useMemo(() => getWeekRange(weeklyWeek), [weeklyWeek]);
  const monthlyRange = useMemo(() => getMonthRange(monthlyMonth), [monthlyMonth]);
  const previewText = activePreview === "monthly" ? monthlyReport : activePreview === "weekly" ? weeklyReport : activePreview === "custom" ? customReport : summaryText;
  const resolvedTheme = settings.themeMode === "system" ? systemTheme : settings.themeMode;
  const aiConfigured =
    settings.aiProvider === "codex-oauth"
      ? Boolean(settings.aiModel.trim())
      : Boolean(settings.aiBaseUrl.trim() && settings.aiModel.trim() && settings.aiApiKey.trim());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsForPersistence(settings)));
  }, [settings]);

  useEffect(() => {
    const currentApiKey = settings.aiApiKey.trim();
    if (currentApiKey) {
      if (!isAiKeyReference(currentApiKey)) void persistSecureAiApiKey(currentApiKey);
      return;
    }

    invoke<string | null>("get_secure_ai_api_key")
      .then((apiKey) => {
        if (!apiKey) return;
        setSettings((current) => {
          if (current.aiApiKey.trim()) return current;
          return { ...current, aiApiKey: apiKey, aiApiKeySaved: true };
        });
        setStatus("已从系统凭据库读取 AI API Key");
      })
      .catch(() => undefined);
    // Only run on startup; later key edits are handled by updateSetting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    let unlisten: (() => void) | undefined;
    listen<RepoScanProgress>("repo-scan-progress", ({ payload }) => {
      setScanProgress(payload);
      if (payload.cancelled) {
        setStatus("仓库扫描已取消");
        return;
      }
      if (payload.done) return;
      setStatus(`正在扫描仓库：已检查 ${payload.scannedDirs} 个目录，发现 ${payload.foundRepos} 个仓库`);
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<CommitExtractProgress>("commit-extract-progress", ({ payload }) => {
      setExtractProgress(payload);
      if (payload.done) return;
      setStatus(formatExtractProgress(payload));
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => unlisten?.();
  }, []);

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
    if (settings.rootDirs.length === 0) {
      setRepos([]);
      clearRepoIndexCache();
      return;
    }

    const repoCache = loadRepoIndexCache(settings.rootDirs);
    if (repoCache) {
      setRepos(repoCache.repos);
      setStatus(`已载入 ${repoCache.repos.length} 个缓存仓库索引`);
      return;
    }

    setRepos([]);
    if (settings.onboardingDone) {
      setStatus("工作目录已更新，请点击重新扫描仓库索引");
      return;
    }
    scanWorkspace();
  }, [settings.rootDirs, settings.onboardingDone]);

  useEffect(() => {
    return () => {
      pendingUpdate?.close().catch(() => undefined);
    };
  }, [pendingUpdate]);

  useEffect(() => {
    return () => {
      if (aiApiKeySaveTimer.current !== null) {
        window.clearTimeout(aiApiKeySaveTimer.current);
      }
    };
  }, []);

  async function chooseOutputDir() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") updateSetting("outputDir", selected);
  }

  async function addRootDirs() {
    const selected = await open({ directory: true, multiple: true });
    const picked = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (picked.length === 0) return;
    setSettings((current) => {
      const merged = [...current.rootDirs];
      for (const dir of picked) {
        if (!merged.includes(dir)) merged.push(dir);
      }
      return { ...current, rootDirs: merged };
    });
  }

  function removeRootDir(dir: string) {
    setSettings((current) => ({
      ...current,
      rootDirs: current.rootDirs.filter((item) => item !== dir),
    }));
  }

  async function scanWorkspace() {
    setIsRepoScanning(true);
    setScanProgress({
      rootDir: "",
      currentPath: "",
      scannedDirs: 0,
      foundRepos: 0,
      done: false,
      cancelled: false,
    });
    try {
      await runTask("正在扫描仓库", async () => {
        const result = await invoke<RepoInfo[]>("scan_repos", { rootDirs: settings.rootDirs });
        updateRepoIndex(result);
        setScanProgress((current) => ({
          rootDir: current?.rootDir ?? "",
          currentPath: current?.currentPath ?? "",
          scannedDirs: current?.scannedDirs ?? 0,
          foundRepos: result.length,
          done: true,
          cancelled: false,
        }));
        setStatus(`已发现 ${result.length} 个仓库`);
      }, () => validateWorkspaceSettings(settings));
    } finally {
      setIsRepoScanning(false);
    }
  }

  async function cancelRepoScan() {
    setStatus("正在取消仓库扫描");
    try {
      await invoke("cancel_repo_scan");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function changePreview(preview: PreviewMode) {
    setActivePreview(preview);
    setActiveHistoryId("");
  }

  function changeDailyDate(date: string) {
    setDailyDate(date);
    setActiveHistoryId("");
  }

  function changeWeeklyWeek(week: string) {
    setWeeklyWeek(week);
    setActiveHistoryId("");
  }

  function changeMonthlyMonth(month: string) {
    setMonthlyMonth(month);
    setActiveHistoryId("");
  }

  function rememberHistory(entry: ReportHistoryEntry) {
    setReportHistory((current) => rememberReportHistoryEntry(current, entry));
    setActiveHistoryId(entry.id);
  }

  function updateActiveHistory(patch: Partial<Pick<ReportHistoryEntry, "outputFile" | "reportText" | "commitCount" | "generatedAt">>) {
    if (!activeHistoryId) return;
    setReportHistory((current) => updateReportHistoryEntry(current, activeHistoryId, patch));
  }

  function buildHistoryEntry(
    mode: PreviewMode,
    range: DateRange,
    periodLabel: string,
    reportText: string,
    commitTotal: number,
    aiEnhanced: boolean,
    outputFile = "",
  ): ReportHistoryEntry {
    return {
      id: createHistoryId(),
      mode,
      title: formatHistoryTitle(mode, periodLabel, range),
      range,
      periodLabel,
      generatedAt: new Date().toISOString(),
      repoCount: getEnabledRepoCount(),
      commitCount: commitTotal,
      aiEnhanced,
      outputFile,
      reportText,
    };
  }

  function getEnabledRepoCount() {
    return repos.filter((repo) => !settings.disabledRepos.includes(repo.path)).length;
  }

  async function extractCommits(dateValue = dailyDate) {
    const range = getSingleDayRange(dateValue);
    setExtractProgress(null);
    await runTask("正在提取提交记录", async () => {
      const result = await invoke<ExtractResult>("extract_commits", {
        options: buildExtractOptions(settings, projectNames, range, false, "", repos),
      });
      const reportText = result.detailedText || result.summaryText;
      setDailyDate(dateValue);
      setSummaryText(reportText);
      setWarnings(result.warnings);
      setLastOutputFile("");
      setCommitCount(result.commits.length);
      setActivePreview("summary");
      rememberHistory(buildHistoryEntry("summary", range, dateValue, reportText, result.commits.length, false));
      setStatus(`${dateValue} 日报已生成`);
    }, () => validateExtractSettings(settings, range));
  }

  async function generateCustomReport(range: DateRange) {
    setExtractProgress(null);
    await runTask("正在生成自定义报告", async () => {
      const result = await invoke<ExtractResult>("extract_commits", {
        options: buildExtractOptions(settings, projectNames, range, false, "", repos),
      });
      const reportText = result.detailedText || result.summaryText;
      const periodLabel = `${range.startDate} ~ ${range.endDate}`;
      setCustomRange(range);
      setCustomReport(reportText);
      setWarnings(result.warnings);
      setLastOutputFile("");
      setCommitCount(result.commits.length);
      setActivePreview("custom");
      rememberHistory(buildHistoryEntry("custom", range, periodLabel, reportText, result.commits.length, false));
      setStatus("自定义报告已生成");
    }, () => validateExtractSettings(settings, range));
  }

  async function generateWeeklyReport(weekValue = weeklyWeek) {
    const range = getWeekRange(weekValue);
    const label = weekValue;
    setExtractProgress(null);
    await runTask("正在生成周报", async () => {
      const result = await invoke<PeriodReportResult>("generate_period_report", {
        options: buildPeriodReportOptions(settings, projectNames, "weekly", range, label, false, "", repos),
      });
      setWeeklyWeek(result.periodLabel);
      setWeeklyReport(result.reportText);
      setWarnings(result.warnings);
      setLastOutputFile(result.outputFile);
      setCommitCount(result.commitCount);
      setActivePreview("weekly");
      rememberHistory(buildHistoryEntry("weekly", range, result.periodLabel, result.reportText, result.commitCount, false, result.outputFile));
      setStatus(result.outputFile ? `${result.periodLabel} 周报已生成` : `${result.periodLabel} 周报已生成，未写入文件`);
    }, () => validatePeriodReportSettings(settings, range));
  }

  async function generateMonthlyReport(monthValue = monthlyMonth) {
    setExtractProgress(null);
    await runTask("正在生成月报", async () => {
      const range = getMonthRange(monthValue);
      const label = formatMonthLabel(monthValue);
      const result = await invoke<PeriodReportResult>("generate_period_report", {
        options: buildPeriodReportOptions(settings, projectNames, "monthly", range, label, false, "", repos),
      });
      setMonthlyMonth(result.periodLabel);
      setMonthlyReport(result.reportText);
      setMonthlyLabel(result.periodLabel);
      setWarnings(result.warnings);
      setLastOutputFile(result.outputFile);
      setCommitCount(result.commitCount);
      setActivePreview("monthly");
      rememberHistory(buildHistoryEntry("monthly", range, result.periodLabel, result.reportText, result.commitCount, false, result.outputFile));
      setStatus(result.outputFile ? `${result.periodLabel} 月报已生成` : `${result.periodLabel} 月报已生成，未写入文件`);
    }, () => validatePeriodReportSettings(settings, getMonthRange(monthValue)));
  }

  async function polishReport(extraInstruction = "") {
    setExtractProgress(null);
    await runTask("AI 正在润色", async () => {
      if (activePreview === "weekly") {
        const result = await invoke<PeriodReportResult>("generate_period_report", {
          options: buildPeriodReportOptions(settings, projectNames, "weekly", weeklyRange, weeklyWeek, true, extraInstruction, repos),
        });
        const aiEnhanced = settings.aiEnabled && !hasAiWarning(result.warnings);
        setWeeklyReport(result.reportText);
        setWarnings(result.warnings);
        setLastOutputFile(result.outputFile);
        setCommitCount(result.commitCount);
        rememberHistory(buildHistoryEntry("weekly", weeklyRange, result.periodLabel, result.reportText, result.commitCount, aiEnhanced, result.outputFile));
        setStatus(hasAiWarning(result.warnings) ? "AI 润色失败" : "AI 润色已完成");
      } else if (activePreview === "monthly") {
        const result = await invoke<PeriodReportResult>("generate_period_report", {
          options: buildPeriodReportOptions(settings, projectNames, "monthly", monthlyRange, formatMonthLabel(monthlyMonth), true, extraInstruction, repos),
        });
        const aiEnhanced = settings.aiEnabled && !hasAiWarning(result.warnings);
        setMonthlyMonth(result.periodLabel);
        setMonthlyReport(result.reportText);
        setMonthlyLabel(result.periodLabel);
        setWarnings(result.warnings);
        setLastOutputFile(result.outputFile);
        setCommitCount(result.commitCount);
        rememberHistory(buildHistoryEntry("monthly", monthlyRange, result.periodLabel, result.reportText, result.commitCount, aiEnhanced, result.outputFile));
        setStatus(hasAiWarning(result.warnings) ? "AI 润色失败" : "AI 润色已完成");
      } else {
        const range = activePreview === "custom" ? customRange : dailyRange;
        const result = await invoke<ExtractResult>("extract_commits", {
          options: buildExtractOptions(settings, projectNames, range, true, extraInstruction, repos),
        });
        const reportText = result.detailedText || result.summaryText;
        const mode = activePreview === "custom" ? "custom" : "summary";
        const periodLabel = mode === "custom" ? `${range.startDate} ~ ${range.endDate}` : range.startDate;
        const aiEnhanced = settings.aiEnabled && !hasAiWarning(result.warnings);
        if (activePreview === "custom") {
          setCustomReport(reportText);
        } else {
          setSummaryText(reportText);
        }
        setWarnings(result.warnings);
        setLastOutputFile("");
        setCommitCount(result.commits.length);
        rememberHistory(buildHistoryEntry(mode, range, periodLabel, reportText, result.commits.length, aiEnhanced));
        setStatus(hasAiWarning(result.warnings) ? "AI 润色失败" : "AI 润色已完成");
      }
    }, () => {
      if (activePreview === "weekly") return validatePeriodReportSettings(settings, weeklyRange);
      if (activePreview === "monthly") return validatePeriodReportSettings(settings, monthlyRange);
      return validateExtractSettings(settings, activePreview === "custom" ? customRange : dailyRange);
    });
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

  async function saveReport(format: ReportExportFormat = "markdown") {
    if (!previewText || !settings.outputEnabled) return;
    let baseName: string;
    if (activePreview === "monthly") {
      baseName = `monthly_report_${monthlyLabel || formatMonthLabel(monthlyMonth)}`;
    } else if (activePreview === "weekly") {
      baseName = `weekly_report_${weeklyWeek}`;
    } else {
      const range = activePreview === "custom" ? customRange : dailyRange;
      baseName = `git_commits_${range.startDate}_to_${range.endDate}`;
    }
    await runTask("正在导出报告", async () => {
      const outputFile = await invoke<string>("save_report_file", {
        outputDir: settings.outputDir,
        baseName,
        format,
        content: previewText,
      });
      setLastOutputFile(outputFile);
      updateActiveHistory({ outputFile });
      setStatus(`报告已导出为 ${formatReportExportLabel(format)}`);
    }, () => validateOutputSettings(settings));
  }

  function openReportHistory(entry: ReportHistoryEntry) {
    setActiveHistoryId(entry.id);
    setWarnings([]);
    setLastOutputFile(entry.outputFile);
    setCommitCount(entry.commitCount);

    if (entry.mode === "monthly") {
      setMonthlyMonth(entry.periodLabel);
      setMonthlyLabel(entry.periodLabel);
      setMonthlyReport(entry.reportText);
    } else if (entry.mode === "weekly") {
      setWeeklyWeek(entry.periodLabel);
      setWeeklyReport(entry.reportText);
    } else if (entry.mode === "custom") {
      setCustomRange(entry.range);
      setCustomReport(entry.reportText);
    } else {
      setDailyDate(entry.range.startDate);
      setSummaryText(entry.reportText);
    }

    setActivePreview(entry.mode);
    setStatus(`已打开历史报告：${entry.title}`);
  }

  async function copyReportHistory(entry: ReportHistoryEntry) {
    try {
      await navigator.clipboard.writeText(entry.reportText);
      setStatus(`已复制历史报告：${entry.title}`);
      setCopyNotice({ id: Date.now(), message: "已复制历史报告", tone: "success" });
    } catch {
      setStatus("复制历史报告失败，请重试");
      setCopyNotice({ id: Date.now(), message: "复制失败，请重试", tone: "error" });
    }
  }

  async function regenerateReportHistory(entry: ReportHistoryEntry) {
    if (entry.mode === "monthly") {
      await generateMonthlyReport(entry.periodLabel);
    } else if (entry.mode === "weekly") {
      await generateWeeklyReport(entry.periodLabel);
    } else if (entry.mode === "custom") {
      await generateCustomReport(entry.range);
    } else {
      await extractCommits(entry.range.startDate);
    }
  }

  function clearHistoryRecords() {
    if (!window.confirm("清空最近报告记录？已导出的 Markdown 文件不会被删除。")) return;
    clearReportHistory();
    setReportHistory([]);
    setActiveHistoryId("");
    setStatus("最近报告记录已清空");
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
    if (key === "aiApiKey") {
      const aiApiKey = String(value);
      setSettings((current) => ({
        ...current,
        aiApiKey,
        aiApiKeySaved:
          current.aiApiKeySaved
          && current.aiApiKey === aiApiKey
          && Boolean(aiApiKey.trim())
          && !isAiKeyReference(aiApiKey.trim()),
      }));
      scheduleSecureAiApiKeySync(aiApiKey);
      return;
    }
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleRepo(repoPath: string, enabled: boolean) {
    setSettings((current) => {
      const disabled = current.disabledRepos.filter((path) => path !== repoPath);
      if (!enabled) disabled.push(repoPath);
      return { ...current, disabledRepos: disabled };
    });
  }

  function updateRepoIndex(nextRepos: RepoInfo[]) {
    setRepos(nextRepos);
    saveRepoIndexCache(settings.rootDirs, nextRepos);
  }

  function saveRepoMapping(scope: MappingScope, displayName: string) {
    if (!editingRepo) return;
    setSettings((current) => ({
      ...current,
      projectNamesText: upsertRepoMapping(current.projectNamesText, editingRepo, scope, displayName),
    }));
    setStatus(displayName.trim() ? `已更新「${editingRepo.name}」的映射名称` : `已清除「${editingRepo.name}」的映射名称`);
    setEditingRepo(null);
  }

  async function replacePendingUpdate(nextUpdate: PendingAppUpdate | null) {
    if (pendingUpdate && pendingUpdate !== nextUpdate) {
      await pendingUpdate.close().catch(() => undefined);
    }
    setPendingUpdate(nextUpdate);
  }

  function scheduleSecureAiApiKeySync(value: string) {
    if (aiApiKeySaveTimer.current !== null) {
      window.clearTimeout(aiApiKeySaveTimer.current);
    }
    aiApiKeySaveTimer.current = window.setTimeout(() => {
      aiApiKeySaveTimer.current = null;
      void persistSecureAiApiKey(value);
    }, 500);
  }

  async function persistSecureAiApiKey(value: string) {
    const apiKey = value.trim();
    try {
      if (!apiKey || isAiKeyReference(apiKey)) {
        await invoke("clear_secure_ai_api_key");
        setSettings((current) => ({ ...current, aiApiKeySaved: false }));
        return;
      }

      await invoke("set_secure_ai_api_key", { apiKey });
      setSettings((current) => {
        if (current.aiApiKey.trim() !== apiKey) return current;
        return { ...current, aiApiKeySaved: true };
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  if (!settings.onboardingDone) {
    return (
      <OnboardingWizard
        settings={settings}
        repos={repos}
        isBusy={isBusy}
        updateSetting={updateSetting}
        onAddRootDirs={addRootDirs}
        onRemoveRootDir={removeRootDir}
        onComplete={() => updateSetting("onboardingDone", true)}
      />
    );
  }

  return (
    <main className="app-root">
      <Workbench
        repos={repos}
        projectNames={projectNames}
        previewText={previewText}
        activePreview={activePreview}
        copyNotice={copyNotice}
        status={status}
        warnings={warnings}
        isBusy={isBusy}
        isRepoScanning={isRepoScanning}
        scanProgress={scanProgress}
        extractProgress={extractProgress}
        lastOutputFile={lastOutputFile}
        summaryText={activePreview === "weekly" ? weeklyReport : activePreview === "custom" ? customReport : summaryText}
        reportHistory={reportHistory}
        activeHistoryId={activeHistoryId}
        repoCount={repos.length}
        commitCount={commitCount}
        author={settings.author}
        dailyDate={dailyDate}
        onDailyDateChange={changeDailyDate}
        weeklyRange={weeklyRange}
        weeklyWeek={weeklyWeek}
        onWeeklyWeekChange={changeWeeklyWeek}
        monthlyMonth={monthlyMonth}
        onMonthlyMonthChange={changeMonthlyMonth}
        monthlyRange={monthlyRange}
        customRange={customRange}
        aiEnabled={settings.aiEnabled}
        aiConfigured={aiConfigured}
        onExtract={extractCommits}
        onGenerateWeekly={generateWeeklyReport}
        onGenerateCustom={generateCustomReport}
        onGenerateMonthly={generateMonthlyReport}
        onPolish={polishReport}
        onCopy={copyPreview}
        onExport={saveReport}
        onOpenHistory={openReportHistory}
        onCopyHistory={copyReportHistory}
        onRegenerateHistory={regenerateReportHistory}
        onClearHistory={clearHistoryRecords}
        canExport={settings.outputEnabled && Boolean(settings.outputDir.trim())}
        disabledRepos={settings.disabledRepos}
        onToggleRepo={toggleRepo}
        onEditRepo={setEditingRepo}
        onRefreshRepos={scanWorkspace}
        onCancelRepoScan={cancelRepoScan}
        onPreviewChange={changePreview}
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
        onAddRootDirs={addRootDirs}
        onRemoveRootDir={removeRootDir}
        onChooseOutputDir={chooseOutputDir}
        onCheckForUpdates={checkForUpdates}
        onInstallUpdate={installUpdate}
        onClose={() => setSettingsOpen(false)}
      />
      <RepoMappingDialog
        open={editingRepo !== null}
        repo={editingRepo}
        projectNamesText={settings.projectNamesText}
        onClose={() => setEditingRepo(null)}
        onConfirm={saveRepoMapping}
      />
    </main>
  );
}

function hasAiWarning(warnings: string[]) {
  return warnings.some((warning) => warning.includes("AI 润色失败"));
}

function createHistoryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatHistoryTitle(mode: PreviewMode, periodLabel: string, range: DateRange) {
  if (mode === "monthly") return `月报 · ${periodLabel}`;
  if (mode === "weekly") return `周报 · ${periodLabel}`;
  if (mode === "custom") return `自定义 · ${range.startDate} ~ ${range.endDate}`;
  return `日报 · ${range.startDate}`;
}

function formatReportExportLabel(format: ReportExportFormat) {
  if (format === "docx") return "Word 文档";
  if (format === "pdf") return "PDF";
  return "Markdown";
}

function formatExtractProgress(progress: CommitExtractProgress) {
  const total = progress.totalRepos;
  if (total === 0) return "没有启用的仓库可提取";
  const current = progress.currentRepo ? ` · 刚完成 ${progress.currentRepo}` : "";
  return `正在提取提交：${progress.completedRepos}/${total} 仓库 · ${progress.concurrency} 并发 · ${progress.commitCount} 条提交${current}`;
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
