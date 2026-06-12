export type RepoInfo = {
  path: string;
  name: string;
  branch: string;
};

export type ExtractResult = {
  repos: RepoInfo[];
  summaryText: string;
  detailedText: string;
  warnings: string[];
  commits: unknown[];
};

export type MonthlyReportResult = {
  reportText: string;
  outputFile: string;
  warnings: string[];
  monthLabel: string;
  commitCount: number;
};

export type PreviewMode = "summary" | "custom" | "monthly";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type UpdateSummary = {
  currentVersion: string;
  version: string;
  notes: string;
  date?: string;
};

export type GitIdentity = {
  userName: string;
  userEmail: string;
};

export type AiModelInfo = {
  id: string;
};

export type ThemeMode = "system" | "light" | "dark";

export type AppSettings = {
  onboardingDone: boolean;
  rootDir: string;
  outputDir: string;
  outputEnabled: boolean;
  themeMode: ThemeMode;
  author: string;
  pullLatestCode: boolean;
  extractAllBranches: boolean;
  detailedOutput: boolean;
  showProjectAndBranch: boolean;
  projectNamesText: string;
  aiEnabled: boolean;
  aiProvider: "openai-compatible" | "anthropic-native" | "codex-oauth";
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  refinementInstruction: string;
};

export type LoadedSettingsState = {
  settings: AppSettings;
  recoveredLegacyApiKey: boolean;
};

export const STORAGE_KEY = "gitpulse-settings";
const LEGACY_STORAGE_KEY = "git-report-studio-settings";
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const defaultSettings: AppSettings = {
  onboardingDone: false,
  rootDir: "",
  outputDir: "",
  outputEnabled: false,
  themeMode: "system",
  author: "",
  pullLatestCode: false,
  extractAllBranches: false,
  detailedOutput: false,
  showProjectAndBranch: true,
  projectNamesText: "",
  aiEnabled: false,
  aiProvider: "openai-compatible",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiApiKey: "",
  refinementInstruction: "",
};

export function loadSettingsState(): LoadedSettingsState {
  const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) {
    return {
      settings: defaultSettings,
      recoveredLegacyApiKey: false,
    };
  }

  const rawSettings = JSON.parse(saved) as Partial<AppSettings> & {
    aiKeyEnv?: string;
    startDate?: string;
    endDate?: string;
  };
  const persistedSettings = { ...rawSettings };
  delete persistedSettings.startDate;
  delete persistedSettings.endDate;
  const parsed = { ...defaultSettings, ...persistedSettings } as AppSettings;
  // Settings saved before the onboarding flow existed imply a configured workspace.
  if (rawSettings.onboardingDone === undefined && parsed.rootDir.trim()) {
    parsed.onboardingDone = true;
  }
  const legacyAiKeyEnv = rawSettings.aiKeyEnv?.trim() ?? "";
  const aiApiKey = parsed.aiApiKey.trim();

  if (!aiApiKey && legacyAiKeyEnv && !looksLikeEnvVarName(legacyAiKeyEnv)) {
    return {
      settings: {
        ...parsed,
        aiApiKey: legacyAiKeyEnv,
      },
      recoveredLegacyApiKey: true,
    };
  }

  return {
    settings: parsed,
    recoveredLegacyApiKey: false,
  };
}

export type MappingEntry = {
  key: string;
  displayName: string;
};

export function parseMappingText(text: string): MappingEntry[] {
  return text.split(/\r?\n/).reduce<MappingEntry[]>((rows, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return rows;
    const separatorIndex = line.indexOf("->");
    if (separatorIndex < 0) return rows;
    rows.push({
      key: line.slice(0, separatorIndex).trim(),
      displayName: line.slice(separatorIndex + 2).trim(),
    });
    return rows;
  }, []);
}

export function serializeMappingText(rows: MappingEntry[]): string {
  return rows.map((row) => `${row.key} -> ${row.displayName}`).join("\n");
}

