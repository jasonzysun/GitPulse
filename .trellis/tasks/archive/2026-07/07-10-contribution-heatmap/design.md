# 工作热力图 — 技术设计

## 方案概述

纯 SVG 实现的 52×7 热力图格子矩阵，放在工作台右侧辅助面板（assist-rail）的新 tab 中。不引入任何图表库。

## 后端设计

### 新增 Tauri command

```rust
#[tauri::command]
async fn get_heatmap_data(
    app: AppHandle,
    options: HeatmapOptions,
) -> Result<HeatmapResult, String>
```

**HeatmapOptions**：
```rust
struct HeatmapOptions {
    workspace_roots: Vec<String>,  // 工作区根目录
    author: String,                // 作者过滤
    weeks: u32,                    // 周数（默认 52）
}
```

**HeatmapResult**：
```rust
struct HeatmapResult {
    entries: Vec<HeatmapEntry>,    // 每日数据
    total_commits: u32,
    active_days: u32,
    max_streak: u32,               // 最长连续活跃天数
    busiest_day: String,           // 最活跃的一天
    busiest_count: u32,
}

struct HeatmapEntry {
    date: String,    // "2026-01-15"
    count: u32,      // 当天 commit 数
}
```

### 数据获取策略

复用现有 commit 提取管线：
1. 日期范围：从今天往前 N 周（默认 52 周）
2. 调用 `collect_commits`（含仓库扫描 + 并发提取）
3. 按日期聚合 commit 数量（用 HashMap<String, u32>）
4. 跨仓库去重：同一 hash 只计一次（用 HashSet<String>）
5. 计算统计摘要（总数、活跃天、最长连续、最活跃日）

### 性能考量

52 周数据量较大，但只需 commit 的 date 和 hash 字段。可以用轻量的 git log 调用（`--format="%H %ad" --date=short`）代替完整 commit 提取，避免解析 message/body。

## 前端设计

### 组件结构

```
ContributionHeatmap (新组件)
├── HeatmapGrid (SVG 格子矩阵)
│   ├── MonthLabels (月份标签)
│   ├── WeekdayLabels (星期标签)
│   └── DayCell × 364 (每日格子)
├── HeatmapTooltip (悬浮提示)
└── HeatmapSummary (底部统计摘要)
```

### 放置位置

`Workbench.tsx` 的 assist-rail 面板新增一个 tab：
- AssistPanel 类型扩展：`"repos" | "history" | "quality" | "heatmap"`
- Tab 标签：使用 lucide-react 的 `CalendarDays` 或 `Activity` 图标

### SVG 规格

- 每个格子：11×11px
- 间距：3px
- 52 列 × 7 行
- 整体尺寸：约 728×98px（适配 assist-rail 宽度）
- 月份标签在顶部，星期标签在左侧

### 颜色梯度（5 级）

明亮主题：
- Level 0（无提交）：`#ebedf0`
- Level 1（1-2 次）：`#9be9a8`
- Level 2（3-4 次）：`#40c463`
- Level 3（5-8 次）：`#30a14e`
- Level 4（9+ 次）：`#216e39`

暗色主题：
- Level 0：`#161b22`
- Level 1：`#0e4429`
- Level 2：`#006d32`
- Level 3：`#26a641`
- Level 4：`#39d353`

通过 CSS 变量实现主题切换。

### 阈值计算

使用与 GitHub 相似的动态分档：基于最大值的百分比划分 4 档。避免硬编码阈值导致在低活跃度场景下全部为 level 1。

### 悬浮提示

原生 CSS tooltip（不引入 tooltip 库），显示：
```
2026-07-10（周四）
5 次提交
```

### 统计摘要

组件底部一行文字：
```
过去 52 周共 1,234 次提交 · 活跃 189 天 · 最长连续 23 天 · 最活跃 2026-03-15（28 次）
```
