mod ai;
mod git_ops;
mod models;
mod report;

use crate::models::{
    ExtractOptions, ExtractResult, GitIdentity, MonthlyReportOptions, MonthlyReportResult, RepoInfo,
};
use std::path::PathBuf;

#[tauri::command]
fn scan_repos(root_dir: String) -> Result<Vec<RepoInfo>, String> {
    git_ops::find_git_repos(&root_dir)
}

#[tauri::command]
fn get_git_identity() -> GitIdentity {
    git_ops::git_identity()
}

#[tauri::command]
fn extract_commits(options: ExtractOptions) -> Result<ExtractResult, String> {
    let (repos, commits, warnings) = collect_commits(&options)?;
    Ok(report::build_extract_result(
        repos,
        commits,
        warnings,
        &options.project_names,
        options.show_project_and_branch,
        options.detailed_output,
    ))
}

#[tauri::command]
fn generate_monthly_report(options: MonthlyReportOptions) -> Result<MonthlyReportResult, String> {
    let dates = report::previous_month_range();
    let extract_options = monthly_extract_options(&options, &dates.0, &dates.1);
    let (_, commits, mut warnings) = collect_commits(&extract_options)?;
    let mut report_text = report::render_monthly_report(
        &commits,
        &options.project_names,
        &dates.0,
        &dates.1,
        &options.author,
        &dates.2,
    );

    report_text = apply_ai_if_enabled(report_text, &options, &dates, &mut warnings);
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

#[tauri::command]
fn save_text_file(
    output_dir: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    report::save_report_file(&output_dir, &file_name, &content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            get_git_identity,
            extract_commits,
            generate_monthly_report,
            save_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn collect_commits(
    options: &ExtractOptions,
) -> Result<(Vec<RepoInfo>, Vec<crate::models::CommitRecord>, Vec<String>), String> {
    let repos = git_ops::find_git_repos(&options.root_dir)?;
    let mut commits = Vec::new();
    let mut warnings = Vec::new();

    for repo in &repos {
        if options.pull_latest_code {
            collect_pull_warning(repo, &mut warnings);
        }
        match git_ops::get_git_commits(
            repo,
            &options.start_date,
            &options.end_date,
            &options.author,
            options.extract_all_branches,
        ) {
            Ok(mut records) => commits.append(&mut records),
            Err(err) => warnings.push(format!("{}：{}", repo.name, err)),
        }
    }

    Ok((repos, commits, warnings))
}

fn collect_pull_warning(repo: &RepoInfo, warnings: &mut Vec<String>) {
    let path = PathBuf::from(&repo.path);
    if let Err(err) = git_ops::pull_repo(&path) {
        warnings.push(format!("{} 拉取失败：{}", repo.name, err));
    }
}

fn monthly_extract_options(
    options: &MonthlyReportOptions,
    start: &str,
    end: &str,
) -> ExtractOptions {
    ExtractOptions {
        root_dir: options.root_dir.clone(),
        author: options.author.clone(),
        start_date: start.to_string(),
        end_date: end.to_string(),
        pull_latest_code: options.pull_latest_code,
        extract_all_branches: options.extract_all_branches,
        detailed_output: false,
        show_project_and_branch: true,
        project_names: options.project_names.clone(),
    }
}

fn apply_ai_if_enabled(
    report_text: String,
    options: &MonthlyReportOptions,
    dates: &(String, String, String),
    warnings: &mut Vec<String>,
) -> String {
    if !options.ai.enabled {
        return report_text;
    }

    ai::enhance_monthly_report(
        &report_text,
        &dates.0,
        &dates.1,
        &options.author,
        &options.refinement_instruction,
        &options.ai,
    )
    .unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已使用本地模板：{}", err));
        report_text
    })
}

fn count_projects(
    commits: &[crate::models::CommitRecord],
    project_names: &std::collections::HashMap<String, String>,
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
        .collect::<std::collections::HashSet<_>>()
        .len()
}
