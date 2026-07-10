# 代码变更量统计 — 技术设计

## 方案选择

### 数据获取：两次 git log 策略

保持现有 `git log --pretty=format:...` 调用不变（提取 commit 元信息），新增第二次调用：

```
git log --format="%x1e%H" --numstat --since=... --until=... [--author=...] [--all]
```

输出示例：
```
\x1e<hash1>

3\t1\tsrc/main.rs
10\t5\tsrc/lib.rs

\x1e<hash2>

-\t-\timage.png
1\t0\tREADME.md
```

**为什么不用单次调用**：现有 format 用 `%B`（完整 body，含换行），追加 `--numstat` 后 body 内容与 numstat 行无法可靠区分。两次调用保持现有解析完全不变，第二次仅取 hash + numstat，开销极小。

**为什么不用 `--shortstat`**：输出是人类可读文本（"3 files changed, 10 insertions(+)"），受 locale 影响，解析不稳定。`--numstat` 是 tab 分隔的纯数字，locale 无关。

### 数据模型扩展

```rust
// models.rs — CommitRecord 新增字段
pub struct CommitRecord {
    // ... 现有 8 个字段 ...
    pub additions: u64,      // 新增
    pub deletions: u64,      // 新增
    pub changed_files: u32,  // 新增
}
```

默认值为 0（向后兼容，无 numstat 数据时不影响现有逻辑）。

### 数据流

```
git log (原有) → Vec<CommitRecord>（无 LOC 字段）
       ↓
git log --numstat → HashMap<hash, (additions, deletions, files)>
       ↓
merge by hash → Vec<CommitRecord>（LOC 字段已填充）
       ↓
group_commits_by_project → 按项目汇总 LOC
       ↓
build_template_values → 填充 {additions} {deletions} {netLines} {changedFiles}
       ↓
render_report_template → 最终报告 Markdown
```

### 报告输出设计

**项目分组内**（已有项目段落末尾追加一行）：
```
📊 变更统计：+234 -89（净增 145 行，涉及 12 个文件）
```

**模板变量**（新增 4 个）：
- `{additions}` — 总新增行数
- `{deletions}` — 总删除行数
- `{netLines}` — 净增行数（additions - deletions）
- `{changedFiles}` — 变更文件总数

**绩效月报额外段落**：在默认月报模板末尾追加变更量汇总段。

### 前端影响

无需前端改动。MarkdownPreview 直接渲染后端返回的 Markdown 字符串，LOC 统计作为文本内容自然展示。

### 性能影响

第二次 `git log` 不含 body（`--format="%x1e%H"`），数据量极小。两次调用在同一 worker 线程内顺序执行，8 并发不变。对总耗时影响 < 10%。
