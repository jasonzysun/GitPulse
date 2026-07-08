const AI_API_KEY_ACCOUNT: &str = "ai-api-key";
const CODEX_OAUTH_ACCOUNT: &str = "codex-oauth";
const PROXY_PASSWORD_ACCOUNT: &str = "outbound-proxy-password";
const SERVICE: &str = "com.goldenzqqq.gitpulse";

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn get_ai_api_key() -> Result<Option<String>, String> {
    get_credential(AI_API_KEY_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn set_ai_api_key(api_key: &str) -> Result<(), String> {
    set_credential(AI_API_KEY_ACCOUNT, api_key)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn clear_ai_api_key() -> Result<(), String> {
    clear_credential(AI_API_KEY_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn get_codex_oauth_auth() -> Result<Option<String>, String> {
    get_credential(CODEX_OAUTH_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn set_codex_oauth_auth(auth_json: &str) -> Result<(), String> {
    set_credential(CODEX_OAUTH_ACCOUNT, auth_json)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn clear_codex_oauth_auth() -> Result<(), String> {
    clear_credential(CODEX_OAUTH_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn get_proxy_password() -> Result<Option<String>, String> {
    get_credential(PROXY_PASSWORD_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn set_proxy_password(password: &str) -> Result<(), String> {
    set_credential(PROXY_PASSWORD_ACCOUNT, password)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn clear_proxy_password() -> Result<(), String> {
    clear_credential(PROXY_PASSWORD_ACCOUNT)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn get_credential(account: &str) -> Result<Option<String>, String> {
    use keyring::{Entry, Error};

    let entry = Entry::new(SERVICE, account).map_err(format_keyring_error)?;
    match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(err) => Err(format_keyring_error(err)),
    }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn set_credential(account: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, account).map_err(format_keyring_error)?;
    entry.set_password(value).map_err(format_keyring_error)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn clear_credential(account: &str) -> Result<(), String> {
    use keyring::{Entry, Error};

    let entry = Entry::new(SERVICE, account).map_err(format_keyring_error)?;
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(err) => Err(format_keyring_error(err)),
    }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn format_keyring_error(error: keyring::Error) -> String {
    format!("系统凭据库不可用：{error}")
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn get_ai_api_key() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn set_ai_api_key(_api_key: &str) -> Result<(), String> {
    Err("当前平台暂不支持系统凭据库保存 API Key".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn clear_ai_api_key() -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn get_codex_oauth_auth() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn set_codex_oauth_auth(_auth_json: &str) -> Result<(), String> {
    Err("当前平台暂不支持系统凭据库保存 ChatGPT 登录态".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn clear_codex_oauth_auth() -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn get_proxy_password() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn set_proxy_password(_password: &str) -> Result<(), String> {
    Err("当前平台暂不支持系统凭据库保存代理密码".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn clear_proxy_password() -> Result<(), String> {
    Ok(())
}
