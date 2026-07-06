use crate::{
    codex_oauth,
    diagnostics::item,
    models::{DiagnosticItem, DiagnosticOptions, DiagnosticSeverity},
};
use std::env;

pub fn ai(options: &DiagnosticOptions) -> DiagnosticItem {
    if !options.ai_enabled {
        return item(
            "ai",
            "AI 润色",
            DiagnosticSeverity::Ok,
            "AI 润色未配置，本地报告模板可正常使用。",
            "",
        );
    }

    let mut issues = Vec::new();
    if options.ai_model.trim().is_empty() {
        issues.push("模型名未填写".to_string());
    }
    collect_provider_issues(options, &mut issues);

    if issues.is_empty() {
        item(
            "ai",
            "AI 润色",
            DiagnosticSeverity::Ok,
            ready_message(options),
            "",
        )
    } else {
        item(
            "ai",
            "AI 润色",
            DiagnosticSeverity::Error,
            issues.join("；"),
            "在「AI 润色」补齐配置，或直接使用本地模板生成。",
        )
    }
}

fn collect_provider_issues(options: &DiagnosticOptions, issues: &mut Vec<String>) {
    match options.ai_provider.as_str() {
        "codex-oauth" => {
            if !codex_oauth::status().authenticated {
                issues.push("ChatGPT 账号未登录".to_string());
            }
        }
        "openai-compatible" | "anthropic-native" => {
            if options.ai_base_url.trim().is_empty() {
                issues.push("Base URL 未填写".to_string());
            }
            if let Err(message) = validate_api_key_reference(&options.ai_api_key) {
                issues.push(message);
            }
        }
        other => issues.push(format!("未知 AI 协议：{other}")),
    }
}

fn ready_message(options: &DiagnosticOptions) -> String {
    if options.ai_provider != "codex-oauth" {
        return "当前 AI 润色配置已具备调用所需字段。".to_string();
    }
    let suffix = codex_oauth::status()
        .email
        .map(|email| format!("：{email}"))
        .unwrap_or_default();
    format!("ChatGPT Codex OAuth 已就绪{suffix}。")
}

fn validate_api_key_reference(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("API Key 未填写".to_string());
    }
    let Some(name) = env_reference_name(trimmed) else {
        return Ok(());
    };
    if name.is_empty() {
        return Err("API Key 环境变量引用缺少变量名".to_string());
    }
    if !looks_like_env_var_name(name) {
        return Err(format!("环境变量名格式不正确：{name}"));
    }
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(()),
        _ => Err(format!("环境变量 {name} 未设置或为空")),
    }
}

fn env_reference_name(value: &str) -> Option<&str> {
    if let Some(name) = value.strip_prefix("env:") {
        return Some(name.trim());
    }
    if looks_like_env_var_name(value) {
        return Some(value);
    }
    None
}

fn looks_like_env_var_name(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_warns_about_missing_ai_env_var() {
        env::remove_var("GITPULSE_DIAGNOSTIC_MISSING_KEY");

        let item = ai(&DiagnosticOptions {
            root_dirs: Vec::new(),
            output_dir: String::new(),
            output_enabled: false,
            author: String::new(),
            ai_enabled: true,
            ai_provider: "openai-compatible".to_string(),
            ai_base_url: "https://api.openai.com/v1".to_string(),
            ai_model: "gpt-4.1-mini".to_string(),
            ai_api_key: "env:GITPULSE_DIAGNOSTIC_MISSING_KEY".to_string(),
            indexed_repos: Vec::new(),
        });

        assert_eq!(item.severity, DiagnosticSeverity::Error);
        assert!(item.message.contains("GITPULSE_DIAGNOSTIC_MISSING_KEY"));
    }
}
