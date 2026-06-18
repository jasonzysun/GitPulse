export type RepoInfo = {
  path: string;
  name: string;
  branch: string;
};

export type RepoScanProgress = {
  rootDir: string;
  currentPath: string;
  scannedDirs: number;
  foundRepos: number;
  done: boolean;
  cancelled: boolean;
};

export type CommitExtractProgress = {
  totalRepos: number;
  completedRepos: number;
  currentRepo: string;
  commitCount: number;
  warningCount: number;
  concurrency: number;
  done: boolean;
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

export type PeriodReportKind = "weekly" | "monthly";

export type PeriodReportResult = {
  reportText: string;
  outputFile: string;
  warnings: string[];
  startDate: string;
  endDate: string;
  periodLabel: string;
  reportKind: PeriodReportKind;
  projectCount: number;
  commitCount: number;
};

export type PreviewMode = "summary" | "weekly" | "custom" | "monthly";

export type ReportExportFormat = "markdown" | "docx" | "pdf";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type ReportHistoryEntry = {
  id: string;
  mode: PreviewMode;
  title: string;
  range: DateRange;
  periodLabel: string;
  generatedAt: string;
  repoCount: number;
  commitCount: number;
  aiEnhanced: boolean;
  outputFile: string;
  reportText: string;
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

export type ReportTemplateProfile = "auto" | "daily" | "weekly" | "performance" | "concise";

export type AppSettings = {
  onboardingDone: boolean;
  rootDirs: string[];
  outputDir: string;
  outputEnabled: boolean;
  themeMode: ThemeMode;
  author: string;
  disabledRepos: string[];
  extractAllBranches: boolean;
  excludeMergeCommits: boolean;
  excludeRevertCommits: boolean;
  excludeBotCommits: boolean;
  detailedOutput: boolean;
  showProjectAndBranch: boolean;
  showEvidenceDetails: boolean;
  projectNamesText: string;
  aiEnabled: boolean;
  aiProvider: "openai-compatible" | "anthropic-native" | "codex-oauth";
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  aiApiKeySaved: boolean;
  refinementInstruction: string;
  reportTemplateProfile: ReportTemplateProfile;
  dailySystemPrompt: string;
  monthlySystemPrompt: string;
  aiTemperature: number;
};

export type LoadedSettingsState = {
  settings: AppSettings;
  recoveredLegacyApiKey: boolean;
  recoveredCorruptedSettings: boolean;
};

export const STORAGE_KEY = "gitpulse-settings";
const REPO_INDEX_CACHE_KEY = "gitpulse-repo-index-cache";
const REPORT_HISTORY_KEY = "gitpulse-report-history";
const REPORT_HISTORY_LIMIT = 30;
const LEGACY_STORAGE_KEY = "git-report-studio-settings";
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EVIDENCE_PRESERVATION_INSTRUCTION =
  "已启用提交证据详情。请保留每条事项下方的「来源」引用块，不要改写仓库、分支、日期、commit hash 或原始提交信息。";

export type RepoIndexCache = {
  rootDirs: string[];
  repos: RepoInfo[];
  scannedAt: string;
};

// 与 src-tauri/src/ai.rs 的内置默认系统提示词逐字一致。作为可编辑提示词的默认值与“恢复默认”目标；
// 用户留空时后端会回退到同源的 Rust 默认，行为不变。
export const DEFAULT_DAILY_SYSTEM_PROMPT =
  "你是一个严谨的工作日报写作助手。请基于 Git 提交记录润色为当天或指定周期的工作日报，不要虚构没有依据的业务结果、上线结论或百分比。最终输出保持为简洁纯文本或短列表，方便直接复制到工作汇报中。";
export const DEFAULT_WEEKLY_SYSTEM_PROMPT =
  "你是一个严谨的工作周报写作助手。请基于 Git 提交周报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：本周重点、实际完成情况、下周关注。每个模块尽量保留项目分组和可追溯事项。";
export const DEFAULT_MONTHLY_SYSTEM_PROMPT =
  "你是一个严谨的绩效月报写作助手。请基于 Git 提交月报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：项目进度、实际完成情况、当月总结。每个模块下必须继续按照项目分组。";

export const defaultSettings: AppSettings = {
  onboardingDone: false,
  rootDirs: [],
  outputDir: "",
  outputEnabled: false,
  themeMode: "system",
  author: "",
  disabledRepos: [],
  extractAllBranches: false,
  excludeMergeCommits: true,
  excludeRevertCommits: true,
  excludeBotCommits: true,
  detailedOutput: false,
  showProjectAndBranch: true,
  showEvidenceDetails: false,
  projectNamesText: "",
  aiEnabled: false,
  aiProvider: "openai-compatible",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiApiKey: "",
  aiApiKeySaved: false,
  refinementInstruction: "",
  reportTemplateProfile: "auto",
  dailySystemPrompt: DEFAULT_DAILY_SYSTEM_PROMPT,
  monthlySystemPrompt: DEFAULT_MONTHLY_SYSTEM_PROMPT,
  aiTemperature: 0.2,
};

export function loadSettingsState(): LoadedSettingsState {
  const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  if (!saved) {
    return {
      settings: { ...defaultSettings },
      recoveredLegacyApiKey: false,
      recoveredCorruptedSettings: false,
    };
  }

  let rawSettings: Partial<AppSettings> & {
    aiKeyEnv?: string;
    startDate?: string;
    endDate?: string;
    rootDir?: string;
  };
  try {
    rawSettings = JSON.parse(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {
      settings: { ...defaultSettings },
      recoveredLegacyApiKey: false,
      recoveredCorruptedSettings: true,
    };
  }
  if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
    localStorage.removeItem(STORAGE_KEY);
    return {
      settings: { ...defaultSettings },
      recoveredLegacyApiKey: false,
      recoveredCorruptedSettings: true,
    };
  }

  const persistedSettings = { ...rawSettings };
  delete persistedSettings.startDate;
  delete persistedSettings.endDate;
  delete persistedSettings.rootDir;
  const parsed = { ...defaultSettings, ...persistedSettings } as AppSettings;
  parsed.rootDirs = Array.isArray(parsed.rootDirs) ? parsed.rootDirs.filter(isNonEmptyString) : [];
  parsed.disabledRepos = Array.isArray(parsed.disabledRepos)
    ? parsed.disabledRepos.filter(isNonEmptyString).map(stripWindowsVerbatimPrefix)
    : [];
  parsed.aiApiKey = typeof parsed.aiApiKey === "string" ? parsed.aiApiKey : "";
  parsed.aiApiKeySaved = Boolean(parsed.aiApiKeySaved);
  parsed.aiProvider = normalizeAiProvider(parsed.aiProvider);
  parsed.themeMode = normalizeThemeMode(parsed.themeMode);
  parsed.reportTemplateProfile = normalizeReportTemplateProfile(parsed.reportTemplateProfile);
  parsed.excludeMergeCommits = parsed.excludeMergeCommits !== false;
  parsed.excludeRevertCommits = parsed.excludeRevertCommits !== false;
  parsed.excludeBotCommits = parsed.excludeBotCommits !== false;
  parsed.showEvidenceDetails = Boolean(parsed.showEvidenceDetails);
  parsed.aiTemperature = Number.isFinite(parsed.aiTemperature) ? parsed.aiTemperature : defaultSettings.aiTemperature;
  // 旧版本只持久化单个 rootDir 字符串，迁移为 rootDirs 数组，避免老用户工作区配置失效。
  if (parsed.rootDirs.length === 0 && rawSettings.rootDir?.trim()) {
    parsed.rootDirs = [rawSettings.rootDir.trim()];
  }
  // Settings saved before the onboarding flow existed imply a configured workspace.
  if (rawSettings.onboardingDone === undefined && parsed.rootDirs.length > 0) {
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
      recoveredCorruptedSettings: false,
    };
  }
  if (!aiApiKey && legacyAiKeyEnv && looksLikeEnvVarName(legacyAiKeyEnv)) {
    return {
      settings: {
        ...parsed,
        aiApiKey: legacyAiKeyEnv,
      },
      recoveredLegacyApiKey: true,
      recoveredCorruptedSettings: false,
    };
  }

  return {
    settings: parsed,
    recoveredLegacyApiKey: false,
    recoveredCorruptedSettings: false,
  };
}

export function settingsForPersistence(settings: AppSettings): AppSettings {
  const aiApiKey = settings.aiApiKey.trim();
  return {
    ...settings,
    aiApiKey: isAiKeyReference(aiApiKey) ? aiApiKey : "",
  };
}

export function loadRepoIndexCache(rootDirs: string[]): RepoIndexCache | null {
  const saved = localStorage.getItem(REPO_INDEX_CACHE_KEY);
  if (!saved) return null;

  let rawCache: Partial<RepoIndexCache>;
  try {
    rawCache = JSON.parse(saved);
  } catch {
    localStorage.removeItem(REPO_INDEX_CACHE_KEY);
    return null;
  }

  if (!rawCache || typeof rawCache !== "object" || Array.isArray(rawCache)) return null;
  if (!Array.isArray(rawCache.rootDirs) || !samePathSet(rawCache.rootDirs, rootDirs)) return null;
  if (!Array.isArray(rawCache.repos)) return null;

  const repos = rawCache.repos.filter(isRepoInfo);
  return {
    rootDirs: rawCache.rootDirs.filter(isNonEmptyString).map(stripWindowsVerbatimPrefix),
    repos,
    scannedAt: typeof rawCache.scannedAt === "string" ? rawCache.scannedAt : "",
  };
}

export function saveRepoIndexCache(rootDirs: string[], repos: RepoInfo[]) {
  const cache: RepoIndexCache = {
    rootDirs: rootDirs.filter(isNonEmptyString).map(stripWindowsVerbatimPrefix),
    repos,
    scannedAt: new Date().toISOString(),
  };
  localStorage.setItem(REPO_INDEX_CACHE_KEY, JSON.stringify(cache));
}

export function clearRepoIndexCache() {
  localStorage.removeItem(REPO_INDEX_CACHE_KEY);
}

export function loadReportHistory(): ReportHistoryEntry[] {
  const saved = localStorage.getItem(REPORT_HISTORY_KEY);
  if (!saved) return [];

  let rawHistory: unknown;
  try {
    rawHistory = JSON.parse(saved);
  } catch {
    localStorage.removeItem(REPORT_HISTORY_KEY);
    return [];
  }

  if (!Array.isArray(rawHistory)) return [];
  return rawHistory.filter(isReportHistoryEntry).slice(0, REPORT_HISTORY_LIMIT);
}

export function saveReportHistory(entries: ReportHistoryEntry[]): ReportHistoryEntry[] {
  let nextEntries = entries.filter(isReportHistoryEntry).slice(0, REPORT_HISTORY_LIMIT);
  while (nextEntries.length > 0) {
    try {
      localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(nextEntries));
      return nextEntries;
    } catch {
      nextEntries = nextEntries.slice(0, Math.max(0, Math.floor(nextEntries.length / 2)));
    }
  }
  localStorage.removeItem(REPORT_HISTORY_KEY);
  return [];
}

