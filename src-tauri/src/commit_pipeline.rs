//! 报告编排与提交提取管线：从仓库索引 + 提取选项抽出 commit，渲染成报告，可选 AI 润色，可选落盘。
//!
//! 这一层是纯粹的本地业务编排：它不感知 Tauri IPC，只接 ` models` 结构、`git_ops` 的提交提取与 `report` 的渲染。
//! `lib.rs` 的 `#[tauri::command]` 仅作 transport 薄封装，把进度回调桥接到 Tauri 事件。

use crate::ai;
use crate::git_ops;
use crate::models::{
    AuthorAliasGroup, CommitExtractProgress, CommitRecord, ExtractOptions, ExtractResult,
    MonthlyReportOptions, MonthlyReportResult, PeriodReportOptions, PeriodReportResult, RepoInfo,
    ReportEnhanceOptions, ReportEnhanceResult,
};
use crate::report;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

pub fn generate_monthly_report_sync<F>(
    options: MonthlyReportOptions,
    on_progress: F,
) -> Result<MonthlyReportResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let dates = report::previous_month_range();
    let extract_options = monthly_extract_options(&options, &dates.0, &dates.1);
    let (_, commits, mut warnings) = collect_commits(&extract_options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut report_text = if options.redaction.enabled {
        report::render_monthly_report_with_redaction(
            &commits,
            &options.project_names,
            &dates.0,
            &dates.1,
            &report_author,
            &dates.2,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
            &options.redaction,
        )
    } else {
        report::render_monthly_report_with_template(
            &commits,
            &options.project_names,
            &dates.0,
            &dates.1,
            &report_author,
            &dates.2,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
        )
    };

    report_text = apply_ai_if_enabled(report_text, &options, &dates, &report_author, &mut warnings);
    let output_file = save_monthly_if_enabled(&options, &dates.2, &report_text)?;
    let project_count = count_projects(&commits, &options.project_names);
    Ok(report::build_monthly_result(
        report_text,
        output_file,
        warnings,
        dates,
        project_count,
        commits.len(),
    ))
}

pub fn generate_period_report_sync<F>(
    options: PeriodReportOptions,
    on_progress: F,
) -> Result<PeriodReportResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    validate_period_options(&options)?;
    let dates = (
        options.start_date.clone(),
        options.end_date.clone(),
        options.period_label.clone(),
    );
    let extract_options = period_extract_options(&options);
    let (_, commits, mut warnings) = collect_commits(&extract_options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut report_text = match options.report_kind.as_str() {
        "weekly" if options.redaction.enabled => report::render_weekly_report_with_redaction(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.weekly,
            &options.redaction,
        ),
        "weekly" => report::render_weekly_report_with_template(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.weekly,
        ),
        "monthly" if options.redaction.enabled => report::render_monthly_report_with_redaction(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
            &options.redaction,
        ),
        "monthly" => report::render_monthly_report_with_template(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
        ),
        _ => return Err(format!("未知报告类型：{}", options.report_kind)),
    };

    report_text =
        apply_ai_to_period_report(report_text, &options, &dates, &report_author, &mut warnings);
    let output_file = save_period_if_enabled(&options, &report_text)?;
    let project_count = count_projects(&commits, &options.project_names);
    Ok(report::build_period_result(
        report_text,
        output_file,
        warnings,
        dates,
        options.report_kind,
        project_count,
        commits.len(),
    ))
}

pub fn enhance_report_sync(options: ReportEnhanceOptions) -> Result<ReportEnhanceResult, String> {
    let base_report = options.base_report;
    if base_report.trim().is_empty() {
        return Err("当前报告为空，请先生成报告再润色".to_string());
    }

    let report_author = report_author(&options.author_display_name, &options.author);
    let result = match options.report_kind.as_str() {
        "weekly" => ai::enhance_weekly_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        "monthly" => ai::enhance_monthly_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        _ => ai::enhance_daily_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
    };

    let mut warnings = Vec::new();
    let report_text = result.unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已保留当前报告：{}", err));
        base_report
    });

    Ok(ReportEnhanceResult {
        report_text,
        warnings,
    })
}