export function mergeMappingEntries(existing: string, entries: MappingEntry[]): string {
  const merged = new Map<string, string>();
  for (const row of parseMappingText(existing)) merged.set(row.key, row.displayName);
  for (const row of entries) {
    if (row.key && row.displayName) merged.set(row.key, row.displayName);
  }
  return serializeMappingText([...merged].map(([key, displayName]) => ({ key, displayName })));
}

export function buildMappingKeys(repos: RepoInfo[]): string[] {
  return repos.flatMap((repo) => {
    const keys = [`${repo.name}(*)`];
    if (repo.branch) keys.push(`${repo.name}(${repo.branch})`);
    return keys;
  });
}

export function parseProjectNames(text: string): Record<string, string> {
  return parseMappingText(text).reduce<Record<string, string>>((result, row) => {
    if (row.key && row.displayName) result[row.key] = row.displayName;
    return result;
  }, {});
}

export function buildExtractOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  dateRange: DateRange | undefined,
  aiEnabled: boolean,
) {
  const range = dateRange ?? getTodayRange();
  return {
    rootDir: settings.rootDir,
    author: settings.author,
    startDate: range.startDate,
    endDate: range.endDate,
    pullLatestCode: settings.pullLatestCode,
    extractAllBranches: settings.extractAllBranches,
    detailedOutput: settings.detailedOutput,
    showProjectAndBranch: settings.showProjectAndBranch,
    projectNames,
    refinementInstruction: settings.refinementInstruction,
    ai: aiEnabled ? buildAiOptions(settings) : { ...buildAiOptions(settings), enabled: false },
  };
}

export function buildMonthlyOptions(settings: AppSettings, projectNames: Record<string, string>, aiEnabled: boolean) {
  return {
    rootDir: settings.rootDir,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: settings.author,
    pullLatestCode: settings.pullLatestCode,
    extractAllBranches: settings.extractAllBranches,
    projectNames,
    refinementInstruction: settings.refinementInstruction,
    ai: aiEnabled ? buildAiOptions(settings) : { ...buildAiOptions(settings), enabled: false },
  };
}

export function validateRequiredSettings(settings: AppSettings) {
  validateExtractSettings(settings);
  validateOutputSettings(settings);
}

export function validateMonthlySettings(settings: AppSettings) {
  validateWorkspaceSettings(settings);
  if (!settings.author) throw new Error("请输入 Git 作者");
  validateOutputSettings(settings);
  validateAiSettings(settings);
}

export function validateExtractSettings(settings: AppSettings, dateRange?: DateRange) {
  validateWorkspaceSettings(settings);
  if (!settings.author) throw new Error("请输入 Git 作者");
  const range = dateRange ?? getTodayRange();
  validateDateRange(range.startDate, range.endDate);
  validateAiSettings(settings);
}

export function validateWorkspaceSettings(settings: AppSettings) {
  if (!settings.rootDir) throw new Error("请选择仓库根目录");
}

export function validateOutputSettings(settings: AppSettings) {
  if (settings.outputEnabled && !settings.outputDir) throw new Error("请在设置中选择输出目录");
}

export function validateAiSettings(settings: AppSettings) {
  if (!settings.aiEnabled) return;
  if (!settings.aiModel.trim()) throw new Error("启用 AI 润色时请输入模型名");
  if (settings.aiProvider === "codex-oauth") return;
  if (!settings.aiBaseUrl.trim()) throw new Error("启用 AI 润色时请输入 Base URL");
  if (!settings.aiApiKey.trim()) throw new Error("启用 AI 润色时请输入 API Key");
}

export function validateDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) throw new Error("请选择完整的日期范围");
  if (startDate > endDate) throw new Error("开始日期不能晚于结束日期");
}

function buildAiOptions(settings: AppSettings) {
  return {
    enabled: settings.aiEnabled,
    provider: settings.aiProvider,
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModel,
    apiKey: settings.aiApiKey.trim(),
    temperature: 0.2,
    timeoutSeconds: 60,
  };
}

export function getTodayRange(): DateRange {
  const today = getToday();
  return { startDate: today, endDate: today };
}

export function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function looksLikeEnvVarName(value: string) {
  return ENV_VAR_NAME_PATTERN.test(value);
}
