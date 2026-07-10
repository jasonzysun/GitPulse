# 工作节奏分析 — 技术设计

## 方案概述

在热力图 tab 下方新增工作节奏卡片区域，展示提交时间分布、加班检测和周对比数据。复用热力图的 assist-rail 面板，无需新增 tab。

## 后端设计

### 数据获取

新增轻量 git log 函数，返回 hash + ISO 时间戳（含时区）：

```rust
// git_ops.rs
pub fn get_commit_timestamps(repo, start_date, end_date, author, all_branches)
    -> Result<Vec<(String, String)>, String>
// git log --format="%H %aI" --date=iso-strict
// 返回 Vec<(hash, "2026-07-10T14:30:00+08:00")>
```

### 数据模型

```rust
struct WorkRhythmOptions {
    workspace_roots: Vec<String>,
    author: String,
}

struct WorkRhythmResult {
    hourly_distribution: Vec<u32>,        // [0..24] 每小时 commit 数
    weekday_distribution: Vec<u32>,       // [0..7] 周一到周日
    this_week_commits: u32,
    last_week_commits: u32,
    overtime_ratio: f64,                  // 加班比例 (工作日21:00后 + 周末)
    busiest_hour: u32,                    // 最活跃时段
    weekend_ratio: f64,                   // 周末提交占比
}
```

### 聚合逻辑

在 `commit_pipeline.rs` 新增 `collect_work_rhythm(options) -> Result<WorkRhythmResult, String>`：

1. 日期范围：最近 2 周（本周 + 上周对比）
2. 复用 `discover_repos_for_roots` 获取仓库列表
3. 对每个仓库调用 `get_commit_timestamps`
4. 按 hash 跨仓库去重
5. 解析 ISO 时间戳，提取 hour 和 weekday
6. 聚合各维度数据

### 加班定义

- 工作日 21:00-次日 6:00 的提交算加班
- 周末全天算加班
- overtime_ratio = 加班提交数 / 总提交数

## 前端设计

### 组件结构

在 `ContributionHeatmap.tsx` 底部（或平级）新增 `WorkRhythmPanel` 区域，包含：

1. **时段分布条形图**：24 根竖条，高度表示提交数，最活跃时段高亮
2. **节奏卡片**：
   - 本周 vs 上周（提交数 + 增减箭头 + 百分比）
   - 最活跃时段（如"下午 2-3 点"）
   - 加班比例（进度条 + 百分比）
   - 周末占比

### 渲染方式

- 24 小时条形图用纯 CSS div 实现（不用 SVG）
- 卡片用 CSS grid 2×2 布局
- 复用热力图的 CSS 变量做明暗主题适配

### 数据加载

与热力图共享加载时机：点击 heatmap tab 时同时请求两组数据（热力图 + 工作节奏），或者工作节奏作为热力图面板的一部分延迟加载。