pub fn extract_commits_sync<F>(
    options: ExtractOptions,
    on_progress: F,
) -> Result<ExtractResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let (repos, commits, warnings) = collect_commits(&options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut result = report::build_extract_result(
        repos,
        commits,
        warnings,
        &options.project_names,
        options.show_project_and_branch,
        &options.commit_item_prefix_mode,
        options.show_evidence_details,
        options.detailed_output,
        &options.redaction,
        report::ExtractReportFormat {
            start_date: &options.start_date,
            end_date: &options.end_date,
            author: &report_author,
            period_label: &options.period_label,
            report_kind: &options.report_kind,
            evidence_link_rules: &options.evidence_link_rules,
            templates: &options.report_format_templates,
        },
    );
    apply_ai_to_extract_result(&mut result, &options, &report_author);
    Ok(result)
}

fn save_monthly_if_enabled(
    options: &MonthlyReportOptions,
    month_label: &str,
    report_text: &str,
) -> Result<String, String> {
    if !options.output_enabled {
        return Ok(String::new());
    }
    let file_name = format!("monthly_report_{}.md", month_label);
    report::save_report_file(&options.output_dir, &file_name, report_text)
}

fn save_period_if_enabled(
    options: &PeriodReportOptions,
    report_text: &str,
) -> Result<String, String> {
    if !options.output_enabled {
        return Ok(String::new());
    }
    let prefix = match options.report_kind.as_str() {
        "weekly" => "weekly_report",
        "monthly" => "monthly_report",
        _ => "period_report",
    };
    let file_name = format!("{}_{}.md", prefix, options.period_label);
    report::save_report_file(&options.output_dir, &file_name, report_text)
}

fn collect_commits<F>(
    options: &ExtractOptions,
    on_progress: F,
) -> Result<(Vec<RepoInfo>, Vec<CommitRecord>, Vec<String>), String>
where
    F: FnMut(CommitExtractProgress),
{
    let mut on_progress = on_progress;
    let repos = resolve_report_repos(options)?;
    let disabled_repos: HashSet<&str> = options.disabled_repos.iter().map(String::as_str).collect();
    let enabled_repos: Vec<RepoInfo> = repos
        .iter()
        .filter(|repo| !disabled_repos.contains(repo.path.as_str()))
        .cloned()
        .collect();
    let concurrency = commit_extract_parallelism(enabled_repos.len());

    emit_commit_progress(
        &mut on_progress,
        CommitExtractProgress {
            total_repos: enabled_repos.len(),
            completed_repos: 0,
            current_repo: String::new(),
            commit_count: 0,
            warning_count: 0,
            concurrency,
            done: enabled_repos.is_empty(),
        },
    );

    let (mut commits, warnings) = collect_enabled_repo_commits_parallel(
        &enabled_repos,
        options,
        concurrency,
        &mut on_progress,
    )?;
    normalize_commits(&mut commits);
    apply_author_aliases(&mut commits, &options.author_aliases);

    emit_commit_progress(
        &mut on_progress,
        CommitExtractProgress {
            total_repos: enabled_repos.len(),
            completed_repos: enabled_repos.len(),
            current_repo: String::new(),
            commit_count: commits.len(),
            warning_count: warnings.len(),
            concurrency,
            done: true,
        },
    );

    Ok((repos, commits, warnings))
}

fn resolve_report_repos(options: &ExtractOptions) -> Result<Vec<RepoInfo>, String> {
    if options.indexed_repos.is_empty() {
        return git_ops::find_git_repos(&options.root_dirs);
    }

    let mut seen = HashSet::new();
    let mut repos = Vec::new();
    for repo in &options.indexed_repos {
        if repo.path.trim().is_empty() || repo.name.trim().is_empty() {
            continue;
        }
        if seen.insert(repo.path.clone()) {
            repos.push(repo.clone());
        }
    }
    repos.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(repos)
}

