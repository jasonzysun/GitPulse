use crate::models::{CommitRecord, GitIdentity, RepoInfo};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct GitCommitQuery<'a> {
    pub start_date: &'a str,
    pub end_date: &'a str,
    pub author: &'a str,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
}

pub fn find_git_repos(root_dirs: &[String]) -> Result<Vec<RepoInfo>, String> {
    ensure_git_available()?;
    let mut repos = Vec::new();
    let mut seen = HashSet::new();
    for root_dir in root_dirs {
        let root = PathBuf::from(root_dir);
        // 单个根目录失效（外置盘未挂载、目录被删）不应中断整次扫描，跳过即可。
        if !root.is_dir() {
            continue;
        }
        let mut found = Vec::new();
        visit_dir(&root, &mut found).map_err(|err| err.to_string())?;
        for repo in found {
            // 多个根目录可能重叠或经软链指向同一仓库，按规整后的路径去重。
            if seen.insert(repo.path.clone()) {
                repos.push(repo);
            }
        }
    }
    repos.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(repos)
}

pub fn git_identity() -> GitIdentity {
    GitIdentity {
        user_name: run_git_config("user.name"),
        user_email: run_git_config("user.email"),
    }
}

pub fn current_branch(repo_path: &Path) -> String {
    run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|text| text.trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

pub fn get_git_commits(
    repo: &RepoInfo,
    query: &GitCommitQuery,
) -> Result<Vec<CommitRecord>, String> {
    ensure_git_available()?;
    let repo_path = PathBuf::from(&repo.path);
    let args = build_log_args(query);
    let borrowed_args: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(&repo_path, &borrowed_args)?;
    Ok(parse_git_log_output(repo, &output, query))
}

fn visit_dir(dir: &Path, repos: &mut Vec<RepoInfo>) -> std::io::Result<()> {
    if is_git_repo_dir(dir) {
        repos.push(build_repo_info(dir));
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() && should_visit_dir(&path) {
            let _ = visit_dir(&path, repos);
        }
    }
    Ok(())
}

fn build_repo_info(dir: &Path) -> RepoInfo {
    let path = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    RepoInfo {
        path: display_path(&path),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        branch: current_branch(&path),
    }
}

fn display_path(path: &Path) -> String {
    strip_windows_verbatim_prefix(&path.to_string_lossy())
}

fn strip_windows_verbatim_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("\\\\?\\UNC\\") {
        return format!("\\\\{rest}");
    }
    if let Some(rest) = path.strip_prefix("\\\\?\\") {
        return rest.to_string();
    }
    path.to_string()
}

fn is_git_repo_dir(dir: &Path) -> bool {
    let marker = dir.join(".git");
    marker.is_dir() || marker.is_file()
}

fn should_visit_dir(path: &Path) -> bool {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    !matches!(
        name.as_ref(),
        ".git" | "node_modules" | "target" | "dist" | ".venv" | "__pycache__"
    )
}

fn build_log_args(query: &GitCommitQuery) -> Vec<String> {
    let mut args = vec!["log".to_string()];
    if query.extract_all_branches {
        args.push("--all".to_string());
        args.push("--source".to_string());
    }
    if query.exclude_merge_commits {
        args.push("--no-merges".to_string());
    }
    args.extend([
        format!("--since={} 00:00:00", query.start_date),
        format!("--until={} 23:59:59", query.end_date),
        format!("--author={}", query.author),
        "--pretty=format:%x1e%H%x1f%P%x1f%S%x1f%an%x1f%ae%x1f%ad%x1f%B".to_string(),
        "--date=iso".to_string(),
    ]);
    args
}

fn parse_git_log_output(
    repo: &RepoInfo,
    output: &str,
    query: &GitCommitQuery,
) -> Vec<CommitRecord> {
    output
        .split('\x1e')
        .filter_map(|record| parse_commit_record(repo, record, query))
        .collect()
}

