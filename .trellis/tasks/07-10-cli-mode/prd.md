# CLI 模式（headless 报告生成）

## Goal

提供独立的命令行工具，无需打开 GUI 即可生成报告，支持集成到 cron job、CI pipeline、飞书/钉钉机器人等自动化场景。

## Requirements

### 架构

- 将核心逻辑（仓库扫描、commit 提取、报告生成）抽离为可独立调用的 library crate
- CLI 二进制独立于 Tauri 应用，不依赖窗口系统
- CLI 产物可单独发布（可选，初期可作为 Tauri 应用的子命令）

### 命令设计

```
gitpulse report [OPTIONS]

OPTIONS:
  -t, --type <TYPE>        报告类型：daily | weekly | monthly | custom
  -a, --author <AUTHOR>    作者过滤（支持多个 -a）
  -d, --dir <DIR>          工作区根目录（支持多个 -d）
  --from <DATE>            起始日期（custom 类型必填）
  --to <DATE>              结束日期（custom 类型必填）
  --month <YYYY-MM>        月份（monthly 类型）
  -o, --output <PATH>      输出文件路径（默认 stdout）
  -f, --format <FORMAT>    输出格式：markdown | json（默认 markdown）
  --all-branches           搜索所有分支（默认仅当前分支）
  --no-merge               排除 merge 提交
  --no-revert              排除 revert 提交
```

### 输出

- Markdown 格式：与 GUI 生成的报告完全一致
- JSON 格式：结构化输出，方便下游工具解析
- 进度信息输出到 stderr，报告内容输出到 stdout

### 约束

- 不包含 AI 润色功能（AI 需要 API key 管理，CLI 场景下增加复杂度）
- 不包含 Word/PDF 导出（依赖较重，可后续扩展）

## Acceptance Criteria

- [ ] `gitpulse report --type weekly` 生成与 GUI 一致的周报
- [ ] 支持 daily/weekly/monthly/custom 四种类型
- [ ] 多作者、多目录支持
- [ ] Markdown 和 JSON 两种输出格式
- [ ] 无 GUI 依赖，可在纯终端/CI 环境运行
- [ ] `--help` 输出清晰的帮助文档
- [ ] 退出码：0 成功，1 错误，2 参数错误