fn collect_enabled_repo_commits_parallel<F>(
    repos: &[RepoInfo],
    options: &ExtractOptions,
    concurrency: usize,
    on_progress: &mut F,
) -> Result<(Vec<CommitRecord>, Vec<String>), String>
where
    F: FnMut(CommitExtractProgress),
{
    if repos.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }

    let (receiver, handles) = spawn_commit_workers(repos, options, concurrency);
    let results = gather_commit_results(receiver, repos.len(), concurrency, on_progress);
    wait_commit_workers(handles)?;
    merge_commit_results(results)
}

fn spawn_commit_workers(
    repos: &[RepoInfo],
    options: &ExtractOptions,
    concurrency: usize,
) -> (
    mpsc::Receiver<CommitExtractionResult>,
    Vec<thread::JoinHandle<()>>,
) {
    let jobs = Arc::new(Mutex::new(VecDeque::from(
        repos
            .iter()
            .cloned()
            .enumerate()
            .map(|(index, repo)| CommitExtractionJob { index, repo })
            .collect::<Vec<_>>(),
    )));
    let query = CommitQuerySettings::from(options);
    let (sender, receiver) = mpsc::channel();
    let mut handles = Vec::new();
    for _ in 0..concurrency {
        let jobs = Arc::clone(&jobs);
        let sender = sender.clone();
        let query = query.clone();
        handles.push(thread::spawn(move || loop {
            let job = {
                let mut jobs = jobs.lock().expect("commit extraction job queue poisoned");
                jobs.pop_front()
            };
            let Some(job) = job else {
                break;
            };
            let git_query = git_ops::GitCommitQuery {
                start_date: &query.start_date,
                end_date: &query.end_date,
                author: &query.author,
                extract_all_branches: query.extract_all_branches,
                exclude_merge_commits: query.exclude_merge_commits,
                exclude_revert_commits: query.exclude_revert_commits,
                exclude_bot_commits: query.exclude_bot_commits,
            };
            let records = git_ops::get_git_commits(&job.repo, &git_query);
            if sender
                .send(CommitExtractionResult {
                    index: job.index,
                    repo_name: job.repo.name,
                    records,
                })
                .is_err()
            {
                break;
            }
        }));
    }
    drop(sender);
    (receiver, handles)
}

fn gather_commit_results<F>(
    receiver: mpsc::Receiver<CommitExtractionResult>,
    repo_count: usize,
    concurrency: usize,
    on_progress: &mut F,
) -> Vec<Option<CommitExtractionResult>>
where
    F: FnMut(CommitExtractProgress),
{
    let mut completed_repos = 0;
    let mut commit_count = 0;
    let mut warning_count = 0;
    let mut results: Vec<Option<CommitExtractionResult>> = (0..repo_count).map(|_| None).collect();
    for result in receiver {
        completed_repos += 1;
        match &result.records {
            Ok(records) => commit_count += records.len(),
            Err(_) => warning_count += 1,
        }
        emit_commit_progress(
            on_progress,
            CommitExtractProgress {
                total_repos: repo_count,
                completed_repos,
                current_repo: result.repo_name.clone(),
                commit_count,
                warning_count,
                concurrency,
                done: false,
            },
        );
        let index = result.index;
        results[index] = Some(result);
    }
    results
}

fn wait_commit_workers(handles: Vec<thread::JoinHandle<()>>) -> Result<(), String> {
    for handle in handles {
        handle
            .join()
            .map_err(|_| "提取提交的工作线程异常退出".to_string())?;
    }
    Ok(())
}

fn merge_commit_results(
    results: Vec<Option<CommitExtractionResult>>,
) -> Result<(Vec<CommitRecord>, Vec<String>), String> {
    let mut commits = Vec::new();
    let mut warnings = Vec::new();
    for result in results {
        let result = result.ok_or_else(|| "提取提交任务未完整返回".to_string())?;
        match result.records {
            Ok(mut records) => commits.append(&mut records),
            Err(err) => warnings.push(format!("{}：{}", result.repo_name, err)),
        }
    }

    Ok((commits, warnings))
}