export function rememberReportHistoryEntry(
  entries: ReportHistoryEntry[],
  entry: ReportHistoryEntry,
): ReportHistoryEntry[] {
  return saveReportHistory([entry, ...entries.filter((item) => item.id !== entry.id)]);
}

export function updateReportHistoryEntry(
  entries: ReportHistoryEntry[],
  id: string,
  patch: Partial<Pick<ReportHistoryEntry, "outputFile" | "reportText" | "commitCount" | "generatedAt">>,
): ReportHistoryEntry[] {
  if (!id) return entries;
  const nextEntries = entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  return saveReportHistory(nextEntries);
}

export function clearReportHistory() {
  localStorage.removeItem(REPORT_HISTORY_KEY);
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

// 与 Rust 端 report.rs 的 TRAILING_CONNECTORS 保持一致：映射名末尾可能带连接符，统一去除。
const TRAILING_CONNECTORS = /[-_：:；;、 ]+$/;

// 复刻 Rust resolve_project_name 的查找规则：先精确键 name(branch)，再通配键 name(*)，
// 命中则去掉末尾连接符返回映射名；未配置映射时回退到仓库原名，保证索引展示与报告内容一致。
export function resolveRepoDisplayName(repo: RepoInfo, projectNames: Record<string, string>): string {
  const mapped = projectNames[`${repo.name}(${repo.branch})`] ?? projectNames[`${repo.name}(*)`];
  const trimmed = mapped?.replace(TRAILING_CONNECTORS, "").trim();
  return trimmed ? trimmed : repo.name;
}

export type MappingScope = "all" | "branch";

// 读取某仓库当前生效的映射：精确键 name(branch) 优先（范围=branch），否则通配键 name(*)（范围=all）。
// 都没有时返回空名称、默认范围 all，供弹窗作为初始值。
export function readRepoMapping(
  text: string,
  repo: RepoInfo,
): { scope: MappingScope; displayName: string } {
  const names = parseProjectNames(text);
  const branchKey = `${repo.name}(${repo.branch})`;
  const allKey = `${repo.name}(*)`;
  if (repo.branch && names[branchKey] !== undefined) {
    return { scope: "branch", displayName: names[branchKey] };
  }
  if (names[allKey] !== undefined) {
    return { scope: "all", displayName: names[allKey] };
  }
  return { scope: "all", displayName: "" };
}

// 写入/更新单个仓库的映射：先移除该仓库的两个候选键（name(*) 与 name(branch)）避免切换范围后残留孤儿键，
// 再按所选范围写入新值；名称为空表示清除映射。其他分支的精确键不受影响。
export function upsertRepoMapping(
  text: string,
  repo: RepoInfo,
  scope: MappingScope,
  displayName: string,
): string {
  const allKey = `${repo.name}(*)`;
  const branchKey = `${repo.name}(${repo.branch})`;
  const rows = parseMappingText(text).filter((row) => row.key !== allKey && row.key !== branchKey);
  const trimmed = displayName.trim();
  if (trimmed) {
    const key = scope === "branch" && repo.branch ? branchKey : allKey;
    rows.push({ key, displayName: trimmed });
  }
  return serializeMappingText(rows);
}

export function buildExtractOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  dateRange: DateRange | undefined,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
) {
  const range = dateRange ?? getTodayRange();
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    author: settings.author,
    startDate: range.startDate,
    endDate: range.endDate,
    disabledRepos: settings.disabledRepos,
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    detailedOutput: settings.detailedOutput,
    showProjectAndBranch: settings.showProjectAndBranch,
    showEvidenceDetails: settings.showEvidenceDetails,
    projectNames,
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, "daily"),
    ai: aiEnabled ? buildAiOptions(settings) : { ...buildAiOptions(settings), enabled: false },
  };
}

