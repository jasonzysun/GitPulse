import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ControlPanel } from "./components/ControlPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { Workbench } from "./components/Workbench";
import {
  type AppSettings,
  type ExtractResult,
  type GitIdentity,
  type MonthlyReportResult,
  type RepoInfo,
  STORAGE_KEY,
  buildExtractOptions,
  buildMonthlyOptions,
  loadSettings,
  parseProjectNames,
  validateExtractSettings,
  validateRequiredSettings,
  validateWorkspaceSettings,
} from "./model";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/preview.css";
import "./styles/dialogs.css";

function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [monthlyReport, setMonthlyReport] = useState("");
  const [activePreview, setActivePreview] = useState<"monthly" | "summary">("monthly");
  const [status, setStatus] = useState("就绪");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastOutputFile, setLastOutputFile] = useState("");
  const [commitCount, setCommitCount] = useState(0);

  const projectNames = useMemo(() => parseProjectNames(settings.projectNamesText), [settings.projectNamesText]);
  const previewText = activePreview === "monthly" ? monthlyReport : summaryText;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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
      setStatus(`${result.monthLabel} 月报已生成`);
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
    });
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

  return (
    <main className="app-root">
      <ControlPanel
        settings={settings}
        updateSetting={updateSetting}
        chooseDirectory={chooseDirectory}
        onOpenSettings={() => setSettingsOpen(true)}
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
        onScan={scanWorkspace}
        onExtract={extractCommits}
        onGenerateMonthly={generateMonthlyReport}
        onCopy={copyPreview}
        onSaveSummary={saveSummary}
        onPreviewChange={setActivePreview}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        updateSetting={updateSetting}
        chooseDirectory={chooseDirectory}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

export default App;
