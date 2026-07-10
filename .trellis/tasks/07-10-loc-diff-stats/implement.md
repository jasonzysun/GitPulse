# 代码变更量统计 — 实施计划

## 实施步骤

### 1. 扩展 CommitRecord 数据结构

**文件**: `src-tauri/src/models.rs` 第 51-60 行

在 `CommitRecord` 结构体末尾新增 3 个字段：

```rust
pub additions: u64,
pub deletions: u64,
pub changed_files: u32,
```

所有构造 `CommitRecord` 的地方需补齐新字段（默认值 0）：
- `src-tauri/src/git_ops.rs` 第 353-362 行 `parse_commit_record`

**验证**: `cargo check`

### 2. 新增 numstat 提取函数

**文件**: `src-tauri/src/git_ops.rs`

新增两个函数：

```rust
/// 构建 numstat 查询参数（与 build_log_args 共享过滤条件）
fn build_numstat_args(query: &GitCommitQuery) -> Vec<String>

/// 解析 numstat 输出，返回 HashMap<hash, (additions, deletions, changed_files)>
fn parse_numstat_output(output: &str) -> HashMap<String, (u64, u64, u32)>
```

`build_numstat_args` 生成：
```
git log --format="%x1e%H" --numstat --since=... --until=... [--author=...] [--all] [--no-merges]
```

`parse_numstat_output` 解析规则：
- 按 `\x1e` 分割记录
- 每条记录第一行为 hash
- 后续非空行为 numstat（tab 分隔：additions, deletions, filename）
- `-\t-\t` 行为二进制文件，跳过不计入行数

### 3. 修改 get_git_commits 合并 LOC 数据

**文件**: `src-tauri/src/git_ops.rs` 第 98-108 行

在现有 `get_git_commits` 函数中：
1. 保持现有 `git log` 调用不变
2. 新增第二次 `git log --numstat` 调用
3. 用 hash 做 join，将 LOC 数据填入 CommitRecord

```rust
pub fn get_git_commits(repo: &RepoInfo, query: &GitCommitQuery) -> Result<Vec<CommitRecord>, String> {
    ensure_git_available()?;
    let repo_path = PathBuf::from(&repo.path);

    // 第一步：原有 commit 元信息提取（不变）
    let args = build_log_args(query);
    let borrowed_args: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(&repo_path, &borrowed_args)?;
    let mut records = parse_git_log_output(repo, &output, query);

    // 第二步：numstat LOC 提取
    let numstat_args = build_numstat_args(query);
    let borrowed_numstat: Vec<&str> = numstat_args.iter().map(String::as_str).collect();
    if let Ok(numstat_output) = run_git(&repo_path, &borrowed_numstat) {
        let stats = parse_numstat_output(&numstat_output);
        for record in &mut records {
            if let Some(&(a, d, f)) = stats.get(&record.hash) {
                record.additions = a;
                record.deletions = d;
                record.changed_files = f;
            }
        }
    }
    // numstat 失败不阻塞报告生成，LOC 字段保持默认 0

    Ok(records)
}
```

**验证**: `cargo check && cargo test`

### 4. 报告模板变量扩展

**文件**: `src-tauri/src/report.rs`

#### 4a. 扩展 ReportTemplateValues（第 532-546 行）

新增 4 个字段：
```rust
additions: String,
deletions: String,
net_lines: String,
changed_files: String,
```

#### 4b. 在 build_template_values 中计算（第 555 行起）

遍历 commits 累加 additions/deletions/changed_files，计算 net_lines。

#### 4c. 在 render_report_template 中注册（第 647-661 行）

追加 4 个替换对：
```rust
("{additions}", values.additions.as_str()),
("{deletions}", values.deletions.as_str()),
("{netLines}", values.net_lines.as_str()),
("{changedFiles}", values.changed_files.as_str()),
```

**验证**: `cargo check`

### 5. 项目分组内追加变更统计行

**文件**: `src-tauri/src/report.rs`

在 `render_actual_completion_content` 函数中，每个项目分组的 commit 列表末尾追加一行变更统计摘要：

```
📊 变更统计：+{additions} -{deletions}（净增 {net} 行，涉及 {files} 个文件）
```

仅当该项目有 LOC 数据时才追加（所有 commit 的 additions + deletions > 0）。

**验证**: `cargo check`

### 6. 默认月报模板中使用新变量

**文件**: `src-tauri/src/models.rs`

在默认月报模板（第 433-457 行附近）中追加变更量汇总段落，使用 `{additions}` `{deletions}` `{netLines}` 变量。

**验证**: `cargo check`

### 7. 前端模板变量校验同步

**文件**: `src/components/ReportFormatSettings.tsx`（或模板变量校验相关组件）

在前端模板变量列表中注册 4 个新变量，使模板编辑器的校验和提示包含它们。

**验证**: `npm run dev` 手动检查模板设置界面

### 8. 单元测试

**文件**: `src-tauri/src/git_ops.rs`

新增测试：
- `test_parse_numstat_output` — 验证正常 numstat 输出解析
- `test_parse_numstat_binary_files` — 验证二进制文件（`-\t-\t`）被跳过
- `test_parse_numstat_empty` — 验证空输出返回空 map

**验证**: `cargo test`

## 验证清单

- [ ] `cargo check` 通过
- [ ] `cargo test` 通过
- [ ] `npm run dev` 启动后生成日报/周报包含变更统计
- [ ] 绩效月报包含变更量汇总
- [ ] 模板编辑器中可看到新变量
- [ ] 有二进制文件变更的仓库不计入行数
- [ ] Word/PDF 导出包含变更统计文本
