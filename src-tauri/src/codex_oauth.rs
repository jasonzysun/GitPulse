//! ChatGPT (Codex OAuth) 登录与润色。
//!
//! 复用官方 Codex 的公开 client_id，走 OAuth Device Code 流程拿到 ChatGPT 订阅
//! 的 token，直接调用 `chatgpt.com/backend-api/codex` 的 responses 端点做润色。
//! 单账号、同步 blocking，契合 GitPulse 既有 AI 调用模型（spawn_blocking + reqwest::blocking）。
//!
//! ⚠️ 非官方路径：复用 codex client_id 并把请求伪装成 codex，可能违反 OpenAI ToS、
//! 账号可能被限、随时可能失效。仅作为可选 provider，登录态独立存储、可一键登出。

use crate::models::AiModelInfo;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

/// 公开 client_id（与官方 Codex CLI 相同）
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_USERCODE_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/token";
const OAUTH_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const VERIFICATION_URL: &str = "https://auth.openai.com/codex/device";
const DEVICE_REDIRECT_URI: &str = "https://auth.openai.com/deviceauth/callback";
const BACKEND_BASE: &str = "https://chatgpt.com/backend-api/codex";
const ORIGINATOR: &str = "gitpulse";
const USER_AGENT: &str = "gitpulse-codex-oauth";
/// access_token 提前刷新缓冲（毫秒）
const REFRESH_BUFFER_MS: i64 = 60_000;
const HTTP_TIMEOUT_SECS: u64 = 60;

// ── 持久化登录态 ─────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct StoredAuth {
    refresh_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    /// 缓存的 access_token（过期才刷新，避免每次润色都走刷新）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expires_at_ms: Option<i64>,
}

fn auth_file_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir().ok_or("无法定位配置目录")?.join("GitPulse");
    Ok(dir.join("codex_oauth.json"))
}

fn load_auth() -> Option<StoredAuth> {
    let path = auth_file_path().ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_auth(auth: &StoredAuth) -> Result<(), String> {
    let path = auth_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let content = serde_json::to_string_pretty(auth).map_err(|err| err.to_string())?;
    fs::write(&path, content).map_err(|err| err.to_string())
}

// ── 对前端的返回类型 ─────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowInfo {
    /// = device_auth_id，poll 时由前端原样回传
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    /// "pending" | "done"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

// ── 基础工具 ─────────────────────────────────────────────────

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|err| err.to_string())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn parse_json(resp: Response) -> Result<Value, String> {
    let status = resp.status();
    let value = resp.json::<Value>().map_err(|err| err.to_string())?;
    if status.is_success() {
        Ok(value)
    } else {
        Err(format!("请求失败 {status}：{value}"))
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let mut s: String = text.chars().take(max).collect();
        s.push_str("...");
        s
    }
}

// ── Device Code 登录流程 ─────────────────────────────────────

/// 启动设备码流程。device_code + user_code 一并返回前端，poll 时回传二者，
/// 后端无需缓存进行中的登录会话（无状态）。
pub fn start_device_flow() -> Result<DeviceFlowInfo, String> {
    let resp = client()?
        .post(DEVICE_USERCODE_URL)
        .header("User-Agent", USER_AGENT)
        .json(&json!({ "client_id": CLIENT_ID }))
        .send()
        .map_err(|err| err.to_string())?;
    let value = parse_json(resp)?;

    let device_code = value["device_auth_id"]
        .as_str()
        .ok_or("响应缺少 device_auth_id")?
        .to_string();
    let user_code = value["user_code"]
        .as_str()
        .ok_or("响应缺少 user_code")?
        .to_string();
    let interval = value["interval"].as_u64().unwrap_or(5).max(1) + 3;
    let expires_in = value["expires_in"].as_u64().unwrap_or(900);

    Ok(DeviceFlowInfo {
        device_code,
        user_code,
        verification_uri: VERIFICATION_URL.to_string(),
        interval,
        expires_in,
    })
}