fn emit_commit_progress<F>(on_progress: &mut F, progress: CommitExtractProgress)
where
    F: FnMut(CommitExtractProgress),
{
    on_progress(progress);
}

fn commit_extract_parallelism(repo_count: usize) -> usize {
    if repo_count <= 1 {
        return repo_count;
    }
    let cpu_count = thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4);
    cpu_count.clamp(2, 8).min(repo_count)
}

#[derive(Clone)]
struct CommitQuerySettings {
    start_date: String,
    end_date: String,
    author: String,
    extract_all_branches: bool,
    exclude_merge_commits: bool,
    exclude_revert_commits: bool,
    exclude_bot_commits: bool,
}

impl From<&ExtractOptions> for CommitQuerySettings {
    fn from(options: &ExtractOptions) -> Self {
        Self {
            start_date: options.start_date.clone(),
            end_date: options.end_date.clone(),
            author: options.author.clone(),
            extract_all_branches: options.extract_all_branches,
            exclude_merge_commits: options.exclude_merge_commits,
            exclude_revert_commits: options.exclude_revert_commits,
            exclude_bot_commits: options.exclude_bot_commits,
        }
    }
}

struct CommitExtractionJob {
    index: usize,
    repo: RepoInfo,
}

struct CommitExtractionResult {
    index: usize,
    repo_name: String,
    records: Result<Vec<CommitRecord>, String>,
}

fn normalize_commits(commits: &mut Vec<CommitRecord>) {
    commits.sort_by(|left, right| {
        right
            .date
            .cmp(&left.date)
            .then_with(|| left.repo_path.cmp(&right.repo_path))
            .then_with(|| left.hash.cmp(&right.hash))
    });

    let mut seen = HashSet::new();
    commits.retain(|commit| seen.insert((commit.repo_path.clone(), commit.hash.clone())));
}

fn monthly_extract_options(
    options: &MonthlyReportOptions,
    start: &str,
    end: &str,
) -> ExtractOptions {
    ExtractOptions {
        root_dirs: options.root_dirs.clone(),
        indexed_repos: options.indexed_repos.clone(),
        author: options.author.clone(),
        author_display_name: options.author_display_name.clone(),
        author_aliases: options.author_aliases.clone(),
        start_date: start.to_string(),
        end_date: end.to_string(),
        period_label: start.to_string(),
        report_kind: "monthly".to_string(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        commit_item_prefix_mode: options.commit_item_prefix_mode.clone(),
        show_evidence_details: options.show_evidence_details,
        evidence_link_rules: options.evidence_link_rules.clone(),
        redaction: options.redaction.clone(),
        project_names: options.project_names.clone(),
        report_format_templates: options.report_format_templates.clone(),
        refinement_instruction: options.refinement_instruction.clone(),
        system_prompt: String::new(),
        ai: options.ai.clone(),
    }
}

fn period_extract_options(options: &PeriodReportOptions) -> ExtractOptions {
    ExtractOptions {
        root_dirs: options.root_dirs.clone(),
        indexed_repos: options.indexed_repos.clone(),
        author: options.author.clone(),
        author_display_name: options.author_display_name.clone(),
        author_aliases: options.author_aliases.clone(),
        start_date: options.start_date.clone(),
        end_date: options.end_date.clone(),
        period_label: options.period_label.clone(),
        report_kind: options.report_kind.clone(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        commit_item_prefix_mode: options.commit_item_prefix_mode.clone(),
        show_evidence_details: options.show_evidence_details,
        evidence_link_rules: options.evidence_link_rules.clone(),
        redaction: options.redaction.clone(),
        project_names: options.project_names.clone(),
        report_format_templates: options.report_format_templates.clone(),
        refinement_instruction: options.refinement_instruction.clone(),
        system_prompt: String::new(),
        ai: options.ai.clone(),
    }
}

fn apply_ai_to_extract_result(
    result: &mut ExtractResult,
    options: &ExtractOptions,
    report_author: &str,
) {
    if !options.ai.enabled {
        return;
    }

    let base_report = if options.detailed_output {
        &result.detailed_text
    } else {
        &result.summary_text
    };
    if base_report.trim().is_empty() {
        return;
    }

    match ai::enhance_daily_report(
        base_report,
        &options.start_date,
        &options.end_date,
        report_author,
        &options.refinement_instruction,
        &options.system_prompt,
        &options.ai,
    ) {
        Ok(enhanced) => {
            if options.detailed_output {
                result.detailed_text = enhanced;
            } else {
                result.summary_text = enhanced;
            }
        }
        Err(err) => result
            .warnings
            .push(format!("AI 润色失败，已使用本地摘要：{}", err)),
    }
}

fn apply_ai_if_enabled(
    report_text: String,
    options: &MonthlyReportOptions,
    dates: &(String, String, String),
    report_author: &str,
    warnings: &mut Vec<String>,
) -> String {
    if !options.ai.enabled {
        return report_text;
    }

    ai::enhance_monthly_report(
        &report_text,
        &dates.0,
        &dates.1,
        report_author,
        &options.refinement_instruction,
        &options.system_prompt,
        &options.ai,
    )
    .unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已使用本地模板：{}", err));
        report_text
    })
}

