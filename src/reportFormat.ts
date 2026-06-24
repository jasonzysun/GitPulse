export type ReportFormatKind = "daily" | "weekly" | "monthly" | "custom";

export type ReportTemplateProfile = "standard" | "concise" | "grouped" | "evidence" | "custom";

export type ReportFormatVariable = {
  token: string;
  label: string;
};

export const REPORT_FORMAT_KINDS: ReportFormatKind[] = ["daily", "weekly", "monthly", "custom"];

export const REPORT_FORMAT_VARIABLES: ReportFormatVariable[] = [
  { token: "{periodLabel}", label: "周期标题" },
  { token: "{startDate}", label: "开始日期" },
  { token: "{endDate}", label: "结束日期" },
  { token: "{author}", label: "作者" },
  { token: "{projectSections}", label: "项目分组" },
  { token: "{commitItems}", label: "提交事项" },
  { token: "{summary}", label: "总结段落" },
  { token: "{nextSteps}", label: "后续关注" },
  { token: "{evidence}", label: "来源证据" },
  { token: "{notes}", label: "生成说明" },
];

export const DEFAULT_DAILY_REPORT_FORMAT_TEMPLATE = "{commitItems}";

export const DEFAULT_WEEKLY_REPORT_FORMAT_TEMPLATE = [
  "# {periodLabel}工作周报",
  "",
  "- 统计周期：{startDate} 至 {endDate}",
  "- 汇报人：{author}",
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
  "## 三、当月总结",
  "",
  "{summary}",
  "",
  "{notes}",
].join("\n");

export const DEFAULT_CUSTOM_REPORT_FORMAT_TEMPLATE = [
  "# {periodLabel}工作报告",
  "",
  "- 统计周期：{startDate} 至 {endDate}",
  "- 汇报人：{author}",
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
