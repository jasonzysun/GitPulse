const AI_API_KEY_ACCOUNT: &str = "ai-api-key";
const SERVICE: &str = "com.goldenzqqq.gitpulse";

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn get_ai_api_key() -> Result<Option<String>, String> {
    use keyring::{Entry, Error};

    let entry = Entry::new(SERVICE, AI_API_KEY_ACCOUNT).map_err(format_keyring_error)?;
    match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(err) => Err(format_keyring_error(err)),
    }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn set_ai_api_key(api_key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, AI_API_KEY_ACCOUNT).map_err(format_keyring_error)?;
    entry.set_password(api_key).map_err(format_keyring_error)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn clear_ai_api_key() -> Result<(), String> {
    use keyring::{Entry, Error};

    let entry = Entry::new(SERVICE, AI_API_KEY_ACCOUNT).map_err(format_keyring_error)?;
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
