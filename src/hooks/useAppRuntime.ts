import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type Update as PendingAppUpdate } from "@tauri-apps/plugin-updater";
import type { ThemeMode, UpdateSummary } from "../model";

type SystemTheme = Exclude<ThemeMode, "system">;
type UpdateBusy = "checking" | "installing" | null;

type Params = {
  themeMode: ThemeMode;
};

export function useAppRuntime({ themeMode }: Params) {
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(readSystemTheme);
  const [appVersion, setAppVersion] = useState("读取中");
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [updateMessage, setUpdateMessage] = useState("当前版本信息读取中");
  const [updateProgress, setUpdateProgress] = useState("");
  const [updateBusy, setUpdateBusy] = useState<UpdateBusy>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingAppUpdate | null>(null);
  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

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
      appWindow
        .theme()
        .then((theme) => {
          const nextTheme = normalizeSystemTheme(theme);
          if (nextTheme) setSystemTheme(nextTheme);
        })
        .catch(() => undefined);
      appWindow
        .onThemeChanged(({ payload }) => {
          const nextTheme = normalizeSystemTheme(payload);
          if (nextTheme) setSystemTheme(nextTheme);
        })
        .then((unlisten) => {
          unlistenTheme = unlisten;
        })
        .catch(() => undefined);
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
      getCurrentWindow().setTheme(themeMode === "system" ? null : themeMode).catch(() => undefined);
    } catch {
      // Browser-only preview fallback.
    }
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    return () => {
      pendingUpdate?.close().catch(() => undefined);
    };
  }, [pendingUpdate]);

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

  async function replacePendingUpdate(nextUpdate: PendingAppUpdate | null) {
    if (pendingUpdate && pendingUpdate !== nextUpdate) {
      await pendingUpdate.close().catch(() => undefined);
    }
    setPendingUpdate(nextUpdate);
  }

  return {
    appVersion,
    updateSummary,
    updateMessage,
    updateProgress,
    updateBusy,
    checkForUpdates,
    installUpdate,
  };
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

function normalizeSystemTheme(theme: unknown): SystemTheme | null {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return null;
}

function readSystemTheme(): SystemTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
