# 代码变更量统计（LOC diff）

## Goal

在所有报告类型中展示代码行数变化统计（additions/deletions/net），为绩效考核提供硬数据支撑。

## Requirements

### 后端（Rust）

- 在 commit 提取阶段通过 `git log --numstat` 获取每次 commit 的文件级变更量（新增行、删除行）
- 扩展 commit 数据结构，增加 `additions: u64`, `deletions: u64` 字段
- 按项目汇总变更量，计算净增行数 `net = additions - deletions`
- 二进制文件变更（numstat 输出为 `-`) 标记为 binary，不计入行数统计
- 性能要求：不能显著增加报告生成时间（numstat 可与 commit 提取合并为一次 git 调用）

### 报告输出

- 日报/周报：在每个项目分组末尾显示变更统计摘要，如 `📊 变更统计：+234 -89（净增 145 行）`
- 绩效月报：增加变更量汇总段落，按项目列出变更量排名
- 模板系统新增变量：`{additions}`, `{deletions}`, `{netLines}`, `{changedFiles}`

### 前端

- 报告预览中变更统计用绿色/红色标注 additions/deletions
- 绩效月报预览中展示按项目分组的变更量对比（可用文字排版，不需要图表）

## Acceptance Criteria

- [ ] commit 数据结构包含 additions/deletions 字段
- [ ] 日报、周报、自定义区间报告包含变更统计摘要
- [ ] 绩效月报包含按项目的变更量汇总
- [ ] 模板变量 `{additions}`, `{deletions}`, `{netLines}` 可用
- [ ] 二进制文件不计入行数
- [ ] 报告生成性能无明显退化
- [ ] Word/PDF 导出包含变更统计
