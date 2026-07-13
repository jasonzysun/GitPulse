# 批量生成报告 — 实施计划

## Checklist

### Step 1: 数据结构 (models.rs)

- [ ] 新增 `BatchReportOptions` 结构体
- [ ] 新增 `BatchReportProgress` 结构体
- [ ] 新增 `BatchReportResult` / `BatchFailure` 结构体
- [ ] 新增 `SubPeriod` 结构体

**验证**: `cargo check` 通过

### Step 2: 日期拆分逻辑 (report.rs)

- [ ] 实现 `split_date_range(start, end, granularity) -> Result<Vec<SubPeriod>, String>`
  - daily: NaiveDate 逐天迭代
  - weekly: 按 ISO week 拆分，首尾周截断
  - monthly: 按自然月拆分，首尾月截断
- [ ] 实现 `batch_file_name(sub_period, format) -> String`
  - daily: `{date}-日报.{ext}`
  - weekly: `{year}-W{week}-周报.{ext}`
  - monthly: `{year}-{month}-月报.{ext}`
- [ ] 上限校验：子周期数 > 365 时返回错误

**验证**: 为 `split_date_range` 写单元测试，覆盖：
- 单天范围
- 跨月周报拆分（首尾周截断）
- 跨年月报拆分
- 超过 365 份的拒绝
- start > end 的拒绝

### Step 3: 批量生成 Tauri command (lib.rs + commit_pipeline.rs)

- [ ] 在 `commit_pipeline.rs` 新增 `batch_generate_reports_sync` 函数：
  - 调用 `split_date_range` 拆分子周期
  - 循环遍历每个子周期：
    - 构造对应的 `ExtractOptions` (daily) 或 `PeriodReportOptions` (weekly/monthly)
    - 调用现有 `extract_commits_sync` 或 `generate_period_report_sync`
    - 调用 `report::save_report_document` 导出文件
    - 成功/失败计数，emit 进度事件
    - 单份失败 catch 错误、记录、继续下一份
  - 返回 `BatchReportResult`
- [ ] 在 `lib.rs` 新增 `#[tauri::command] batch_generate_reports`，桥接到 sync 函数
- [ ] 在 `lib.rs` 的 `invoke_handler` 中注册新 command

**验证**: `cargo check` 通过；手动调用一次确认文件生成

### Step 4: 前端类型定义 (model.ts)

- [ ] 新增 TypeScript 类型：`BatchReportOptions`, `BatchReportProgress`, `BatchReportResult`, `BatchFailure`
- [ ] 新增 `SplitGranularity` 类型: `"daily" | "weekly" | "monthly"`

**验证**: `npm run build` 无类型错误

### Step 5: BatchDialog 组件 (src/components/BatchDialog.tsx)

- [ ] 创建模态对话框组件，包含：
  - 起止日期选择 (`<input type="date">`)
  - 拆分粒度下拉 (按天/按周/按月)
  - 导出格式下拉 (Markdown/Word/PDF)
  - 输出目录选择 (调用 `@tauri-apps/plugin-dialog` 的 `open` API)
  - "开始生成"按钮
- [ ] 前端校验：日期范围不超过 365 天、start <= end、输出目录不为空
- [ ] 调用 `invoke("batch_generate_reports", { options })` 发起批量生成
- [ ] 监听 `"batch-report-progress"` 事件，显示进度条 + 当前生成项
- [ ] 完成后显示成功/失败汇总 + "打开输出目录"按钮
- [ ] 失败项展示错误原因

**验证**: `npm run dev` 后在 UI 中操作全流程

### Step 6: Workbench 入口 (src/components/Workbench.tsx)

- [ ] 在报告类型 tab 栏或导出按钮区域旁新增"批量生成"按钮
- [ ] 点击打开 `BatchDialog`
- [ ] 将当前工作区的筛选条件（作者、仓库、分支设置等）透传给 BatchDialog

**验证**: `npm run dev` 确认入口可见且可打开

### Step 7: 端到端测试

- [ ] 选定一个有 commit 的仓库，批量生成 7 天日报 → 验证输出 7 个文件
- [ ] 批量生成 4 周周报 → 验证输出 4 个文件
- [ ] 测试 PDF 和 DOCX 格式输出
- [ ] 测试输出目录不存在时的错误提示
- [ ] 测试无 commit 的日期范围 → 生成空报告或跳过

## Rollback

所有新代码集中在：
- `models.rs`: 新增结构体（不影响已有）
- `report.rs`: 新增函数（不影响已有）
- `commit_pipeline.rs`: 新增函数（不影响已有）
- `lib.rs`: 新增一个 command + invoke_handler 注册
- `src/components/BatchDialog.tsx`: 新文件
- `src/components/Workbench.tsx`: 新增按钮入口
- `src/model.ts`: 新增类型

回滚方式：revert 单个 commit 即可，不影响现有任何功能。
