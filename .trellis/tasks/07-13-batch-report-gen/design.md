# 批量生成报告 — 技术设计

## Architecture Overview

批量生成是一个编排层，不改动现有报告生成的核心逻辑。它在外层将一个大时间范围拆成 N 个子周期，逐个调用现有流程，逐个导出文件。

```
┌─────────────────────────────────────────────┐
│  BatchDialog (React)                        │
│  配置: 时间范围 / 粒度 / 格式 / 输出目录      │
│  显示: 进度条 + 成功/失败汇总                 │
└──────────────┬──────────────────────────────┘
               │ invoke("batch_generate_reports", opts)
               ▼
┌─────────────────────────────────────────────┐
│  batch_generate_reports (Tauri command)      │
│  1. split_date_range → Vec<(start, end)>    │
│  2. for each sub-period:                    │
│     a. collect_commits (existing)           │
│     b. render report  (existing)            │
│     c. save_report_document (existing)      │
│     d. emit "batch-report-progress" event   │
│  3. return BatchResult                      │
└─────────────────────────────────────────────┘
```

## New Data Structures (models.rs)

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportOptions {
    // 复用现有筛选条件
    pub root_dirs: Vec<String>,
    pub indexed_repos: Vec<RepoInfo>,
    pub author: String,
    pub author_display_name: String,
    pub author_aliases: Vec<AuthorAliasGroup>,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    pub redaction: ReportRedactionOptions,
    pub project_names: HashMap<String, String>,
    pub report_format_templates: ReportFormatTemplates,

    // 批量专属
    pub range_start: String,         // "2026-07-01"
    pub range_end: String,           // "2026-07-31"
    pub split_granularity: String,   // "daily" | "weekly" | "monthly"
    pub export_format: String,       // "markdown" | "docx" | "pdf"
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportProgress {
    pub total: usize,
    pub completed: usize,
    pub current_label: String,   // "2026-07-01 日报"
    pub succeeded: usize,
    pub failed: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub failures: Vec<BatchFailure>,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFailure {
    pub label: String,
    pub error: String,
}
```

## Date Splitting Logic (report.rs)

新增函数 `split_date_range(start, end, granularity) -> Vec<SubPeriod>`：

- **daily**: 逐天生成 `[day, day]` 对，跳过实际无 commit 的天可选（MVP 不跳，全部生成）
- **weekly**: 按 ISO 周拆分，首/末周可能不满 7 天，用实际起止日期截断
- **monthly**: 按自然月拆分，首/末月可能不满，用实际起止日期截断

```rust
pub struct SubPeriod {
    pub start: String,
    pub end: String,
    pub label: String,       // "2026-07-01" / "2026-W28" / "2026-07"
    pub report_kind: String, // "daily" / "weekly" / "monthly"
}
```

## File Naming

MVP 使用固定规则，不支持自定义模板：
- daily: `2026-07-01-日报.md`
- weekly: `2026-W28-周报.docx`
- monthly: `2026-07-月报.pdf`

函数 `batch_file_name(sub_period, format) -> String`。

## Progress Event

事件通道: `"batch-report-progress"`

每生成完一份报告（无论成功/失败）发一次。前端监听此事件更新进度条。与现有 `commit-extract-progress` 互不干扰。

## Frontend Component

新增 `BatchDialog.tsx`，作为模态对话框从 Workbench 的入口按钮打开：

- 时间范围选择（两个 date input）
- 拆分粒度下拉（按天/按周/按月）
- 导出格式下拉（Markdown/Word/PDF）
- 输出目录选择（调用 Tauri dialog API）
- 开始生成按钮
- 进度条 + 当前生成项标签
- 完成后：成功 N 份 / 失败 M 份 + 打开输出目录按钮

## Boundary & Compatibility

- 不修改任何现有 Tauri command 的签名
- 不修改 `commit_pipeline`、`report`、`git_ops` 的公开 API
- 批量命令内部直接调用 `commit_pipeline` 的 sync 函数和 `report::save_report_document`
- 上限 365 份，前端校验 + 后端二次校验