fn apply_ai_to_period_report(
    report_text: String,
    options: &PeriodReportOptions,
    dates: &(String, String, String),
    report_author: &str,
    warnings: &mut Vec<String>,
) -> String {
    if !options.ai.enabled {
        return report_text;
    }

    let result = match options.report_kind.as_str() {
        "weekly" => ai::enhance_weekly_report(
            &report_text,
            &dates.0,
            &dates.1,
            report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        _ => ai::enhance_monthly_report(
            &report_text,
            &dates.0,
            &dates.1,
            report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
    };

    result.unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已使用本地模板：{}", err));
        report_text
    })
}

fn validate_period_options(options: &PeriodReportOptions) -> Result<(), String> {
    if options.start_date.trim().is_empty() || options.end_date.trim().is_empty() {
        return Err("请选择完整的报告周期".to_string());
    }
    if options.start_date.as_str() > options.end_date.as_str() {
        return Err("报告开始日期不能晚于结束日期".to_string());
    }
    if options.period_label.trim().is_empty() {
        return Err("报告周期标签不能为空".to_string());
    }
    Ok(())
}

fn count_projects(
    commits: &[crate::models::CommitRecord],
    project_names: &HashMap<String, String>,
) -> usize {
    commits
        .iter()
        .map(|commit| {
            let exact = format!("{}({})", commit.project_name, commit.branch_name);
            project_names
                .get(&exact)
                .or_else(|| project_names.get(&format!("{}(*)", commit.project_name)))
                .cloned()
                .unwrap_or_else(|| exact)
        })
        .collect::<HashSet<_>>()
        .len()
}

fn apply_author_aliases(commits: &mut [CommitRecord], groups: &[AuthorAliasGroup]) {
    if groups.is_empty() {
        return;
    }
    for commit in commits {
        if let Some(display_name) =
            resolve_author_alias_display(&commit.author, &commit.author_email, groups)
        {
            commit.author = display_name;
        }
    }
}

fn resolve_author_alias_display(
    author: &str,
    email: &str,
    groups: &[AuthorAliasGroup],
) -> Option<String> {
    for group in groups {
        let display_name = group.display_name.trim();
        if display_name.is_empty() {
            continue;
        }
        if author_identity_matches(display_name, author, email)
            || group
                .aliases
                .iter()
                .any(|alias| author_identity_matches(alias, author, email))
        {
            return Some(display_name.to_string());
        }
    }
    None
}

fn author_identity_matches(candidate: &str, author: &str, email: &str) -> bool {
    let candidate = normalize_author_identity(candidate);
    !candidate.is_empty()
        && (candidate == normalize_author_identity(author)
            || candidate == normalize_author_identity(email))
}

fn normalize_author_identity(value: &str) -> String {
    value.trim().to_lowercase()
}

