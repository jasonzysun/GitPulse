use crate::models::{CommitRecord, ExtractResult, MonthlyReportResult, RepoInfo};
use chrono::{Datelike, Duration, Local, NaiveDate};
use regex::Regex;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::PathBuf;

pub fn previous_month_range() -> (String, String, String) {
    let today = Local::now().date_naive();
    previous_month_range_from(today)
}

pub fn previous_month_range_from(today: NaiveDate) -> (String, String, String) {
    let first_this_month = today.with_day(1).unwrap();
    let last_previous_month = first_this_month - Duration::days(1);
    let first_previous_month = last_previous_month.with_day(1).unwrap();
    (
        first_previous_month.format("%Y-%m-%d").to_string(),
        last_previous_month.format("%Y-%m-%d").to_string(),
        first_previous_month.format("%Y-%m").to_string(),
    )
}

pub fn build_extract_result(
    repos: Vec<RepoInfo>,
    commits: Vec<CommitRecord>,
    warnings: Vec<String>,
    project_names: &HashMap<String, String>,
    show_project_and_branch: bool,
    detailed_output: bool,
) -> ExtractResult {
    ExtractResult {
        summary_text: render_summary_text(&commits, project_names, show_project_and_branch),
        detailed_text: if detailed_output {
            render_detailed_text(&commits)
        } else {
            String::new()
        },
        repos,
        commits,
        warnings,
    }
}

pub fn render_summary_text(
    commits: &[CommitRecord],
    project_names: &HashMap<String, String>,
    show_project_and_branch: bool,
) -> String {
    commits
        .iter()
        .map(|commit| render_summary_line(commit, project_names, show_project_and_branch))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn render_monthly_report(
    commits: &[CommitRecord],
    project_names: &HashMap<String, String>,
    start_date: &str,
    end_date: &str,
    author: &str,
    month_label: &str,
) -> String {
    let groups = group_commits_by_project(commits, project_names);
    let mut lines = render_monthly_header(
        groups.len(),
        commits.len(),
        start_date,
        end_date,
        author,
        month_label,
    );
    lines.extend(render_project_progress(&groups));
    lines.extend(render_actual_completion(&groups));
    lines.extend(render_monthly_summary(&groups));
    lines.push(
        "> 说明：本报告基于 Git 提交记录生成，业务指标和验收结论建议结合绩效口径补充。".to_string(),
    );
    lines.join("\n")
}

pub fn save_report_file(
    output_dir: &str,
    file_name: &str,
    content: &str,
) -> Result<String, String> {
    let trimmed_dir = output_dir.trim();
    if trimmed_dir.is_empty() {
        return Err("请先在设置中选择输出目录".to_string());
    }

    let dir = PathBuf::from(trimmed_dir);
    if !dir.exists() {
        return Err(format!(
            "输出目录不存在或当前无法访问：{}。请在设置中重新选择可用目录。",
            trimmed_dir
        ));
    }
    if !dir.is_dir() {
        return Err(format!(
            "输出路径不是文件夹：{}。请在设置中选择一个文件夹作为输出目录。",
            trimmed_dir
        ));
    }

    let output_file = dir.join(file_name);
    fs::write(&output_file, content).map_err(|err| {
        format!(
            "写入报告失败：{}。请确认输出目录有写入权限：{}",
            err, trimmed_dir
        )
    })?;
    Ok(output_file.to_string_lossy().to_string())
}

pub fn build_monthly_result(
    report_text: String,
    output_file: String,
    warnings: Vec<String>,
    dates: (String, String, String),
    project_count: usize,
    commit_count: usize,
) -> MonthlyReportResult {
    MonthlyReportResult {
        report_text,
        output_file,
        warnings,
        start_date: dates.0,
        end_date: dates.1,
        month_label: dates.2,
        project_count,
        commit_count,
    }
}

fn render_detailed_text(commits: &[CommitRecord]) -> String {
    commits
        .iter()
        .map(|commit| {
            format!(
                "Repository: {}\nHash: {}\nAuthor: {}\nDate: {}\nMessage: {}\n",
                commit.repo_path, commit.hash, commit.author, commit.date, commit.message
            )
        })
        .collect::<Vec<_>>()
        .join("\n========================================\n")
}

/// 映射名末尾可能带各种连接符（也可能不带）。统一在此规整：由系统补连接符，
/// 用户无需手动维护，同时兼容历史上已手动加了 "-" 的映射。
const TRAILING_CONNECTORS: [char; 8] = ['-', '_', '：', ':', '；', ';', '、', ' '];

fn render_summary_line(
    commit: &CommitRecord,
    project_names: &HashMap<String, String>,
    show_project_and_branch: bool,
) -> String {
    let prefix = display_prefix(&resolve_project_name(project_names, commit));
    let message = clean_commit_message(&commit.message);
    if show_project_and_branch {
        format!(
            "{}({}) - {}{}",
            commit.project_name, commit.branch_name, prefix, message
        )
    } else {
        format!("{}{}", prefix, message)
    }
}

/// 将映射名转成展示前缀：去掉末尾已有的连接符后统一补一个 " - "。
/// 未配置映射（名称为空）时返回空串，保持"仅展示提交内容"的既有行为。
fn display_prefix(display_name: &str) -> String {
    let trimmed = display_name.trim_end_matches(TRAILING_CONNECTORS);
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{} - ", trimmed)
    }
}

fn clean_commit_message(message: &str) -> String {
    let prefix =
        Regex::new(r"(?i)^(feat|fix|refactor|chore|docs|style|test|perf|ci|build|revert|init):\s*")
            .unwrap();
    let no_prefix = prefix.replace(message, "");
    let flattened = no_prefix.replace('"', "").replace("['']", "");
    let whitespace = Regex::new(r"\s+").unwrap().replace_all(&flattened, " ");
    Regex::new(r"\s+-\s+")
        .unwrap()
        .replace_all(whitespace.trim(), "；")
        .to_string()
}

