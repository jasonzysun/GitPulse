use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub branch: String,
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
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    pub root_dir: String,
    pub author: String,
    pub start_date: String,
    pub end_date: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub detailed_output: bool,
    pub show_project_and_branch: bool,
    pub project_names: HashMap<String, String>,
    pub refinement_instruction: String,
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
pub struct MonthlyReportOptions {
    pub root_dir: String,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub project_names: HashMap<String, String>,
    pub refinement_instruction: String,
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