fn report_author(display_name: &str, author_filter: &str) -> String {
    let display_name = display_name.trim();
    if !display_name.is_empty() {
        return display_name.to_string();
    }
    author_filter.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AiConfig, CommitRecord};
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn normalize_commits_sorts_newest_first_and_deduplicates_per_repo() {
        let mut commits = vec![
            commit("repo-a", "same", "2026-06-01 10:00:00 +0800"),
            commit("repo-a", "old", "2026-05-30 10:00:00 +0800"),
            commit("repo-a", "same", "2026-06-01 10:00:00 +0800"),
            commit("repo-b", "new", "2026-06-02 10:00:00 +0800"),
        ];

        normalize_commits(&mut commits);

        assert_eq!(
            commits
                .iter()
                .map(|item| (item.repo_path.as_str(), item.hash.as_str()))
                .collect::<Vec<_>>(),
            vec![("repo-b", "new"), ("repo-a", "same"), ("repo-a", "old")]
        );
    }

    #[test]
    fn commit_extract_parallelism_is_bounded_by_repo_count_and_cap() {
        assert_eq!(commit_extract_parallelism(0), 0);
        assert_eq!(commit_extract_parallelism(1), 1);
        assert!(commit_extract_parallelism(2) <= 2);
        assert!(commit_extract_parallelism(32) <= 8);
    }

    #[test]
    fn apply_author_aliases_unifies_author_display_names() {
        let mut commits = vec![
            commit_by_author(
                "repo-a",
                "one",
                "2026-06-01 10:00:00 +0800",
                "zqqq",
                "zqqq@company.com",
            ),
            commit_by_author(
                "repo-a",
                "two",
                "2026-06-02 10:00:00 +0800",
                "Golden",
                "golden@example.com",
            ),
        ];
        let aliases = vec![AuthorAliasGroup {
            display_name: "GoldenZqqq".to_string(),
            aliases: vec!["zqqq".to_string(), "golden@example.com".to_string()],
        }];

        apply_author_aliases(&mut commits, &aliases);

        assert_eq!(commits[0].author, "GoldenZqqq");
        assert_eq!(commits[1].author, "GoldenZqqq");
    }

    #[test]
    fn resolve_report_repos_prefers_indexed_repos_and_deduplicates_paths() {
        let options = ExtractOptions {
            root_dirs: vec!["missing-root".to_string()],
            indexed_repos: vec![
                repo("zeta", "C:\\repo\\zeta"),
                repo("alpha", "C:\\repo\\alpha"),
                repo("zeta-copy", "C:\\repo\\zeta"),
            ],
            author: "tester".to_string(),
            author_display_name: String::new(),
            author_aliases: Vec::new(),
            start_date: "2026-06-01".to_string(),
            end_date: "2026-06-01".to_string(),
            period_label: "2026-06-01".to_string(),
            report_kind: "daily".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            detailed_output: false,
            show_project_and_branch: true,
            commit_item_prefix_mode: "mapped-project".to_string(),
            show_evidence_details: false,
            evidence_link_rules: Vec::new(),
            redaction: crate::models::ReportRedactionOptions::default(),
            project_names: Default::default(),
            report_format_templates: crate::models::ReportFormatTemplates::default(),
            refinement_instruction: String::new(),
            system_prompt: String::new(),
            ai: AiConfig {
                enabled: false,
                provider: "openai-compatible".to_string(),
                base_url: String::new(),
                model: String::new(),
                api_key: String::new(),
                temperature: 0.2,
                timeout_seconds: 60,
                proxy: Default::default(),
            },
        };

        let repos = resolve_report_repos(&options).unwrap();

        assert_eq!(repos.len(), 2);
        assert_eq!(repos[0].name, "alpha");
        assert_eq!(repos[1].name, "zeta");
    }

    #[test]
    fn period_report_smoke_extracts_commit_and_saves_markdown() {
        let root = temp_root("period-smoke");
        let repo_dir = root.join("repo-a");
        let output_dir = root.join("out");
        fs::create_dir_all(&repo_dir).unwrap();
        fs::create_dir_all(&output_dir).unwrap();
        init_smoke_repo(&repo_dir);

        let options = PeriodReportOptions {
            root_dirs: vec![root.to_string_lossy().to_string()],
            indexed_repos: vec![RepoInfo {
                path: repo_dir.to_string_lossy().to_string(),
                name: "repo-a".to_string(),
                branch: "main".to_string(),
            }],
            output_dir: output_dir.to_string_lossy().to_string(),
            output_enabled: true,
            author: "Smoke Tester".to_string(),
            author_display_name: String::new(),
            author_aliases: Vec::new(),
            start_date: "2026-06-10".to_string(),
            end_date: "2026-06-10".to_string(),
            period_label: "2026-W24".to_string(),
            report_kind: "weekly".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            commit_item_prefix_mode: "mapped-project".to_string(),
            show_evidence_details: true,
            evidence_link_rules: Vec::new(),
            redaction: crate::models::ReportRedactionOptions::default(),
            project_names: Default::default(),
            report_format_templates: crate::models::ReportFormatTemplates::default(),
            refinement_instruction: String::new(),
            system_prompt: String::new(),
            ai: AiConfig {
                enabled: false,
                provider: "openai-compatible".to_string(),
                base_url: String::new(),
                model: String::new(),
                api_key: String::new(),
                temperature: 0.2,
                timeout_seconds: 60,
                proxy: Default::default(),
            },
        };

        let result = generate_period_report_sync(options, |_| {}).unwrap();

        assert_eq!(result.commit_count, 1);
        assert!(result.report_text.contains("# 2026年第24周工作周报"));
        assert!(result.report_text.contains("完成 smoke 验证"));
        assert!(result.report_text.contains("来源：`repo-a`"));
        assert!(result.output_file.ends_with("weekly_report_2026-W24.md"));
        assert!(Path::new(&result.output_file).exists());
        let _ = fs::remove_dir_all(root);
    }

    fn commit(repo_path: &str, hash: &str, date: &str) -> CommitRecord {
        commit_by_author(repo_path, hash, date, "tester", "tester@example.com")
    }

    fn commit_by_author(
        repo_path: &str,
        hash: &str,
        date: &str,
        author: &str,
        email: &str,
    ) -> CommitRecord {
        CommitRecord {
            repo_path: repo_path.to_string(),
            project_name: repo_path.to_string(),
            branch_name: "main".to_string(),
            hash: hash.to_string(),
            author: author.to_string(),
            author_email: email.to_string(),
            date: date.to_string(),
            message: "feat: demo".to_string(),
        }
    }

    fn repo(name: &str, path: &str) -> RepoInfo {
        RepoInfo {
            path: path.to_string(),
            name: name.to_string(),
            branch: "main".to_string(),
        }
    }

    fn init_smoke_repo(repo_dir: &Path) {
        run_smoke_git(repo_dir, &["init"], &[]);
        run_smoke_git(repo_dir, &["config", "user.name", "Smoke Tester"], &[]);
        run_smoke_git(
            repo_dir,
            &["config", "user.email", "smoke@example.com"],
            &[],
        );
        run_smoke_git(repo_dir, &["config", "commit.gpgsign", "false"], &[]);
        fs::write(repo_dir.join("work.txt"), "smoke").unwrap();
        run_smoke_git(repo_dir, &["add", "."], &[]);
        run_smoke_git(
            repo_dir,
            &["commit", "-m", "feat: 完成 smoke 验证"],
            &[
                ("GIT_AUTHOR_DATE", "2026-06-10T10:00:00+08:00"),
                ("GIT_COMMITTER_DATE", "2026-06-10T10:00:00+08:00"),
            ],
        );
    }

    fn run_smoke_git(repo_dir: &Path, args: &[&str], envs: &[(&str, &str)]) {
        let mut command = Command::new("git");
        command.args(args).current_dir(repo_dir);
        for (key, value) in envs {
            command.env(key, value);
        }
        let output = command.output().unwrap_or_else(|err| {
            panic!("failed to run git {}: {}", args.join(" "), err);
        });
        assert!(
            output.status.success(),
            "git {} failed: {}{}",
            args.join(" "),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn temp_root(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("gitpulse-{label}-{}-{nanos}", std::process::id()))
    }
}