export function buildMonthlyOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
) {
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: settings.author,
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    disabledRepos: settings.disabledRepos,
    showEvidenceDetails: settings.showEvidenceDetails,
    projectNames,
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, "monthly"),
    ai: aiEnabled ? buildAiOptions(settings) : { ...buildAiOptions(settings), enabled: false },
  };
}

export function buildPeriodReportOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  kind: PeriodReportKind,
  range: DateRange,
  periodLabel: string,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
) {
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: settings.author,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel,
    reportKind: kind,
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    disabledRepos: settings.disabledRepos,
    showEvidenceDetails: settings.showEvidenceDetails,
    projectNames,
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, kind),
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

export function validatePeriodReportSettings(settings: AppSettings, range: DateRange) {
  validateWorkspaceSettings(settings);
  if (!settings.author) throw new Error("请输入 Git 作者");
  validateDateRange(range.startDate, range.endDate);
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
  if (settings.rootDirs.filter((dir) => dir.trim()).length === 0) throw new Error("请选择至少一个仓库根目录");
}

export function validateOutputSettings(settings: AppSettings) {
  if (settings.outputEnabled && !settings.outputDir.trim()) throw new Error("已启用自动保存，请在设置中选择输出目录");
}

export function validateAiSettings(settings: AppSettings) {
  if (!settings.aiEnabled) return;
  if (!settings.aiModel.trim()) throw new Error("启用 AI 润色时请输入模型名");
  if (settings.aiProvider === "codex-oauth") return;
  if (!settings.aiBaseUrl.trim()) throw new Error("启用 AI 润色时请输入 Base URL");
  const aiApiKey = settings.aiApiKey.trim();
  if (!aiApiKey) throw new Error("启用 AI 润色时请输入 API Key");
  validateAiKeyReference(aiApiKey);
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
    temperature: clampTemperature(settings.aiTemperature),
    timeoutSeconds: 60,
  };
}

