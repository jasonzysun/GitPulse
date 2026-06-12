use crate::models::{CommitRecord, GitIdentity, RepoInfo};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn find_git_repos(root_dirs: &[String]) -> Result<Vec<RepoInfo>, String> {
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
            // 多个根目录可能重叠或经软链指向同一仓库，按绝对路径去重。
            if seen.insert(repo.path.clone()) {
                repos.push(repo);
            }
        }
    }
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
    let repo_path = PathBuf::from(&repo.path);
    let args = build_log_args(start_date, end_date, author, extract_all_branches);
    let borrowed_args: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(&repo_path, &borrowed_args)?;
    Ok(parse_git_log_output(repo, &output))
}

fn visit_dir(dir: &Path, repos: &mut Vec<RepoInfo>) -> std::io::Result<()> {
    if dir.join(".git").is_dir() {
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
    RepoInfo {
        path: dir.to_string_lossy().to_string(),
        name: dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        branch: current_branch(dir),
    }
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

fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|err| format!("执行 git 失败：{}", err))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn run_git_config(key: &str) -> String {
    Command::new("git")
        .args(["config", "--global", key])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}
