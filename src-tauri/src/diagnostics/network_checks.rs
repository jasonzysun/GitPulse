use crate::{
    diagnostics::item,
    models::{DiagnosticItem, DiagnosticSeverity},
};
use reqwest::{
    blocking::{Client, Response},
    StatusCode,
};
use serde_json::Value;
use std::time::Duration;

const USER_AGENT: &str = "GitPulse diagnostics";
const HTTP_TIMEOUT_SECS: u64 = 8;
const GITHUB_REPO_API_URL: &str = "https://api.github.com/repos/GoldenZqqq/GitPulse";
const UPDATER_MANIFEST_URL: &str =
    "https://github.com/GoldenZqqq/GitPulse/releases/latest/download/gitpulse-latest.json";

pub fn github() -> DiagnosticItem {
    match get(GITHUB_REPO_API_URL) {
        Ok(response) if response.status().is_success() => item(
            "network-github",
            "GitHub 网络",
            DiagnosticSeverity::Ok,
            "GitHub API 可访问，在线更新和发布信息查询具备基础网络条件。",
            "",
        ),
        Ok(response) => item(
            "network-github",
            "GitHub 网络",
            DiagnosticSeverity::Warning,
            format!("GitHub 可连接，但返回 HTTP {}。", response.status()),
            "如果检查更新失败，请确认代理、公司网络策略或 GitHub 访问限制。",
        ),
        Err(message) => item(
            "network-github",
            "GitHub 网络",
            DiagnosticSeverity::Warning,
            format!("无法连接 GitHub：{message}"),
            "检查网络、代理或防火墙；本地报告生成不受影响。",
        ),
    }
}

pub fn updater_manifest() -> DiagnosticItem {
    match get(UPDATER_MANIFEST_URL) {
        Ok(response) => classify_manifest_response(response),
        Err(message) => item(
            "updater-manifest",
            "更新清单",
            DiagnosticSeverity::Warning,
            format!("无法读取更新清单：{message}"),
            "检查网络或代理；也可到 GitHub Releases 手动下载新版本。",
        ),
    }
}

fn classify_manifest_response(response: Response) -> DiagnosticItem {
    let status = response.status();
    if status == StatusCode::NOT_FOUND {
        return item(
            "updater-manifest",
            "更新清单",
            DiagnosticSeverity::Warning,
            "未找到 latest 更新清单，自动更新可能暂不可用。",
            "确认最新 Release 已上传 gitpulse-latest.json，或手动下载安装包。",
        );
    }
    if !status.is_success() {
        return item(
            "updater-manifest",
            "更新清单",
            DiagnosticSeverity::Warning,
            format!("更新清单返回 HTTP {status}。"),
            "如果应用内检查更新失败，请稍后重试或手动下载新版本。",
        );
    }

    match response
        .text()
        .map_err(|err| err.to_string())
        .and_then(|body| manifest_version(&body))
    {
        Ok(version) => item(
            "updater-manifest",
            "更新清单",
            DiagnosticSeverity::Ok,
            format!("已读取 latest 更新清单，当前发布版本为 {version}。"),
            "",
        ),
        Err(message) => item(
            "updater-manifest",
            "更新清单",
            DiagnosticSeverity::Warning,
            format!("更新清单格式异常：{message}"),
            "重新发布时确认 updater artifact 完整上传。",
        ),
    }
}

fn get(url: &str) -> Result<Response, String> {
    client()?
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/json")
        .send()
        .map_err(|err| err.to_string())
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|err| err.to_string())
}

fn manifest_version(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).map_err(|err| err.to_string())?;
    value
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "缺少 version 字段".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_version_reads_version_field() {
        let version = manifest_version(r#"{"version":"0.3.5","notes":"demo"}"#).unwrap();

        assert_eq!(version, "0.3.5");
    }

    #[test]
    fn manifest_version_rejects_missing_version() {
        let message = manifest_version(r#"{"notes":"demo"}"#).unwrap_err();

        assert!(message.contains("version"));
    }
}