// AI 采样温度：超出 [0,1] 钳到边界，非数字回退默认 0.2（Anthropic 上限为 1，取并集安全区间）。
function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0, value));
}

// 合并常驻润色指令与本次一次性额外要求，二者皆可为空。
function mergeInstructions(base: string, extra: string): string {
  return [base.trim(), extra.trim()].filter(Boolean).join("\n");
}

function buildReportSystemPrompt(settings: AppSettings, kind: "daily" | PeriodReportKind) {
  return (
    kind === "monthly"
      ? settings.monthlySystemPrompt
      : kind === "weekly"
        ? DEFAULT_WEEKLY_SYSTEM_PROMPT
        : settings.dailySystemPrompt
  );
}

function buildReportRefinementInstruction(settings: AppSettings, extraInstruction: string) {
  const evidenceInstruction = settings.showEvidenceDetails ? EVIDENCE_PRESERVATION_INSTRUCTION : "";
  return mergeInstructions(mergeInstructions(settings.refinementInstruction, evidenceInstruction), extraInstruction);
}

export function getTodayRange(): DateRange {
  const today = getToday();
  return { startDate: today, endDate: today };
}

export function getSingleDayRange(date: string): DateRange {
  return { startDate: date, endDate: date };
}

export function getCurrentWeekRange(): DateRange {
  const today = new Date();
  return getWeekRange(getWeekLabel(today));
}

