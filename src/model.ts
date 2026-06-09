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

export type GitIdentity = {
  userName: string;
  userEmail: string;
};

export type AppSettings = {
  rootDir: string;
  outputDir: string;
  outputEnabled: boolean;
  author: string;
  startDate: string;
  endDate: string;
  pullLatestCode: boolean;
  extractAllBranches: boolean;
  detailedOutput: boolean;
  showProjectAndBranch: boolean;
  projectNamesText: string;
  aiEnabled: boolean;
  aiProvider: "openai-compatible" | "anthropic-native";
  aiBaseUrl: string;
  aiModel: string;
  aiKeyEnv: string;
  refinementInstruction: string;
};

export const STORAGE_KEY = "git-report-studio-settings";

export const defaultSettings: AppSettings = {
  rootDir: "",
  outputDir: "",
  outputEnabled: false,
  author: "",
  startDate: getToday(),
  endDate: getToday(),
  pullLatestCode: false,
  extractAllBranches: false,
  detailedOutput: false,
  showProjectAndBranch: true,
  projectNamesText: "",
  aiEnabled: false,
  aiProvider: "openai-compatible",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiKeyEnv: "OPENAI_API_KEY",
  refinementInstruction: "",
};

export function loadSettings(): AppSettings {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultSettings;
  return { ...defaultSettings, ...JSON.parse(saved) };
}

export function parseProjectNames(text: string): Record<string, string> {
  return text.split("\n").reduce<Record<string, string>>((result, line) => {
    const [key, value] = line.split("->").map((part) => part.trim());
    if (key && value) result[key] = value;
    return result;
  }, {});
}

export function buildExtractOptions(settings: AppSettings, projectNames: Record<string, string>) {
  return {
    rootDir: settings.rootDir,
    author: settings.author,
    startDate: settings.startDate,
    endDate: settings.endDate,
    pullLatestCode: settings.pullLatestCode,
    extractAllBranches: settings.extractAllBranches,
    detailedOutput: settings.detailedOutput,
    showProjectAndBranch: settings.showProjectAndBranch,
    projectNames,
  };
}

export function buildMonthlyOptions(settings: AppSettings, projectNames: Record<string, string>) {
  return {
    rootDir: settings.rootDir,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: settings.author,
    pullLatestCode: settings.pullLatestCode,
    extractAllBranches: settings.extractAllBranches,
    projectNames,
    refinementInstruction: settings.refinementInstruction,
    ai: {
      enabled: settings.aiEnabled,
      provider: settings.aiProvider,
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
      apiKeyEnv: settings.aiKeyEnv || "OPENAI_API_KEY",
      temperature: 0.2,
      timeoutSeconds: 60,
    },
  };
}

export function validateRequiredSettings(settings: AppSettings) {
  validateExtractSettings(settings);
  validateOutputSettings(settings);
}

export function validateExtractSettings(settings: AppSettings) {
  validateWorkspaceSettings(settings);
  if (!settings.author) throw new Error("请输入 Git 作者");
}

export function validateWorkspaceSettings(settings: AppSettings) {
  if (!settings.rootDir) throw new Error("请选择仓库根目录");
}

export function validateOutputSettings(settings: AppSettings) {
  if (settings.outputEnabled && !settings.outputDir) throw new Error("请在设置中选择输出目录");
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
