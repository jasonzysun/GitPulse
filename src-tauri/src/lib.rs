mod ai;
mod codex_oauth;
mod diagnostics;
mod docx;
mod git_ops;
mod models;
mod pdf;
mod report;
mod secure_store;
mod zip_store;

use crate::models::{
    AiConfig, AiModelInfo, CommitExtractProgress, CommitRecord, DiagnosticOptions,
    DiagnosticResult, ExtractOptions, ExtractResult, GitIdentity, MappingEntry,
    MonthlyReportOptions, MonthlyReportResult, PeriodReportOptions, PeriodReportResult, RepoInfo,
    RepoScanProgress,
};
use std::collections::{HashSet, VecDeque};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Default)]
struct RepoScanState {
    cancel_requested: Arc<AtomicBool>,
}

#[tauri::command]
async fn scan_repos(
    app: AppHandle,
    state: State<'_, RepoScanState>,
    root_dirs: Vec<String>,
) -> Result<Vec<RepoInfo>, String> {
    let cancel_requested = state.cancel_requested.clone();
    cancel_requested.store(false, Ordering::Relaxed);
    let progress_app = app.clone();

    let result = async_runtime::spawn_blocking(move || {
        git_ops::find_git_repos_with_progress(&root_dirs, &cancel_requested, |progress| {
            let _ = progress_app.emit("repo-scan-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("扫描仓库任务中断：{}", err))?;
    if let Err(message) = &result {
        if message.contains("取消") {
            let _ = app.emit(
                "repo-scan-progress",
                RepoScanProgress {
                    root_dir: String::new(),
                    current_path: String::new(),
                    scanned_dirs: 0,
                    found_repos: 0,
                    done: false,
                    cancelled: true,
                },
            );
        }
    }
    result
}

#[tauri::command]
fn cancel_repo_scan(state: State<'_, RepoScanState>) {
    state.cancel_requested.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn get_git_identity() -> GitIdentity {
    git_ops::git_identity()
}

#[tauri::command]
async fn extract_commits(app: AppHandle, options: ExtractOptions) -> Result<ExtractResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        extract_commits_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("提取提交任务中断：{}", err))?
}

#[tauri::command]
async fn generate_monthly_report(
    app: AppHandle,
    options: MonthlyReportOptions,
) -> Result<MonthlyReportResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        generate_monthly_report_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("生成月报任务中断：{}", err))?
}

#[tauri::command]
async fn generate_period_report(
    app: AppHandle,
    options: PeriodReportOptions,
) -> Result<PeriodReportResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        generate_period_report_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("生成报告任务中断：{}", err))?
}

#[tauri::command]
async fn list_ai_models(config: AiConfig) -> Result<Vec<AiModelInfo>, String> {
    async_runtime::spawn_blocking(move || ai::list_models(&config))
        .await
        .map_err(|err| format!("获取模型列表任务中断：{}", err))?
}

#[tauri::command]
async fn run_diagnostics(options: DiagnosticOptions) -> Result<DiagnosticResult, String> {
    async_runtime::spawn_blocking(move || diagnostics::run(options))
        .await
        .map_err(|err| format!("诊断任务中断：{}", err))
}

