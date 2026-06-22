use crate::{
    diagnostics::item,
    git_ops,
    models::{DiagnosticItem, DiagnosticSeverity, RepoInfo},
    pdf,
};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn git() -> DiagnosticItem {
    match git_ops::git_version() {
        Ok(version) => item(
            "git",
            "Git 命令",
            DiagnosticSeverity::Ok,
            format!("已检测到 {}", version.trim()),
            "",
        ),
        Err(message) => item(
            "git",
            "Git 命令",
            DiagnosticSeverity::Error,
            message,
            "安装 Git，并确认重新打开 GitPulse 后 git 已加入 PATH。",
        ),
    }
}

pub fn workspace_roots(root_dirs: &[String]) -> DiagnosticItem {
    let roots = root_dirs
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return item(
            "workspace-roots",
            "仓库根目录",
            DiagnosticSeverity::Error,
            "尚未选择仓库根目录，无法扫描本地 Git 仓库。",
            "在「工作区」添加至少一个存放代码仓库的目录。",
        );
    }

    let invalid = roots
        .iter()
        .filter(|root| !Path::new(root).is_dir())
        .copied()
        .collect::<Vec<_>>();
    let valid_count = roots.len().saturating_sub(invalid.len());
    if invalid.is_empty() {
        return item(
            "workspace-roots",
            "仓库根目录",
            DiagnosticSeverity::Ok,
            format!("已配置 {} 个可访问的仓库根目录。", valid_count),
            "",
        );
    }

    let sample = invalid
        .iter()
        .take(2)
        .copied()
        .collect::<Vec<_>>()
        .join("；");
    let severity = if valid_count == 0 {
        DiagnosticSeverity::Error
    } else {
        DiagnosticSeverity::Warning
    };
    item(
        "workspace-roots",
        "仓库根目录",
        severity,
        format!(
            "{} 个根目录不可访问{}。",
            invalid.len(),
            if sample.is_empty() {
                String::new()
            } else {
                format!("：{sample}")
            }
        ),
        "移除失效目录，或重新选择当前可访问的工作区。",
    )
}

pub fn repo_index(indexed_repos: &[RepoInfo]) -> DiagnosticItem {
    if indexed_repos.is_empty() {
        return item(
            "repo-index",
            "仓库索引",
            DiagnosticSeverity::Warning,
            "当前没有可用的仓库索引，生成报告前可能需要重新扫描。",
            "回到首页刷新仓库索引，确认需要统计的仓库已出现。",
        );
    }

    let invalid = indexed_repos
        .iter()
        .filter(|repo| !is_valid_repo_path(repo))
        .collect::<Vec<_>>();
    if invalid.is_empty() {
        return item(
            "repo-index",
            "仓库索引",
            DiagnosticSeverity::Ok,
            format!("已索引 {} 个可访问的 Git 仓库。", indexed_repos.len()),
            "",
        );
    }

    let valid_count = indexed_repos.len().saturating_sub(invalid.len());
    let sample = invalid
        .iter()
        .take(2)
        .map(|repo| repo.name.as_str())
        .collect::<Vec<_>>()
        .join("、");
    let severity = if valid_count == 0 {
        DiagnosticSeverity::Error
    } else {
        DiagnosticSeverity::Warning
    };
    item(
        "repo-index",
        "仓库索引",
        severity,
        format!(
            "{} 个仓库路径已失效，{} 个仍可用{}。",
            invalid.len(),
            valid_count,
            if sample.is_empty() {
                String::new()
            } else {
                format!("；示例：{sample}")
            }
        ),
        "重新扫描仓库索引，或移除已经移动、删除、卸载的仓库。",
    )
}

pub fn author(author: &str) -> DiagnosticItem {
    if author.trim().is_empty() {
        return item(
            "author",
            "Git 作者",
            DiagnosticSeverity::Error,
            "Git 作者未填写，报告无法按作者过滤提交记录。",
            "填写本机 Git user.name，或与你提交记录一致的作者名 / 邮箱片段。",
        );
    }

    item(
        "author",
        "Git 作者",
        DiagnosticSeverity::Ok,
        format!("将按「{}」过滤提交记录。", author.trim()),
        "",
    )
}

pub fn output_dir(output_dir: &str, output_enabled: bool) -> DiagnosticItem {
    if !output_enabled {
        return item(
            "output-dir",
            "自动保存目录",
            DiagnosticSeverity::Ok,
            "未启用自动保存，报告会先保留在预览区。",
            "",
        );
    }

    match validate_output_dir(output_dir) {
        Ok(()) => item(
            "output-dir",
            "自动保存目录",
            DiagnosticSeverity::Ok,
            "输出目录可访问且具备写入权限。",
            "",
        ),
        Err((message, action)) => item(
            "output-dir",
            "自动保存目录",
            DiagnosticSeverity::Error,
            message,
            action,
        ),
    }
}

pub fn pdf_font() -> DiagnosticItem {
    if pdf::has_report_font() {
        return item(
            "pdf-font",
            "PDF 中文字体",
            DiagnosticSeverity::Ok,
            "已检测到可用于中文 PDF 导出的系统字体。",
            "",
        );
    }

    item(
        "pdf-font",
        "PDF 中文字体",
        DiagnosticSeverity::Warning,
        "未检测到常见中文字体，中文 PDF 导出可能失败；Markdown 与 Word 导出不受影响。",
        "如需导出中文 PDF，请安装 Noto Sans SC、微软雅黑、黑体或宋体。",
    )
}

fn validate_output_dir(output_dir: &str) -> Result<(), (String, String)> {
    let trimmed = output_dir.trim();
    if trimmed.is_empty() {
        return Err((
            "已启用自动保存，但尚未选择输出目录。".to_string(),
            "在「工作区」选择一个可写入的输出目录。".to_string(),
        ));
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err((
            format!("输出目录不存在或当前无法访问：{trimmed}。"),
            "重新选择一个当前可访问的文件夹。".to_string(),
        ));
    }
    if !path.is_dir() {
        return Err((
            format!("输出路径不是文件夹：{trimmed}。"),
            "选择文件夹作为输出目录，而不是具体文件。".to_string(),
        ));
    }
    probe_writable_dir(&path).map_err(|message| {
        (
            message,
            "更换输出目录，或检查当前用户对该目录的写入权限。".to_string(),
        )
    })
}

fn is_valid_repo_path(repo: &RepoInfo) -> bool {
    let path = PathBuf::from(repo.path.trim());
    if !path.is_dir() {
        return false;
    }
    let marker = path.join(".git");
    marker.is_dir() || marker.is_file()
}

fn probe_writable_dir(path: &Path) -> Result<(), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let probe = path.join(format!(
        ".gitpulse-write-test-{}-{stamp}.tmp",
        std::process::id()
    ));
    fs::write(&probe, b"ok").map_err(|err| format!("输出目录不可写：{err}"))?;
    fs::remove_file(&probe).map_err(|err| format!("输出目录可写，但清理测试文件失败：{err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_accepts_writable_output_dir() {
        let root = temp_root("diagnostic-output");
        fs::create_dir_all(&root).unwrap();

        let item = output_dir(&root.to_string_lossy(), true);

        assert_eq!(item.severity, DiagnosticSeverity::Ok);
        let _ = fs::remove_dir_all(root);
    }

    fn temp_root(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("gitpulse-{label}-{}-{stamp}", std::process::id()))
    }
}