/// 轮询一次设备码授权状态。未授权返回 pending；授权成功则换 token、写入登录态。
pub fn poll_once(device_code: &str, user_code: &str) -> Result<PollResult, String> {
    let resp = client()?
        .post(DEVICE_TOKEN_URL)
        .header("User-Agent", USER_AGENT)
        .json(&json!({ "device_auth_id": device_code, "user_code": user_code }))
        .send()
        .map_err(|err| err.to_string())?;

    let status = resp.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::NOT_FOUND {
        return Ok(PollResult {
            status: "pending".to_string(),
            email: None,
        });
    }
    if status == reqwest::StatusCode::GONE {
        return Err("设备码已过期，请重新登录".to_string());
    }
    if !status.is_success() {
        let body = resp.text().unwrap_or_default();
        return Err(format!("登录轮询失败 {status}：{}", truncate(&body, 200)));
    }

    let value: Value = resp.json().map_err(|err| err.to_string())?;
    let auth_code = value["authorization_code"]
        .as_str()
        .ok_or("响应缺少 authorization_code")?;
    let verifier = value["code_verifier"]
        .as_str()
        .ok_or("响应缺少 code_verifier")?;

    let tokens = exchange_code(auth_code, verifier)?;
    let refresh_token = tokens
        .refresh_token
        .clone()
        .ok_or("响应缺少 refresh_token")?;
    let (account_id, email) = identity_from_tokens(&tokens);

    let stored = StoredAuth {
        refresh_token,
        account_id,
        email: email.clone(),
        access_token: Some(tokens.access_token.clone()),
        expires_at_ms: Some(now_ms() + tokens.expires_in.unwrap_or(3600) * 1000),
    };
    save_auth(&stored)?;

    Ok(PollResult {
        status: "done".to_string(),
        email,
    })
}

#[derive(Debug, Clone, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

fn exchange_code(code: &str, verifier: &str) -> Result<TokenResponse, String> {
    let resp = client()?
        .post(OAUTH_TOKEN_URL)
        .header("User-Agent", USER_AGENT)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", DEVICE_REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("code_verifier", verifier),
        ])
        .send()
        .map_err(|err| err.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        return Err(format!("Token 交换失败 {status}：{}", truncate(&body, 200)));
    }
    resp.json().map_err(|err| err.to_string())
}

fn refresh(refresh_token: &str) -> Result<TokenResponse, String> {
    let resp = client()?
        .post(OAUTH_TOKEN_URL)
        .header("User-Agent", USER_AGENT)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
            ("scope", "openid profile email"),
        ])
        .send()
        .map_err(|err| err.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("刷新登录失败 {status}，请重新登录 ChatGPT"));
    }
    resp.json().map_err(|err| err.to_string())
}

/// 取有效 access_token（必要时用 refresh_token 刷新并回写文件）。
fn valid_access_token() -> Result<(String, Option<String>), String> {
    let mut stored = load_auth().ok_or("尚未登录 ChatGPT")?;

    if let (Some(token), Some(expires_at)) = (&stored.access_token, stored.expires_at_ms) {
        if expires_at - now_ms() > REFRESH_BUFFER_MS {
            return Ok((token.clone(), stored.account_id.clone()));
        }
    }

    let refreshed = refresh(&stored.refresh_token)?;
    if let Some(new_refresh) = refreshed.refresh_token.clone() {
        stored.refresh_token = new_refresh;
    }
    stored.access_token = Some(refreshed.access_token.clone());
    stored.expires_at_ms = Some(now_ms() + refreshed.expires_in.unwrap_or(3600) * 1000);
    save_auth(&stored)?;

    Ok((refreshed.access_token, stored.account_id))
}

// ── 登录状态 / 登出 ──────────────────────────────────────────

pub fn status() -> AuthStatus {
    match load_auth() {
        Some(auth) if !auth.refresh_token.is_empty() => AuthStatus {
            authenticated: true,
            email: auth.email,
        },
        _ => AuthStatus {
            authenticated: false,
            email: None,
        },
    }
}

