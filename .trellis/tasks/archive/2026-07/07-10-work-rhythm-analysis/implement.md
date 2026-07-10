# 工作节奏分析 — 实施计划

## 实施步骤

### 1. 后端数据模型

**文件**: `src-tauri/src/models.rs`

新增：
```rust
pub struct WorkRhythmOptions {
    pub workspace_roots: Vec<String>,
    pub author: String,
}

pub struct WorkRhythmResult {
    pub hourly_distribution: Vec<u32>,
    pub weekday_distribution: Vec<u32>,
    pub this_week_commits: u32,
    pub last_week_commits: u32,
    pub overtime_ratio: f64,
    pub busiest_hour: u32,
    pub weekend_ratio: f64,
}
```

**验证**: `cargo check`

### 2. 后端时间戳提取

**文件**: `src-tauri/src/git_ops.rs`

新增 `get_commit_timestamps` 函数：
- `git log --format="%H %aI" --since=... --until=...`
- 返回 `Vec<(hash, iso_timestamp)>`
- `%aI` 是 ISO 8601 格式含时区，例如 `2026-07-10T14:30:00+08:00`

**验证**: `cargo check`

### 3. 后端聚合逻辑

**文件**: `src-tauri/src/commit_pipeline.rs`

新增 `collect_work_rhythm(options: &WorkRhythmOptions) -> Result<WorkRhythmResult, String>`：
1. 计算本周和上周的日期范围
2. 发现仓库并并发提取时间戳
3. 按 hash 去重
4. 解析 ISO 时间戳提取 hour（0-23）和 weekday（0=周一 到 6=周日）
5. 填充 hourly_distribution[24] 和 weekday_distribution[7]
6. 计算 this_week/last_week 分别的 commit 数
7. 计算 overtime_ratio 和 weekend_ratio
8. 找出 busiest_hour

ISO 时间戳解析：不引入 chrono 库，手动解析 `YYYY-MM-DDTHH:MM:SS` 提取小时，用日期计算星期几。

**验证**: `cargo check && cargo test --lib`

### 4. 后端 Tauri command

**文件**: `src-tauri/src/lib.rs`

新增 `get_work_rhythm` command 并注册到 invoke_handler。

**验证**: `cargo check`

### 5. 前端工作节奏组件

**文件**: `src/components/WorkRhythmPanel.tsx`（新建）+ `src/components/WorkRhythmPanel.css`（新建）

- 24 小时分布条形图（纯 CSS div）
- 4 个节奏卡片（CSS grid 2×2）
- 加班比例进度条
- 本周 vs 上周增减箭头
- 明暗主题适配

### 6. 集成到工作台

**文件**: `src/components/Workbench.tsx`

在 heatmap 面板内容区底部加载 WorkRhythmPanel，与热力图共享 tab。点击 heatmap tab 时同时调用 `get_work_rhythm`。

### 7. 单元测试

新增：
- `test_work_rhythm_hour_parsing` — ISO 时间戳小时提取
- `test_overtime_ratio_calculation` — 加班比例计算

**验证**: `cargo test --lib`

## 验证清单

- [ ] `cargo check` 通过
- [ ] `cargo test --lib` 通过
- [ ] 热力图 tab 下方显示工作节奏分析
- [ ] 24 小时分布条形图正确
- [ ] 本周 vs 上周对比数据正确
- [ ] 加班比例和周末比例正确
- [ ] 明暗主题适配
