export type ReportFormatKind = "daily" | "weekly" | "monthly" | "custom";

export type ReportTemplateProfile = "standard" | "concise" | "grouped" | "evidence" | "custom";

export type ReportPurposePreset = "custom" | "daily-sync" | "weekly-briefing" | "performance" | "project-review";

export type ReportFormatVariable = {
  token: string;
  label: string;
};

export type ReportTemplateValidationIssue = {
  severity: "info" | "warning";
  message: string;
};

export type ReportPurposePresetOption = {
  id: ReportPurposePreset;
  label: string;
  description: string;
};

export const REPORT_FORMAT_KINDS: ReportFormatKind[] = ["daily", "weekly", "monthly", "custom"];

export const REPORT_PURPOSE_PRESETS: ReportPurposePresetOption[] = [
  { id: "daily-sync", label: "日报同步", description: "短句同步进展，突出当天完成和明日关注" },
  { id: "weekly-briefing", label: "周会汇报", description: "适合例会过会，强调重点、完成和下周计划" },
  { id: "performance", label: "绩效材料", description: "面向绩效归档，突出成果、影响和证据" },
  { id: "project-review", label: "项目复盘", description: "适合阶段复盘，保留背景、完成、问题和后续" },
];

export const REPORT_FORMAT_VARIABLES: ReportFormatVariable[] = [
  { token: "{periodLabel}", label: "周期标题" },
  { token: "{startDate}", label: "开始日期" },
  { token: "{endDate}", label: "结束日期" },
  { token: "{author}", label: "作者" },
  { token: "{projectCount}", label: "项目数量" },
  { token: "{commitCount}", label: "提交事项数" },
  { token: "{projectSections}", label: "项目分组" },
  { token: "{commitItems}", label: "提交事项" },
  { token: "{summary}", label: "总结段落" },
  { token: "{conclusion}", label: "收尾总结" },
  { token: "{nextSteps}", label: "后续关注" },
  { token: "{evidence}", label: "来源证据" },
  { token: "{notes}", label: "生成说明" },
];

export const DEFAULT_DAILY_REPORT_FORMAT_TEMPLATE = "{commitItems}";

export const DEFAULT_WEEKLY_REPORT_FORMAT_TEMPLATE = [
  "# {periodLabel}工作周报",
  "",
  "- 统计周期：{startDate} 至 {endDate}",
  "- 作者：{author}",
  "- 项目数量：{projectCount}",
  "- 提交事项：{commitCount}",
  "",
  "## 一、本周重点",
  "",
  "{summary}",
  "",
  "## 二、实际完成情况",
  "",
  "{projectSections}",
  "",
  "## 三、下周关注",
  "",
  "{nextSteps}",
  "",
  "{notes}",
].join("\n");

export const DEFAULT_MONTHLY_REPORT_FORMAT_TEMPLATE = [
  "# {periodLabel}工作月报",
  "",
  "- 统计周期：{startDate} 至 {endDate}",
  "- 作者：{author}",
  "- 项目数量：{projectCount}",
  "- 提交事项：{commitCount}",
  "",
  "## 一、项目进度",
  "",
  "{summary}",
  "",
  "## 二、实际完成情况",
  "",
  "{projectSections}",
  "",
  "## 三、当月总结",
  "",
  "{conclusion}",
  "",
  "{notes}",
].join("\n");

export const DEFAULT_CUSTOM_REPORT_FORMAT_TEMPLATE = [
  "# {periodLabel}工作报告",
  "",
  "- 统计周期：{startDate} 至 {endDate}",
  "- 作者：{author}",
  "- 项目数量：{projectCount}",
  "- 提交事项：{commitCount}",
  "",
  "{projectSections}",
  "",
  "{evidence}",
].join("\n");

export function defaultReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "weekly") return DEFAULT_WEEKLY_REPORT_FORMAT_TEMPLATE;
  if (kind === "monthly") return DEFAULT_MONTHLY_REPORT_FORMAT_TEMPLATE;
  if (kind === "custom") return DEFAULT_CUSTOM_REPORT_FORMAT_TEMPLATE;
  return DEFAULT_DAILY_REPORT_FORMAT_TEMPLATE;
}

export function profileReportFormatTemplate(profile: ReportTemplateProfile, kind: ReportFormatKind) {
  if (profile === "concise") return conciseReportFormatTemplate(kind);
  if (profile === "grouped") return groupedReportFormatTemplate(kind);
  if (profile === "evidence") return evidenceReportFormatTemplate(kind);
  return defaultReportFormatTemplate(kind);
}

export function purposeReportFormatTemplate(purpose: ReportPurposePreset, kind: ReportFormatKind) {
  if (purpose === "daily-sync") return dailySyncReportFormatTemplate(kind);
  if (purpose === "weekly-briefing") return weeklyBriefingReportFormatTemplate(kind);
  if (purpose === "performance") return performanceReportFormatTemplate(kind);
  if (purpose === "project-review") return projectReviewReportFormatTemplate(kind);
  return defaultReportFormatTemplate(kind);
}

export function purposeRefinementInstruction(purpose: ReportPurposePreset) {
  if (purpose === "daily-sync") {
    return "报告用途：日报同步。请保持内容简洁、直接、可复制，优先说明当天完成、阻塞风险和下一步，不要扩写成复盘文章。";
  }
  if (purpose === "weekly-briefing") {
    return "报告用途：周会汇报。请将提交记录组织为可口头汇报的周会材料，突出本周重点、已完成事项、风险和下周计划。";
  }
  if (purpose === "performance") {
    return "报告用途：绩效材料。请强调可验证成果、业务影响、协作贡献和证据依据，不要编造没有提交支撑的指标或结论。";
  }
  if (purpose === "project-review") {
    return "报告用途：项目复盘。请围绕目标、完成情况、问题风险、经验沉淀和后续动作组织内容，保留可追溯事项。";
  }
  return "";
}

