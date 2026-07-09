# 可脱敏可追溯周报

## Goal

让用户生成一份可以对外分享或提交的周报：报告保留每条事项的 commit 证据链，但不会暴露真实仓库名、分支名、作者邮箱、commit hash、内部链接或用户指定的敏感词。

核心用户价值：开发者可以把来自多个私有仓库的 Git 活动整理成可信周报，同时降低把公司内部信息复制到周报系统、AI 润色或公开投稿演示中的泄漏风险。

## Background / Confirmed Facts

- GitPulse 是本地优先的 Git 工作报告生成器，Rust 负责 Git 扫描、提交提取、报告渲染和文件导出，React 负责设置、预览和 Tauri 命令调用。
- 项目术语已定义 **Evidence Detail**：用于把报告事项追溯到原始 commit 上下文。
- 后端已支持证据详情：
  - `src-tauri/src/models.rs` 中已有 `show_evidence_details`、`evidence_link_rules` 和 `ReportFormatTemplates`。
  - `src-tauri/src/report.rs` 会在启用证据时输出 `来源：repo / branch / date / hash`、`原始：message` 和可选关联链接。
  - `src-tauri/src/report.rs` 已有周报证据渲染测试，包括 `render_reports_can_include_commit_evidence_details`。
- 前端已支持“显示提交证据”设置，并在质量面板中提示证据是否启用：
  - `src/components/SettingsDialog.tsx` 高级提取设置里有“显示提交证据”开关。
  - `src/components/ReportQualityPanel.tsx` 会提示“证据已显示 / 证据未显示”。
- 周报生成路径已存在：
  - `src/App.tsx` 的 `generateWeeklyReport` 调用 `generate_period_report`。
  - `src/model.ts` 的 `buildPeriodReportOptions` 是前端到 Rust 周报参数的边界。
  - `src-tauri/src/commit_pipeline.rs` 调用 `report::render_weekly_report_with_template` 生成周报。
- 缺口：当前证据详情会暴露真实仓库名、分支名、commit hash、原始提交信息和可选内部链接；没有“脱敏但仍可追溯”的报告模式。

## Requirements

### R1. 脱敏报告模式

- 增加一个持久化设置，用于启用或关闭报告脱敏。
- 启用后，报告渲染层必须在生成文本前对 commit 上下文进行脱敏。
- 脱敏后的证据仍应可在报告内部追溯同一条事项，例如稳定显示 `仓库1 / 分支1 / 2026-07-09 / commit-1`。
- 关闭后，现有报告输出必须保持兼容。

### R2. 自动脱敏范围

MVP 自动脱敏以下字段：

- 仓库名 / 项目原始名
- 分支名
- 作者姓名和作者邮箱
- commit hash
- 由证据链接规则生成的 URL

日期保留，因为日期是周报追溯和周期核对的必要信息。

### R3. 用户自定义敏感词替换

- 增加一个文本设置，允许用户按行填写 `敏感词 -> 替换文本`。
- 空行和注释行不生效。
- 启用脱敏时，用户规则应作用于提交信息、报告正文和证据文本中可能出现的内部产品名、客户名、需求编号等。
- 未配置替换文本时，默认替换为 `***`。

### R4. 可追溯周报体验

- 周报预览区域必须让用户看见当前是否处于“脱敏”和“显示证据”状态。
- 质量提示应把“证据已显示 + 脱敏已启用”视为更适合对外分享的状态。
- 生成、复制、Markdown/Word/PDF 导出复用同一份脱敏后的预览文本。

### R5. AI 润色安全边界

- AI 润色只接收当前预览文本；如果报告已脱敏，发送给 AI 的内容也必须是脱敏文本。
- 启用证据详情时，现有证据保留指令仍应生效，避免 AI 改写来源块。
- MVP 不新增云端隐私承诺；仅保证本地报告草稿在调用 AI 前已经脱敏。

## Acceptance Criteria

- [ ] 关闭脱敏设置时，现有周报、月报、日报/自定义报告的输出和测试保持不变。
- [ ] 启用脱敏和证据详情后生成周报，报告正文不包含真实仓库名、真实分支名、真实作者邮箱或原始 commit hash。
- [ ] 启用脱敏和证据详情后，周报仍包含可追溯证据块，并使用稳定别名标识仓库、分支和 commit。
- [ ] 配置 `内部项目 -> 项目A` 这类自定义规则后，报告中的匹配文本被替换。
- [ ] 由证据链接规则生成的外部/内部 URL 在脱敏报告中不输出。
- [ ] 周报预览的范围提示或质量提示能显示“脱敏”状态。
- [ ] Markdown、Word、PDF 导出内容与当前脱敏预览一致。
- [ ] `npm run build`、`cd src-tauri && cargo check`、`cd src-tauri && cargo test` 通过，若 Playwright 覆盖相关 UI 变更则运行对应 e2e。

## Out of Scope

- 不做权限管理、审计日志或企业级 DLP。
- 不解析真实业务需求系统，不拉取 PR / Issue / Jira 详情。
- 不保证 AI 润色结果绝对不会重新引入敏感词；MVP 只保证发送给 AI 的基础报告先脱敏，并保留本地导出路径。
- 不为每个仓库持久保存别名映射；别名只需在单次报告生成中稳定。
- 不改变 Git 扫描、作者匹配、日期范围和报告模板变量的既有语义。

## Notes

- 推荐 MVP 决策：默认保留日期和提交事项语义，只脱敏上下文标识与用户指定敏感词。这样报告仍然可读、可核验；如果连提交描述也强行改成“事项1/事项2”，安全性更强但周报价值会明显下降。