fn resolve_project_name(project_names: &HashMap<String, String>, commit: &CommitRecord) -> String {
    let exact_key = format!("{}({})", commit.project_name, commit.branch_name);
    project_names
        .get(&exact_key)
        .or_else(|| project_names.get(&format!("{}(*)", commit.project_name)))
        .cloned()
        .unwrap_or_default()
}

fn group_commits_by_project(
    commits: &[CommitRecord],
    project_names: &HashMap<String, String>,
) -> BTreeMap<String, Vec<String>> {
    let mut groups = BTreeMap::new();
    for commit in commits {
        let name = monthly_project_name(project_names, commit);
        groups
            .entry(name)
            .or_insert_with(Vec::new)
            .push(clean_commit_message(&commit.message));
    }
    groups
}

fn monthly_project_name(project_names: &HashMap<String, String>, commit: &CommitRecord) -> String {
    let custom_name = resolve_project_name(project_names, commit);
    let trimmed = custom_name.trim_end_matches(TRAILING_CONNECTORS);
    if trimmed.is_empty() {
        format!("{}({})", commit.project_name, commit.branch_name)
    } else {
        trimmed.to_string()
    }
}

fn render_monthly_header(
    project_count: usize,
    commit_count: usize,
    start_date: &str,
    end_date: &str,
    author: &str,
    month_label: &str,
) -> Vec<String> {
    vec![
        format!("# {}工作月报", format_month_title(month_label)),
        "".to_string(),
        format!("- 统计周期：{} 至 {}", start_date, end_date),
        format!(
            "- 作者：{}",
            if author.is_empty() {
                "未指定"
            } else {
                author
            }
        ),
        format!("- 项目数量：{}", project_count),
        format!("- 提交事项：{}", commit_count),
        "".to_string(),
    ]
}

fn render_project_progress(groups: &BTreeMap<String, Vec<String>>) -> Vec<String> {
    let mut lines = vec!["## 一、项目进度".to_string(), "".to_string()];
    if groups.is_empty() {
        lines.push("- 本月未检索到可用于生成项目进度的提交记录。".to_string());
        lines.push("".to_string());
        return lines;
    }
    for (project, items) in groups {
        lines.push(format!("### {}", project));
        lines.push(format!(
            "- 本月共推进 {} 项可追踪事项，主要集中在：{}。",
            unique_items(items).len(),
            join_focus_items(items)
        ));
        lines.push(
            "- 当前进度：相关开发、修复或优化事项已有提交记录，可作为阶段性推进依据。".to_string(),
        );
        lines.push("".to_string());
    }
    lines
}

fn render_actual_completion(groups: &BTreeMap<String, Vec<String>>) -> Vec<String> {
    let mut lines = vec!["## 二、实际完成情况".to_string(), "".to_string()];
    for (project, items) in groups {
        lines.push(format!("### {}", project));
        for item in unique_items(items) {
            lines.push(format!("- {}", item));
        }
        lines.push("".to_string());
    }
    lines
}

fn render_monthly_summary(groups: &BTreeMap<String, Vec<String>>) -> Vec<String> {
    let mut lines = vec!["## 三、当月总结".to_string(), "".to_string()];
    for (project, items) in groups {
        let item_count = unique_items(items).len();
        lines.push(format!("### {}", project));
        lines.push(format!(
            "- 本月围绕 {} 完成了 {} 项开发记录，工作内容覆盖 {}。",
            project,
            item_count,
            join_focus_items(items)
        ));
        lines.push("- 整体来看，本月工作以交付可验证事项为主，后续可结合测试、上线和业务反馈补充结果指标。".to_string());
        lines.push("".to_string());
    }
    lines
}

fn unique_items(items: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    for item in items {
        if !result.contains(item) {
            result.push(item.clone());
        }
    }
    result
}

fn join_focus_items(items: &[String]) -> String {
    let unique = unique_items(items);
    let selected = unique.iter().take(3).cloned().collect::<Vec<_>>();
    let suffix = if unique.len() > 3 { "等内容" } else { "" };
    format!("{}{}", selected.join("；"), suffix)
}

fn format_month_title(month_label: &str) -> String {
    let parts = month_label.split('-').collect::<Vec<_>>();
    if parts.len() != 2 {
        return month_label.to_string();
    }
    format!("{}年{}月", parts[0], parts[1].trim_start_matches('0'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn previous_month_handles_year_boundary() {
        let date = NaiveDate::from_ymd_opt(2026, 1, 5).unwrap();
        let range = previous_month_range_from(date);
        assert_eq!(
            ("2025-12-01".into(), "2025-12-31".into(), "2025-12".into()),
            range
        );
    }

    #[test]
    fn save_report_file_rejects_missing_output_dir_with_actionable_message() {
        let missing = std::env::temp_dir().join("gitpulse-missing-output-dir-for-test");
        let _ = fs::remove_dir_all(&missing);

        let message =
            save_report_file(&missing.to_string_lossy(), "report.md", "content").unwrap_err();

        assert!(message.contains("输出目录不存在"));
        assert!(message.contains("重新选择"));
    }

    #[test]
    fn save_report_file_rejects_file_as_output_dir() {
        let path =
            std::env::temp_dir().join(format!("gitpulse-output-file-{}", std::process::id()));
        fs::write(&path, "not a dir").unwrap();

        let message =
            save_report_file(&path.to_string_lossy(), "report.md", "content").unwrap_err();

        assert!(message.contains("不是文件夹"));
        let _ = fs::remove_file(path);
    }
}