export function validateReportFormatTemplate(template: string): ReportTemplateValidationIssue[] {
  const trimmed = template.trim();
  if (!trimmed) {
    return [{ severity: "info", message: "模板为空时会使用当前报告类型的默认结构。" }];
  }

  const allowedTokens = new Set(REPORT_FORMAT_VARIABLES.map((variable) => variable.token));
  const tokens = [...new Set(trimmed.match(/\{[A-Za-z][A-Za-z0-9]*\}/g) ?? [])];
  const unknownTokens = tokens.filter((token) => !allowedTokens.has(token));
  const issues: ReportTemplateValidationIssue[] = [];
  if (unknownTokens.length > 0) {
    issues.push({ severity: "warning", message: `未识别变量：${unknownTokens.join("、")}` });
  }
  if (!tokens.some((token) => CONTENT_TOKENS.has(token))) {
    issues.push({ severity: "warning", message: "模板缺少内容变量，生成结果可能只剩标题或说明。" });
  }
  if (issues.length === 0) {
    issues.push({ severity: "info", message: "模板变量可用。" });
  }
  return issues;
}

const CONTENT_TOKENS = new Set(["{projectSections}", "{commitItems}", "{summary}", "{conclusion}", "{evidence}"]);

function conciseReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "daily") {
    return ["【{periodLabel}】", "{commitItems}"].join("\n");
  }
  return ["# {periodLabel}", "", "{summary}", "", "{commitItems}"].join("\n");
}

function groupedReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "monthly") {
    return [
      "# {periodLabel}阶段进展",
      "",
      "## 重点推进",
      "",
      "{summary}",
      "",
      "## 已完成事项",
      "",
      "{projectSections}",
      "",
      "## 后续关注",
      "",
      "{nextSteps}",
    ].join("\n");
  }
  if (kind === "daily") {
    return ["# {periodLabel}日报", "", "## 今日完成", "", "{commitItems}", "", "## 后续关注", "", "{nextSteps}"].join("\n");
  }
  if (kind === "custom") {
    return [
      "# {periodLabel}工作报告",
      "",
      "## 重点概览",
      "",
      "{summary}",
      "",
      "## 完成事项",
      "",
      "{projectSections}",
      "",
      "## 后续关注",
      "",
      "{nextSteps}",
    ].join("\n");
  }
  return [
    "# {periodLabel}周报",
    "",
    "## 本周重点",
    "",
    "{summary}",
    "",
    "## 完成事项",
    "",
    "{projectSections}",
    "",
    "## 下周关注",
    "",
    "{nextSteps}",
  ].join("\n");
}

function evidenceReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "daily") {
    return ["# {periodLabel}工作记录", "", "{commitItems}", "", "{evidence}"].join("\n");
  }
  return [
    "# {periodLabel}工作报告",
    "",
    "- 统计周期：{startDate} 至 {endDate}",
    "- 汇报人：{author}",
    "",
    "## 一、项目进度",
    "",
    "{summary}",
    "",
    "## 二、实际完成情况",
    "",
    "{projectSections}",
    "",
    "## 三、可追溯依据",
    "",
    "{evidence}",
    "",
    "{notes}",
  ].join("\n");
}

function dailySyncReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "daily") {
    return ["# {periodLabel}日报同步", "", "## 今日完成", "", "{commitItems}", "", "## 明日关注", "", "{nextSteps}"].join("\n");
  }
  return ["# {periodLabel}同步材料", "", "## 重点进展", "", "{summary}", "", "## 完成事项", "", "{projectSections}", "", "## 后续关注", "", "{nextSteps}"].join("\n");
}

function weeklyBriefingReportFormatTemplate(kind: ReportFormatKind) {
  if (kind === "daily") {
    return ["# {periodLabel}同步记录", "", "{commitItems}", "", "## 需要同步", "", "{nextSteps}"].join("\n");
  }
  return ["# {periodLabel}周会汇报", "", "## 本期重点", "", "{summary}", "", "## 完成情况", "", "{projectSections}", "", "## 下期计划", "", "{nextSteps}", "", "{notes}"].join("\n");
}

function performanceReportFormatTemplate(kind: ReportFormatKind) {
  const title = kind === "monthly" ? "# {periodLabel}绩效月报" : "# {periodLabel}绩效材料";
  return [title, "", "- 统计周期：{startDate} 至 {endDate}", "- 作者：{author}", "- 项目数量：{projectCount}", "- 提交事项：{commitCount}", "", "## 一、关键成果", "", "{summary}", "", "## 二、工作量佐证", "", "{projectSections}", "", "## 三、影响与复盘", "", "{conclusion}", "", "## 四、证据依据", "", "{evidence}", "", "{notes}"].join("\n");
}

function projectReviewReportFormatTemplate(kind: ReportFormatKind) {
  const title = kind === "weekly" ? "# {periodLabel}项目周复盘" : "# {periodLabel}项目复盘";
  return [title, "", "## 背景与目标", "", "{summary}", "", "## 完成情况", "", "{projectSections}", "", "## 问题与经验", "", "{conclusion}", "", "## 后续动作", "", "{nextSteps}", "", "{evidence}"].join("\n");
}
