import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, DiagnosticResult, RepoInfo } from "../model";

type Params = {
  open: boolean;
  active: boolean;
  settings: AppSettings;
  repos: RepoInfo[];
};

export function useDiagnosticsPanel({ open, active, settings, repos }: Params) {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ranAt, setRanAt] = useState("");

  useEffect(() => {
    if (open) return;
    setResult(null);
    setBusy(false);
    setMessage("");
    setRanAt("");
  }, [open]);

  useEffect(() => {
    if (!open || !active || result || busy) return;
    void refresh();
    // 首次进入诊断页时自动跑一次；后续结果保留到面板关闭，避免切换页签反复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, result, busy]);

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const nextResult = await invoke<DiagnosticResult>("run_diagnostics", {
        options: {
          rootDirs: settings.rootDirs,
          outputDir: settings.outputDir,
          outputEnabled: settings.outputEnabled,
          author: settings.author,
          aiEnabled: shouldCheckAiSettings(settings),
          aiProvider: settings.aiProvider,
          aiBaseUrl: settings.aiBaseUrl,
          aiModel: settings.aiModel,
          aiApiKey: settings.aiApiKey,
          indexedRepos: repos,
        },
      });
      setResult(nextResult);
      setRanAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return {
    result,
    busy,
    message,
    ranAt,
    refresh,
  };
}

function shouldCheckAiSettings(settings: AppSettings) {
  return settings.aiProvider === "codex-oauth"
    || Boolean(settings.aiModel.trim() || settings.aiApiKey.trim());
}
