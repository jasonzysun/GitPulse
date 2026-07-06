use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanProgress {
    pub root_dir: String,
    pub current_path: String,
    pub scanned_dirs: usize,
    pub found_repos: usize,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitExtractProgress {
    pub total_repos: usize,
    pub completed_repos: usize,
    pub current_repo: String,
    pub commit_count: usize,
    pub warning_count: usize,
    pub concurrency: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingEntry {
    pub key: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub user_name: String,
    pub user_email: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRecord {
    pub repo_path: String,
    pub project_name: String,
    pub branch_name: String,
    pub hash: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorAliasGroup {
    pub display_name: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceLinkRule {
    pub prefix: String,
    pub url_template: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub period_label: String,
    #[serde(default = "default_extract_report_kind")]
    pub report_kind: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    pub detailed_output: bool,
    pub show_project_and_branch: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub repos: Vec<RepoInfo>,
    pub commits: Vec<CommitRecord>,
    pub summary_text: String,
    pub detailed_text: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub enabled: bool,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub temperature: f32,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelInfo {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEnhanceOptions {
    pub base_report: String,
    pub start_date: String,
    pub end_date: String,
    pub report_kind: String,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEnhanceResult {
    pub report_text: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticOptions {
    pub root_dirs: Vec<String>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    pub ai_enabled: bool,
    pub ai_provider: String,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key: String,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticItem {
    pub id: String,
    pub label: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    pub items: Vec<DiagnosticItem>,
    pub ok_count: usize,
    pub warning_count: usize,
    pub error_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportFormatTemplates {
    #[serde(default = "default_daily_report_template")]
    pub daily: String,
    #[serde(default = "default_weekly_report_template")]
    pub weekly: String,
    #[serde(default = "default_monthly_report_template")]
    pub monthly: String,
    #[serde(default = "default_custom_report_template")]
    pub custom: String,
}

impl Default for ReportFormatTemplates {
    fn default() -> Self {
        Self {
            daily: default_daily_report_template(),
            weekly: default_weekly_report_template(),
            monthly: default_monthly_report_template(),
            custom: default_custom_report_template(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReportOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReportResult {
    pub report_text: String,
    pub output_file: String,
    pub warnings: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    pub month_label: String,
    pub project_count: usize,
    pub commit_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodReportOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    pub start_date: String,
    pub end_date: String,
    pub period_label: String,
    pub report_kind: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodReportResult {
    pub report_text: String,
    pub output_file: String,
    pub warnings: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    pub period_label: String,
    pub report_kind: String,
    pub project_count: usize,
    pub commit_count: usize,
}

fn default_extract_report_kind() -> String {
    "daily".to_string()
}

fn default_commit_item_prefix_mode() -> String {
    "mapped-project".to_string()
}

fn default_daily_report_template() -> String {
    "{commitItems}".to_string()
}

fn default_weekly_report_template() -> String {
    [
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
    ]
    .join("\n")
}

fn default_monthly_report_template() -> String {
    [
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
    ]
    .join("\n")
}

fn default_custom_report_template() -> String {
    [
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
    ]
    .join("\n")
}