pub fn logout() -> Result<(), String> {
    if let Ok(path) = auth_file_path() {
        if path.exists() {
            fs::remove_file(path).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

// ── 模型列表 ─────────────────────────────────────────────────

pub fn list_models() -> Result<Vec<AiModelInfo>, String> {
    let (token, account_id) = valid_access_token()?;
    let mut request = client()?
        .get(format!("{BACKEND_BASE}/models"))
        .header("Authorization", format!("Bearer {token}"))
        .header("originator", ORIGINATOR)
        .header("Accept", "application/json");
    if let Some(id) = &account_id {
        request = request.header("chatgpt-account-id", id);
    }
    let value = parse_json(request.send().map_err(|err| err.to_string())?)?;
    let models = parse_models(value);
    if models.is_empty() {
        return Err("ChatGPT 未返回可用模型".to_string());
    }
    Ok(models)
}

fn parse_models(value: Value) -> Vec<AiModelInfo> {
    let mut ids: Vec<String> = Vec::new();

    let array = value
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| value.get("models").and_then(Value::as_array));
    if let Some(entries) = array {
        for entry in entries {
            if let Some(id) = entry.as_str() {
                ids.push(id.to_string());
            } else if let Some(obj) = entry.as_object() {
                for key in ["slug", "id", "model", "name"] {
                    if let Some(id) = obj.get(key).and_then(Value::as_str) {
                        ids.push(id.to_string());
                        break;
                    }
                }
            }
        }
    }

    if let Some(map) = value.get("models").and_then(Value::as_object) {
        for key in map.keys() {
            ids.push(key.clone());
        }
    }

    ids.sort();
    ids.dedup();
    ids.into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .map(|id| AiModelInfo { id })
        .collect()
}

// ── 润色：POST /responses ────────────────────────────────────

pub fn enhance(system_prompt: &str, user_prompt: &str, model: &str) -> Result<String, String> {
    if model.trim().is_empty() {
        return Err("未配置 AI 模型名".to_string());
    }
    let (token, account_id) = valid_access_token()?;

    let payload = json!({
        "model": model,
        "instructions": system_prompt,
        "input": user_prompt,
        "stream": false,
    });

    let mut request = client()?
        .post(format!("{BACKEND_BASE}/responses"))
        .header("Authorization", format!("Bearer {token}"))
        .header("originator", ORIGINATOR)
        .header("Accept", "application/json")
        .json(&payload);
    if let Some(id) = &account_id {
        request = request.header("chatgpt-account-id", id);
    }

    let resp = request.send().map_err(|err| err.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(format!("ChatGPT 润色失败 {status}：{}", truncate(&text, 300)));
    }
    extract_response_text(&text)
}

/// 解析 responses 响应：先按非流式 JSON，再回退按 SSE。
fn extract_response_text(text: &str) -> Result<String, String> {
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        if let Some(content) = output_text_from_json(&value) {
            if !content.trim().is_empty() {
                return Ok(content.trim().to_string());
            }
        }
    }
    if let Some(content) = output_text_from_sse(text) {
        if !content.trim().is_empty() {
            return Ok(content.trim().to_string());
        }
    }
    Err("AI 服务返回空内容或无法解析".to_string())
}

/// 从非流式 responses JSON 中提取文本。
fn output_text_from_json(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    let output = value.get("output").and_then(Value::as_array)?;
    let mut buffer = String::new();
    for item in output {
        if let Some(content) = item.get("content").and_then(Value::as_array) {
            for block in content {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    buffer.push_str(text);
                }
            }
        }
    }
    if buffer.is_empty() {
        None
    } else {
        Some(buffer)
    }
}

/// 从 SSE 流文本中提取文本：优先取 response.completed 的完整 output，
/// 否则拼接所有 output_text.delta。
fn output_text_from_sse(text: &str) -> Option<String> {
    let mut delta_buffer = String::new();
    let mut completed: Option<String> = None;

    for line in text.lines() {
        let Some(data) = line.trim().strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        let event = value.get("type").and_then(Value::as_str).unwrap_or("");
        if event.ends_with("output_text.delta") {
            if let Some(delta) = value.get("delta").and_then(Value::as_str) {
                delta_buffer.push_str(delta);
            }
        } else if event.ends_with("response.completed") {
            if let Some(response) = value.get("response") {
                completed = output_text_from_json(response);
            }
        }
    }

    completed
        .filter(|s| !s.is_empty())
        .or(if delta_buffer.is_empty() {
            None
        } else {
            Some(delta_buffer)
        })
}

// ── JWT 身份解析 ─────────────────────────────────────────────

fn parse_jwt_claims(token: &str) -> Option<Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let decoded = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    serde_json::from_slice(&decoded).ok()
}