fn parse_commit_record(
    repo: &RepoInfo,
    record: &str,
    query: &GitCommitQuery,
) -> Option<CommitRecord> {
    let record = record.trim();
    if record.is_empty() {
        return None;
    }

    let parts: Vec<&str> = record.splitn(7, '\x1f').collect();
    if parts.len() != 7 {
        return None;
    }
    let parent_count = parts[1].split_whitespace().count();
    let message = parts[6].trim();
    let author = parts[3].trim();
    let author_email = parts[4].trim();

    if query.exclude_merge_commits && parent_count > 1 {
        return None;
    }
    if query.exclude_revert_commits && is_revert_commit(message) {
        return None;
    }
    if query.exclude_bot_commits && is_bot_author(author, author_email) {
        return None;
    }

    Some(CommitRecord {
        repo_path: repo.path.clone(),
        project_name: repo.name.clone(),
        branch_name: branch_name_from_source(repo, parts[2], query.extract_all_branches),
        hash: parts[0].trim().to_string(),
        author: author.to_string(),
        author_email: author_email.to_string(),
        date: parts[5].trim().to_string(),
        message: message.to_string(),
    })
}

fn branch_name_from_source(repo: &RepoInfo, source: &str, extract_all_branches: bool) -> String {
    if !extract_all_branches {
        return repo.branch.clone();
    }
    normalize_source_ref(source).unwrap_or_else(|| repo.branch.clone())
}

fn normalize_source_ref(source: &str) -> Option<String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_prefix = trimmed
        .strip_prefix("refs/heads/")
        .or_else(|| trimmed.strip_prefix("refs/remotes/"))
        .unwrap_or(trimmed);
    let without_remote = without_prefix
        .strip_prefix("origin/")
        .unwrap_or(without_prefix);
    if without_remote == "HEAD" || without_remote.ends_with("/HEAD") {
        return None;
    }
    Some(without_remote.to_string())
}

fn is_revert_commit(message: &str) -> bool {
    let subject = message.lines().next().unwrap_or_default().trim();
    let subject_lower = subject.to_lowercase();
    subject_lower == "revert"
        || subject_lower.starts_with("revert ")
        || subject_lower.starts_with("revert:")
        || subject_lower.starts_with("revert(")
        || message.contains("This reverts commit")
}

fn is_bot_author(name: &str, email: &str) -> bool {
    let name = name.trim().to_lowercase();
    let email = email.trim().to_lowercase();
    name.contains("[bot]")
        || email.contains("[bot]")
        || name == "github-actions"
        || name == "dependabot"
        || name.ends_with(" bot")
        || email.starts_with("dependabot")
        || email.starts_with("github-actions")
        || email.contains("bot@")
}

/// 创建 git 子进程命令。Windows 上设置 CREATE_NO_WINDOW，避免生产包（GUI 子系统、无控制台）
/// 每调用一次 git 就弹出一个一闪而过的 cmd/终端窗口——有多少仓库就弹多少次。
/// 开发环境因为应用挂在控制台上、子进程复用它，所以看不到这个问题。
fn git_command() -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn ensure_git_available() -> Result<(), String> {
    git_command()
        .arg("--version")
        .output()
        .map_err(format_git_launch_error)
        .and_then(|output| {
            if output.status.success() {
                Ok(())
            } else {
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if detail.is_empty() {
                    "Git 命令不可用，请确认已安装 Git 并能在终端执行 git --version。".to_string()
                } else {
                    detail
                })
            }
        })
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_command()
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(format_git_launch_error)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() {
            format!("Git 命令执行失败：git {}", args.join(" "))
        } else {
            detail
        })
    }
}

fn format_git_launch_error(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::NotFound {
        return "未找到 Git 命令，请先安装 Git 并确认 git 已加入 PATH。安装后重新打开 GitPulse。"
            .to_string();
    }
    format!("启动 Git 命令失败：{error}")
}

