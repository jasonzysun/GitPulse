use crate::{
    models::{ProxyCandidate, ProxyConfig, ProxyTestResult},
    secure_store,
};
use reqwest::blocking::Client;
use std::{
    net::{SocketAddr, TcpStream},
    time::{Duration, Instant},
};

const LOCAL_PROXY_PORTS: [u16; 8] = [7890, 7897, 7899, 1080, 10808, 20170, 6152, 8080];
const TEST_URL: &str = "https://api.github.com/repos/GoldenZqqq/GitPulse";
const USER_AGENT: &str = "GitPulse network test";

pub fn client(timeout: Duration, proxy: &ProxyConfig) -> Result<Client, String> {
    let mut builder = Client::builder().timeout(timeout);
    if let Some(proxy) = build_proxy(proxy)? {
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|err| err.to_string())
}

pub fn scan_proxy_candidates() -> Vec<ProxyCandidate> {
    let mut candidates = Vec::new();
    for port in LOCAL_PROXY_PORTS {
        if !is_local_port_open(port) {
            continue;
        }
        candidates.push(ProxyCandidate {
            url: format!("http://127.0.0.1:{port}"),
            label: format!("本机 HTTP 代理 · 127.0.0.1:{port}"),
        });
        candidates.push(ProxyCandidate {
            url: format!("socks5://127.0.0.1:{port}"),
            label: format!("本机 SOCKS5 代理 · 127.0.0.1:{port}"),
        });
    }
    candidates
}

pub fn test_proxy_connection(config: &ProxyConfig) -> Result<ProxyTestResult, String> {
    if config.mode == "custom" && config.url.trim().is_empty() {
        return Err("请先填写代理地址".to_string());
    }
    let start = Instant::now();
    let response = client(Duration::from_secs(10), config)?
        .get(TEST_URL)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/json")
        .send()
        .map_err(|err| format!("连接测试失败：{err}"))?;
    let latency_ms = start.elapsed().as_millis();
    if response.status().is_success() {
        return Ok(ProxyTestResult {
            ok: true,
            message: format!("连接成功，耗时 {latency_ms} ms"),
            latency_ms,
        });
    }
    Ok(ProxyTestResult {
        ok: false,
        message: format!("已连接但返回 HTTP {}", response.status()),
        latency_ms,
    })
}

fn build_proxy(config: &ProxyConfig) -> Result<Option<reqwest::Proxy>, String> {
    if config.mode != "custom" {
        return Ok(None);
    }
    let url = config.url.trim();
    if url.is_empty() {
        return Ok(None);
    }
    validate_proxy_url(url)?;
    let mut proxy = reqwest::Proxy::all(url).map_err(|err| format!("代理地址无效：{err}"))?;
    let username = config.username.trim();
    if !username.is_empty() {
        let password = resolve_proxy_password(config)?;
        proxy = proxy.basic_auth(username, &password);
    }
    Ok(Some(proxy))
}

fn resolve_proxy_password(config: &ProxyConfig) -> Result<String, String> {
    let password = config.password.trim();
    if !password.is_empty() {
        return Ok(password.to_string());
    }
    if config.password_saved {
        return secure_store::get_proxy_password()?.ok_or_else(|| {
            "代理密码已标记为保存，但系统凭据库中没有找到该密码，请重新填写。".to_string()
        });
    }
    Ok(String::new())
}

fn validate_proxy_url(url: &str) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("socks5://")
    {
        return Ok(());
    }
    Err("代理地址仅支持 http://、https:// 或 socks5://".to_string())
}

fn is_local_port_open(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(180)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_proxy_url_accepts_supported_schemes() {
        assert!(validate_proxy_url("http://127.0.0.1:7890").is_ok());
        assert!(validate_proxy_url("https://proxy.example.com:443").is_ok());
        assert!(validate_proxy_url("socks5://127.0.0.1:7890").is_ok());
    }

    #[test]
    fn validate_proxy_url_rejects_unsupported_schemes() {
        let message = validate_proxy_url("ftp://127.0.0.1:7890").unwrap_err();

        assert!(message.contains("http://"));
    }
}
