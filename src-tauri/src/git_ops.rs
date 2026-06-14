use crate::models::{CommitRecord, GitIdentity, RepoInfo};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

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
    start_date: &str,
    end_date: &str,
    author: &str,
    extract_all_branches: bool,
) -> Result<Vec<CommitRecord>, String> {
    ensure_git_available()?;
    let repo_path = PathBuf::from(&repo.path);
    let args = build_log_args(start_date, end_date, author, extract_all_branches);
    let borrowed_args: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(&repo_path, &borrowed_args)?;
    Ok(parse_git_log_output(repo, &output))
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
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        branch: current_branch(&path),
    }
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

fn build_log_args(
    start_date: &str,
    end_date: &str,
    author: &str,
    extract_all_branches: bool,
) -> Vec<String> {
    let mut args = vec!["log".to_string()];
    if extract_all_branches {
        args.push("--all".to_string());
    }
    args.extend([
        format!("--since={} 00:00:00", start_date),
        format!("--until={} 23:59:59", end_date),
        format!("--author={}", author),
        "--pretty=format:%x1e%H%x1f%an%x1f%ad%x1f%B".to_string(),
        "--date=iso".to_string(),
    ]);
    args
}

fn parse_git_log_output(repo: &RepoInfo, output: &str) -> Vec<CommitRecord> {
    output
        .split('\x1e')
        .filter_map(|record| parse_commit_record(repo, record))
        .collect()
}

fn parse_commit_record(repo: &RepoInfo, record: &str) -> Option<CommitRecord> {
    let record = record.trim();
    if record.is_empty() {
        return None;
    }

    let parts: Vec<&str> = record.splitn(4, '\x1f').collect();
    if parts.len() != 4 {
        return None;
    }

    Some(CommitRecord {
        repo_path: repo.path.clone(),
        project_name: repo.name.clone(),
        branch_name: repo.branch.clone(),
        hash: parts[0].trim().to_string(),
        author: parts[1].trim().to_string(),
        date: parts[2].trim().to_string(),
        message: parts[3].trim().to_string(),
    })
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

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("gitpulse-{label}-{}-{nanos}", std::process::id()))
    }
}