#[tauri::command]
async fn get_secure_ai_api_key() -> Result<Option<String>, String> {
    async_runtime::spawn_blocking(secure_store::get_ai_api_key)
        .await
        .map_err(|err| format!("读取 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn set_secure_ai_api_key(api_key: String) -> Result<(), String> {
    async_runtime::spawn_blocking(move || secure_store::set_ai_api_key(&api_key))
        .await
        .map_err(|err| format!("保存 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn clear_secure_ai_api_key() -> Result<(), String> {
    async_runtime::spawn_blocking(secure_store::clear_ai_api_key)
        .await
        .map_err(|err| format!("清除 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn codex_oauth_start_device_flow() -> Result<codex_oauth::DeviceFlowInfo, String> {
    async_runtime::spawn_blocking(codex_oauth::start_device_flow)
        .await
        .map_err(|err| format!("启动 ChatGPT 登录任务中断：{}", err))?
}

#[tauri::command]
async fn codex_oauth_poll(
    device_code: String,
    user_code: String,
) -> Result<codex_oauth::PollResult, String> {
    async_runtime::spawn_blocking(move || codex_oauth::poll_once(&device_code, &user_code))
        .await
        .map_err(|err| format!("ChatGPT 登录轮询任务中断：{}", err))?
}

#[tauri::command]
fn codex_oauth_status() -> codex_oauth::AuthStatus {
    codex_oauth::status()
}

#[tauri::command]
fn codex_oauth_logout() -> Result<(), String> {
    codex_oauth::logout()
}

fn generate_monthly_report_sync<F>(
    options: MonthlyReportOptions,
    on_progress: F,
) -> Result<MonthlyReportResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let dates = report::previous_month_range();
    let extract_options = monthly_extract_options(&options, &dates.0, &dates.1);
    let (_, commits, mut warnings) = collect_commits(&extract_options, on_progress)?;
    let mut report_text = report::render_monthly_report(
        &commits,
        &options.project_names,
        &dates.0,
        &dates.1,
        &options.author,
        &dates.2,
        options.show_evidence_details,
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

fn generate_period_report_sync<F>(
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
    let mut report_text = match options.report_kind.as_str() {
        "weekly" => report::render_weekly_report(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &options.author,
            &options.period_label,
            options.show_evidence_details,
        ),
        "monthly" => report::render_monthly_report(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &options.author,
            &options.period_label,
            options.show_evidence_details,
        ),
        _ => return Err(format!("未知报告类型：{}", options.report_kind)),
    };

    report_text = apply_ai_to_period_report(report_text, &options, &dates, &mut warnings);
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

fn extract_commits_sync<F>(options: ExtractOptions, on_progress: F) -> Result<ExtractResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let (repos, commits, warnings) = collect_commits(&options, on_progress)?;
    let mut result = report::build_extract_result(
        repos,
        commits,
        warnings,
        &options.project_names,
        options.show_project_and_branch,
        options.show_evidence_details,
        options.detailed_output,
    );
    apply_ai_to_extract_result(&mut result, &options);
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

#[tauri::command]
fn save_text_file(
    output_dir: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    report::save_report_file(&output_dir, &file_name, &content)
}

#[tauri::command]
fn save_report_file(
    output_dir: String,
    base_name: String,
    format: String,
    content: String,
) -> Result<String, String> {
    report::save_report_document(&output_dir, &base_name, &content, &format)
}

#[tauri::command]
fn read_mapping_xlsx(path: String) -> Result<Vec<MappingEntry>, String> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> =
        open_workbook(&path).map_err(|err| format!("无法打开 Excel 文件：{}", err))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Excel 中没有工作表".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| format!("读取工作表失败：{}", err))?;

    let mut entries = Vec::new();
    for row in range.rows().skip(1) {
        let key = row.get(0).map(|cell| cell.to_string()).unwrap_or_default();
        let display_name = row.get(1).map(|cell| cell.to_string()).unwrap_or_default();
        let key = key.trim().to_string();
        let display_name = display_name.trim().to_string();
        if !key.is_empty() && !display_name.is_empty() {
            entries.push(MappingEntry { key, display_name });
        }
    }
    Ok(entries)
}

#[tauri::command]
fn write_mapping_template_xlsx(path: String, keys: Vec<String>) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();
    worksheet
        .set_column_width(0, 36.0)
        .map_err(|err| err.to_string())?;
    worksheet
        .set_column_width(1, 24.0)
        .map_err(|err| err.to_string())?;
    worksheet
        .write_with_format(0, 0, "项目(分支)", &header_format)
        .map_err(|err| err.to_string())?;
    worksheet
        .write_with_format(0, 1, "显示名称", &header_format)
        .map_err(|err| err.to_string())?;
    for (index, key) in keys.iter().enumerate() {
        worksheet
            .write((index + 1) as u32, 0, key.as_str())
            .map_err(|err| err.to_string())?;
    }
    workbook
        .save(&path)
        .map_err(|err| format!("保存 Excel 失败：{}", err))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(RepoScanState::default())
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            cancel_repo_scan,
            get_git_identity,
            extract_commits,
            generate_monthly_report,
            generate_period_report,
            list_ai_models,
            run_diagnostics,
            get_secure_ai_api_key,
            set_secure_ai_api_key,
            clear_secure_ai_api_key,
            save_text_file,
            save_report_file,
            read_mapping_xlsx,
            write_mapping_template_xlsx,
            codex_oauth_start_device_flow,
            codex_oauth_poll,
            codex_oauth_status,
            codex_oauth_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
        start_date: start.to_string(),
        end_date: end.to_string(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        show_evidence_details: options.show_evidence_details,
        project_names: options.project_names.clone(),
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
        start_date: options.start_date.clone(),
        end_date: options.end_date.clone(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        show_evidence_details: options.show_evidence_details,
        project_names: options.project_names.clone(),
        refinement_instruction: options.refinement_instruction.clone(),
        system_prompt: String::new(),
        ai: options.ai.clone(),
    }
}

fn apply_ai_to_extract_result(result: &mut ExtractResult, options: &ExtractOptions) {
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
        &options.author,
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
            &options.author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        _ => ai::enhance_monthly_report(
            &report_text,
            &dates.0,
            &dates.1,
            &options.author,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CommitRecord;
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
    fn resolve_report_repos_prefers_indexed_repos_and_deduplicates_paths() {
        let options = ExtractOptions {
            root_dirs: vec!["missing-root".to_string()],
            indexed_repos: vec![
                repo("zeta", "C:\\repo\\zeta"),
                repo("alpha", "C:\\repo\\alpha"),
                repo("zeta-copy", "C:\\repo\\zeta"),
            ],
            author: "tester".to_string(),
            start_date: "2026-06-01".to_string(),
            end_date: "2026-06-01".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            detailed_output: false,
            show_project_and_branch: true,
            show_evidence_details: false,
            project_names: Default::default(),
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
            start_date: "2026-06-10".to_string(),
            end_date: "2026-06-10".to_string(),
            period_label: "2026-W24".to_string(),
            report_kind: "weekly".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            show_evidence_details: true,
            project_names: Default::default(),
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
        CommitRecord {
            repo_path: repo_path.to_string(),
            project_name: repo_path.to_string(),
            branch_name: "main".to_string(),
            hash: hash.to_string(),
            author: "tester".to_string(),
            author_email: "tester@example.com".to_string(),
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