/// 从 id_token / access_token 中提取 (chatgpt_account_id, email)。
fn identity_from_tokens(tokens: &TokenResponse) -> (Option<String>, Option<String>) {
    let mut account_id: Option<String> = None;
    let mut email: Option<String> = None;

    let candidates = [tokens.id_token.as_deref(), Some(tokens.access_token.as_str())];
    for token in candidates.into_iter().flatten() {
        let Some(claims) = parse_jwt_claims(token) else {
            continue;
        };
        if account_id.is_none() {
            account_id = claims
                .get("chatgpt_account_id")
                .and_then(Value::as_str)
                .map(String::from)
                .or_else(|| {
                    claims
                        .get("https://api.openai.com/auth")
                        .and_then(|auth| auth.get("chatgpt_account_id"))
                        .and_then(Value::as_str)
                        .map(String::from)
                })
                .or_else(|| {
                    claims
                        .get("organizations")
                        .and_then(Value::as_array)
                        .and_then(|orgs| orgs.first())
                        .and_then(|org| org.get("id"))
                        .and_then(Value::as_str)
                        .map(String::from)
                });
        }
        if email.is_none() {
            email = claims.get("email").and_then(Value::as_str).map(String::from);
        }
        if account_id.is_some() && email.is_some() {
            break;
        }
    }

    (account_id, email)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_models_reads_openai_data_shape() {
        let models = parse_models(json!({
            "data": [ { "id": "gpt-5-codex" }, { "id": "gpt-5" } ]
        }));
        assert_eq!(
            models.into_iter().map(|m| m.id).collect::<Vec<_>>(),
            vec!["gpt-5".to_string(), "gpt-5-codex".to_string()]
        );
    }

    #[test]
    fn parse_models_reads_slug_and_dedups() {
        let models = parse_models(json!({
            "models": [ { "slug": "gpt-5-codex" }, "gpt-5-codex", "gpt-5" ]
        }));
        assert_eq!(
            models.into_iter().map(|m| m.id).collect::<Vec<_>>(),
            vec!["gpt-5".to_string(), "gpt-5-codex".to_string()]
        );
    }

    #[test]
    fn output_text_from_json_reads_output_blocks() {
        let value = json!({
            "output": [
                { "content": [ { "type": "output_text", "text": "hello " } ] },
                { "content": [ { "type": "output_text", "text": "world" } ] }
            ]
        });
        assert_eq!(output_text_from_json(&value).as_deref(), Some("hello world"));
    }

    #[test]
    fn output_text_from_json_prefers_output_text_field() {
        let value = json!({ "output_text": "done" });
        assert_eq!(output_text_from_json(&value).as_deref(), Some("done"));
    }

    #[test]
    fn output_text_from_sse_collects_deltas() {
        let sse = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"foo\"}\n\
                   data: {\"type\":\"response.output_text.delta\",\"delta\":\"bar\"}\n\
                   data: [DONE]\n";
        assert_eq!(output_text_from_sse(sse).as_deref(), Some("foobar"));
    }

    #[test]
    fn output_text_from_sse_prefers_completed() {
        let sse = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\
                   data: {\"type\":\"response.completed\",\"response\":{\"output_text\":\"final\"}}\n";
        assert_eq!(output_text_from_sse(sse).as_deref(), Some("final"));
    }

    #[test]
    fn parse_jwt_claims_extracts_account_id() {
        let header = URL_SAFE_NO_PAD.encode(b"{\"alg\":\"none\"}");
        let payload = URL_SAFE_NO_PAD
            .encode(b"{\"chatgpt_account_id\":\"acc-1\",\"email\":\"u@example.com\"}");
        let jwt = format!("{header}.{payload}.");
        let tokens = TokenResponse {
            access_token: jwt,
            refresh_token: None,
            id_token: None,
            expires_in: None,
        };
        let (account_id, email) = identity_from_tokens(&tokens);
        assert_eq!(account_id.as_deref(), Some("acc-1"));
        assert_eq!(email.as_deref(), Some("u@example.com"));
    }

    #[test]
    fn truncate_limits_length() {
        assert_eq!(truncate("abc", 5), "abc");
        assert_eq!(truncate("abcdef", 3), "abc...");
    }
}