fn run_git_config(key: &str) -> String {
    git_command()
        .args(["config", "--global", key])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn find_git_repos_detects_worktree_git_file() {
        let root = temp_root("worktree-git-file");
        let repo = root.join("repo");
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join(".git"), "gitdir: ../.git/worktrees/repo\n").unwrap();

        let repos = find_git_repos(&[root.to_string_lossy().to_string()]).unwrap();

        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "repo");
        assert_eq!(repos[0].branch, "unknown");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn find_git_repos_deduplicates_overlapping_roots() {
        let root = temp_root("dedupe-overlap");
        let repo = root.join("repo");
        fs::create_dir_all(repo.join(".git")).unwrap();

        let repos = find_git_repos(&[
            root.to_string_lossy().to_string(),
            repo.to_string_lossy().to_string(),
        ])
        .unwrap();

        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "repo");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn format_git_launch_error_explains_missing_git() {
        let message = format_git_launch_error(io::Error::from(io::ErrorKind::NotFound));

        assert!(message.contains("未找到 Git 命令"));
        assert!(message.contains("PATH"));
    }

    #[test]
    fn strip_windows_verbatim_prefix_from_drive_path() {
        let path = strip_windows_verbatim_prefix("\\\\?\\C:\\workspace\\repo");

        assert_eq!(path, "C:\\workspace\\repo");
    }

    #[test]
    fn strip_windows_verbatim_prefix_from_unc_path() {
        let path = strip_windows_verbatim_prefix("\\\\?\\UNC\\server\\share\\repo");

        assert_eq!(path, "\\\\server\\share\\repo");
    }

    #[test]
    fn strip_windows_verbatim_prefix_keeps_regular_path() {
        let path = strip_windows_verbatim_prefix("C:\\workspace\\repo");

        assert_eq!(path, "C:\\workspace\\repo");
    }

    #[test]
    fn parse_git_log_output_filters_merge_revert_and_bot_commits() {
        let repo = repo_info();
        let query = query(true, true, true, true);
        let output = [
            log_record(
                "normal",
                "parent",
                "refs/heads/main",
                "tester",
                "tester@example.com",
                "feat: keep",
            ),
            log_record(
                "merge",
                "parent-a parent-b",
                "refs/heads/main",
                "tester",
                "tester@example.com",
                "Merge branch 'feature'",
            ),
            log_record(
                "revert",
                "parent",
                "refs/heads/main",
                "tester",
                "tester@example.com",
                "Revert \"feat: old change\"",
            ),
            log_record(
                "bot",
                "parent",
                "refs/heads/main",
                "dependabot[bot]",
                "49699333+dependabot[bot]@users.noreply.github.com",
                "chore: bump dependency",
            ),
        ]
        .join("");

        let commits = parse_git_log_output(&repo, &output, &query);

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].hash, "normal");
    }

    #[test]
    fn parse_git_log_output_uses_source_ref_for_all_branch_attribution() {
        let repo = repo_info();
        let query = query(true, false, false, false);
        let output = log_record(
            "abc123",
            "parent",
            "refs/remotes/origin/feature/report",
            "tester",
            "tester@example.com",
            "feat: report",
        );

        let commits = parse_git_log_output(&repo, &output, &query);

        assert_eq!(commits[0].branch_name, "feature/report");
    }

    #[test]
    fn parse_git_log_output_keeps_current_branch_without_all_branches() {
        let repo = repo_info();
        let query = query(false, false, false, false);
        let output = log_record(
            "abc123",
            "parent",
            "refs/heads/feature/report",
            "tester",
            "tester@example.com",
            "feat: report",
        );

        let commits = parse_git_log_output(&repo, &output, &query);

        assert_eq!(commits[0].branch_name, "main");
    }

    #[test]
    fn build_log_args_uses_source_and_no_merges_for_all_branch_filters() {
        let query = query(true, true, false, false);

        let args = build_log_args(&query);

        assert!(args.contains(&"--all".to_string()));
        assert!(args.contains(&"--source".to_string()));
        assert!(args.contains(&"--no-merges".to_string()));
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("gitpulse-{label}-{}-{nanos}", std::process::id()))
    }

    fn repo_info() -> RepoInfo {
        RepoInfo {
            path: "repo-a".to_string(),
            name: "repo-a".to_string(),
            branch: "main".to_string(),
        }
    }

    fn query(
        extract_all_branches: bool,
        exclude_merge_commits: bool,
        exclude_revert_commits: bool,
        exclude_bot_commits: bool,
    ) -> GitCommitQuery<'static> {
        GitCommitQuery {
            start_date: "2026-06-01",
            end_date: "2026-06-30",
            author: "tester",
            extract_all_branches,
            exclude_merge_commits,
            exclude_revert_commits,
            exclude_bot_commits,
        }
    }

    fn log_record(
        hash: &str,
        parents: &str,
        source: &str,
        author: &str,
        email: &str,
        message: &str,
    ) -> String {
        format!(
            "\x1e{hash}\x1f{parents}\x1f{source}\x1f{author}\x1f{email}\x1f2026-06-10 10:00:00 +0800\x1f{message}"
        )
    }
}
