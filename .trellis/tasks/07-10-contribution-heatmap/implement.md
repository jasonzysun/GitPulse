# 工作热力图 — 实施计划

## 实施步骤

### 1. 后端数据模型

**文件**: `src-tauri/src/models.rs`

新增结构体：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapOptions {
    pub workspace_roots: Vec<String>,
    pub author: String,
    pub weeks: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapEntry {
    pub date: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapResult {
    pub entries: Vec<HeatmapEntry>,
    pub total_commits: u32,
    pub active_days: u32,
    pub max_streak: u32,
    pub busiest_day: String,
    pub busiest_count: u32,
}
```

**验证**: `cargo check`

### 2. 后端热力图数据提取

**文件**: `src-tauri/src/commit_pipeline.rs`

新增 `pub fn collect_heatmap_data(options: &HeatmapOptions) -> Result<HeatmapResult, String>` 函数：

1. 计算日期范围：从今天往前 N 周（默认 52）
2. 复用 `discover_repos_for_roots` 获取仓库列表
3. 对每个仓库执行轻量 git log：`git log --format="%H %ad" --date=short --since=... --until=... [--author=...]`
4. 用 HashSet<String> 按 hash 去重（跨仓库同一 commit 只计一次）
5. 用 HashMap<String, u32> 按日期聚合 count
6. 计算统计摘要：total_commits, active_days, max_streak（连续有 commit 的天数），busiest_day
7. 生成 entries（覆盖完整日期范围，无 commit 的天 count=0）

注意：不复用完整的 `collect_commits`（太重），而是用轻量的 git log 只取 hash+date。

**文件**: `src-tauri/src/git_ops.rs`

新增 `pub fn get_commit_dates(repo: &RepoInfo, start_date: &str, end_date: &str, author: &str, all_branches: bool) -> Result<Vec<(String, String)>, String>` 函数，返回 `Vec<(hash, date)>`。

**验证**: `cargo check && cargo test --lib`

### 3. 后端 Tauri command

**文件**: `src-tauri/src/lib.rs`

新增 command：
```rust
#[tauri::command]
async fn get_heatmap_data(app: AppHandle, options: models::HeatmapOptions) -> Result<models::HeatmapResult, String>
```

在 `tauri::Builder` 的 `invoke_handler` 中注册。

**验证**: `cargo check`

### 4. 前端热力图组件

**文件**: `src/components/ContributionHeatmap.tsx`（新建）

实现纯 SVG 热力图组件：
- props: `{ data: HeatmapResult | null, loading: boolean }`
- SVG 渲染 52×7 格子矩阵
- 月份标签（Jan-Dec）和星期标签（Mon/Wed/Fri）
- 每个格子根据 count 映射到 0-4 级颜色
- 动态阈值：level 边界基于 maxCount 的百分比（25%/50%/75%）
- CSS hover tooltip 显示日期和提交数
- 底部统计摘要行
- 适配明暗主题（CSS 变量）

**验证**: `npm run dev` 手动检查

### 5. 前端热力图样式

**文件**: `src/components/ContributionHeatmap.css`（新建）

- SVG 格子颜色用 CSS 变量定义
- `:root[data-theme="dark"]` 暗色配色
- tooltip 样式
- 响应式：窄屏时可横向滚动

### 6. 集成到工作台

**文件**: `src/components/Workbench.tsx`

1. 扩展 AssistPanel 类型：新增 `"heatmap"`
2. 在 assist-tabs 中新增热力图 tab 按钮（使用 `CalendarDays` 图标）
3. 在 assist-rail 面板内容区新增 heatmap 面板
4. 面板激活时调用 `invoke("get_heatmap_data", { options })` 获取数据
5. 将数据传给 `ContributionHeatmap` 组件

**验证**: `npm run dev` 手动检查热力图 tab 和数据加载

### 7. 单元测试

**文件**: `src-tauri/src/commit_pipeline.rs` 或 `src-tauri/src/git_ops.rs`

新增测试：
- `test_heatmap_streak_calculation` — 验证最长连续天数计算
- `test_heatmap_empty_data` — 验证无 commit 时返回全 0

**验证**: `cargo test --lib`

## 验证清单

- [ ] `cargo check` 通过
- [ ] `cargo test --lib` 通过
- [ ] `npm run dev` 启动后辅助面板有热力图 tab
- [ ] 点击热力图 tab 加载数据并展示格子矩阵
- [ ] 悬浮格子显示日期和提交数
- [ ] 底部统计摘要正确
- [ ] 明暗主题切换格子颜色正确
- [ ] 无 commit 数据时显示空白热力图（全灰格子）
