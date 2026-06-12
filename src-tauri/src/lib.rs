mod ai;
mod codex_oauth;
mod git_ops;
mod models;
mod report;

use crate::models::{
    AiConfig, AiModelInfo, ExtractOptions, ExtractResult, GitIdentity, MappingEntry,
    MonthlyReportOptions, MonthlyReportResult, RepoInfo,
};
use tauri::async_runtime;

#[tauri::command]
async fn scan_repos(root_dirs: Vec<String>) -> Result<Vec<RepoInfo>, String> {
    async_runtime::spawn_blocking(move || git_ops::find_git_repos(&root_dirs))
        .await
        .map_err(|err| format!("扫描仓库任务中断：{}", err))?
}

#[tauri::command]
fn get_git_identity() -> GitIdentity {
    git_ops::git_identity()
}

#[tauri::command]
async fn extract_commits(options: ExtractOptions) -> Result<ExtractResult, String> {
    async_runtime::spawn_blocking(move || extract_commits_sync(options))
        .await
        .map_err(|err| format!("提取提交任务中断：{}", err))?
}

#[tauri::command]
async fn generate_monthly_report(
    options: MonthlyReportOptions,
) -> Result<MonthlyReportResult, String> {
    async_runtime::spawn_blocking(move || generate_monthly_report_sync(options))
        .await
        .map_err(|err| format!("生成月报任务中断：{}", err))?
}

#[tauri::command]
async fn list_ai_models(config: AiConfig) -> Result<Vec<AiModelInfo>, String> {
    async_runtime::spawn_blocking(move || ai::list_models(&config))
        .await
        .map_err(|err| format!("获取模型列表任务中断：{}", err))?
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

fn generate_monthly_report_sync(
    options: MonthlyReportOptions,
) -> Result<MonthlyReportResult, String> {
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

fn extract_commits_sync(options: ExtractOptions) -> Result<ExtractResult, String> {
    let (repos, commits, warnings) = collect_commits(&options)?;
    let mut result = report::build_extract_result(
        repos,
        commits,
        warnings,
        &options.project_names,
        options.show_project_and_branch,
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

#[tauri::command]
fn save_text_file(
    output_dir: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    report::save_report_file(&output_dir, &file_name, &content)
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
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            get_git_identity,
            extract_commits,
            generate_monthly_report,
            list_ai_models,
            save_text_file,
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

fn collect_commits(
    options: &ExtractOptions,
) -> Result<(Vec<RepoInfo>, Vec<crate::models::CommitRecord>, Vec<String>), String> {
    let repos = git_ops::find_git_repos(&options.root_dirs)?;
    let mut commits = Vec::new();
    let mut warnings = Vec::new();

    for repo in &repos {
        if options.disabled_repos.contains(&repo.path) {
            continue;
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

fn monthly_extract_options(
    options: &MonthlyReportOptions,
    start: &str,
    end: &str,
) -> ExtractOptions {
    ExtractOptions {
        root_dirs: options.root_dirs.clone(),
        author: options.author.clone(),
        start_date: start.to_string(),
        end_date: end.to_string(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        detailed_output: false,
        show_project_and_branch: true,
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