export function getWeekLabel(date = new Date()) {
  const { year, week } = getIsoWeekParts(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getWeekRange(weekValue: string): DateRange {
  const { year, week } = parseWeekInput(weekValue);
  const januaryFourth = new Date(year, 0, 4);
  const januaryFourthDay = januaryFourth.getDay() || 7;
  const weekOneMonday = addDays(januaryFourth, 1 - januaryFourthDay);
  const start = addDays(weekOneMonday, (week - 1) * 7);
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(addDays(start, 6)),
  };
}

export function getPreviousMonthInput(date = new Date()) {
  return formatMonthInput(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function getMonthRange(monthValue: string): DateRange {
  const parts = parseMonthInput(monthValue);
  const start = new Date(parts.year, parts.month - 1, 1);
  const end = new Date(parts.year, parts.month, 0);
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
  };
}

export function formatMonthLabel(monthValue: string) {
  const parts = parseMonthInput(monthValue);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function isValidMonthInput(monthValue: string) {
  try {
    parseMonthInput(monthValue);
    return true;
  } catch {
    return false;
  }
}

export function getToday() {
  return formatDateInput(new Date());
}

function looksLikeEnvVarName(value: string) {
  return ENV_VAR_NAME_PATTERN.test(value);
}

export function isAiKeyReference(value: string) {
  return looksLikeEnvVarName(value) || value.startsWith("env:");
}

function validateAiKeyReference(value: string) {
  if (!value.startsWith("env:")) return;
  const name = value.slice(4).trim();
  if (!name) {
    throw new Error("API Key 环境变量引用缺少变量名，请填写 env:OPENAI_API_KEY 这类格式");
  }
  if (!looksLikeEnvVarName(name)) {
    throw new Error("API Key 环境变量名格式不正确，请使用 env:OPENAI_API_KEY 这类格式");
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRepoInfo(value: unknown): value is RepoInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const repo = value as Partial<RepoInfo>;
  return isNonEmptyString(repo.path) && isNonEmptyString(repo.name) && typeof repo.branch === "string";
}

function isReportHistoryEntry(value: unknown): value is ReportHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<ReportHistoryEntry>;
  return (
    isNonEmptyString(entry.id)
    && isPreviewMode(entry.mode)
    && isNonEmptyString(entry.title)
    && isDateRange(entry.range)
    && typeof entry.periodLabel === "string"
    && isNonEmptyString(entry.generatedAt)
    && Number.isFinite(entry.repoCount)
    && Number.isFinite(entry.commitCount)
    && typeof entry.aiEnhanced === "boolean"
    && typeof entry.outputFile === "string"
    && typeof entry.reportText === "string"
  );
}

function isPreviewMode(value: unknown): value is PreviewMode {
  return value === "summary" || value === "weekly" || value === "custom" || value === "monthly";
}

function isDateRange(value: unknown): value is DateRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Partial<DateRange>;
  return typeof range.startDate === "string" && typeof range.endDate === "string";
}

function samePathSet(left: unknown[], right: string[]) {
  const normalize = (values: unknown[]) => values
    .filter(isNonEmptyString)
    .map((value) => stripWindowsVerbatimPrefix(value.trim()).toLowerCase())
    .sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeAiProvider(value: unknown): AppSettings["aiProvider"] {
  if (value === "openai-compatible" || value === "anthropic-native" || value === "codex-oauth") {
    return value;
  }
  return defaultSettings.aiProvider;
}

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }
  return defaultSettings.themeMode;
}

function normalizeReportTemplateProfile(value: unknown): ReportTemplateProfile {
  if (value === "auto" || value === "daily" || value === "weekly" || value === "performance" || value === "concise") {
    return value;
  }
  return defaultSettings.reportTemplateProfile;
}

function stripWindowsVerbatimPrefix(path: string) {
  if (path.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${path.slice("\\\\?\\UNC\\".length)}`;
  }
  if (path.startsWith("\\\\?\\")) {
    return path.slice("\\\\?\\".length);
  }
  return path;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthInput(monthValue: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) throw new Error("请选择有效的报告月份");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("请选择有效的报告月份");
  return { year, month };
}

function parseWeekInput(weekValue: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
  if (!match) throw new Error("请选择有效的报告周");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new Error("请选择有效的报告周");
  return { year, week };
}

function getIsoWeekParts(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}
