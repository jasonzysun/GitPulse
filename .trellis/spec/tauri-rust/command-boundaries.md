# Command Boundaries

> How Rust modules and Tauri commands are divided.

## Module Ownership

- `src-tauri/src/lib.rs`: command registration and thin async wrappers; use `spawn_blocking` for blocking local work.
- `src-tauri/src/models.rs`: serde request/response models shared with the frontend; use camelCase serde names.
- `src-tauri/src/git_ops.rs`: Git command execution, repository discovery, author filtering, branch attribution, and scan progress.
- `src-tauri/src/commit_pipeline.rs`: local report orchestration, commit collection, progress aggregation, AI fallback, and save decisions.
- `src-tauri/src/report.rs`: report text rendering and document/file output.
- `src-tauri/src/network.rs`: shared outbound HTTP client construction, app-level proxy support, proxy candidate scan, and proxy connection tests.
- `src-tauri/src/ai.rs` and `codex_oauth.rs`: optional polishing/model integration.
- `src-tauri/src/secure_store.rs`: OS-backed credential storage for secrets and login state.

## Boundary Rules

- React invokes named Tauri commands; it does not run Git or filesystem logic directly.
- `lib.rs` should not accumulate business logic. Add or extend a domain module, then expose a small command wrapper.
- Long-running Git/report tasks should use progress callbacks bridged to Tauri events.
- A single invalid repository root should not break a whole scan when skipping is reasonable.
- AI polishing failure should become a warning and preserve the local report draft/template.

## Payload Rules

- Rust structs exposed to the frontend use `#[serde(rename_all = "camelCase")]`.
- When adding a field, update Rust model defaults/serde behavior and frontend builders in `src/model.ts`.
- Keep option names tied to product language: report period, author scope, project name mapping, evidence detail, export format.

## Scenario: App-Level Outbound Proxy

### 1. Scope / Trigger

- Trigger: any GitPulse-owned outbound HTTP request that may need to reach external APIs, including AI providers, ChatGPT Codex OAuth, model listing, GitHub diagnostics, or future network diagnostics.
- The proxy is application-level only: it must not modify OS proxy settings, local Git scanning, local filesystem work, or Tauri updater internals.

### 2. Signatures

- `network::client(timeout: Duration, proxy: &ProxyConfig) -> Result<reqwest::blocking::Client, String>`
- Tauri commands:
  - `scan_proxy_candidates() -> Result<Vec<ProxyCandidate>, String>`
  - `test_proxy_connection(config: ProxyConfig) -> Result<ProxyTestResult, String>`
  - `get_secure_proxy_password() -> Result<Option<String>, String>`
  - `set_secure_proxy_password(password: String) -> Result<(), String>`
  - `clear_secure_proxy_password() -> Result<(), String>`

### 3. Contracts

- `ProxyConfig` uses camelCase over IPC:
  - `mode`: `"off" | "custom"`
  - `url`: proxy URL, currently `http://`, `https://`, or `socks5://`
  - `username`: optional proxy username
  - `password`: optional in-memory proxy password
  - `passwordSaved`: whether Rust may load the password from OS secure storage when `password` is empty
- `ProxyCandidate` response fields:
  - `url`: candidate proxy URL
  - `label`: Chinese UI label
- `ProxyTestResult` response fields:
  - `ok`: whether the test endpoint returned success
  - `message`: Chinese status/error detail
  - `latencyMs`: elapsed milliseconds

### 4. Validation & Error Matrix

- `mode != "custom"` -> no proxy is attached.
- `mode == "custom"` with empty `url` during normal requests -> no proxy is attached; connection test should return `请先填写代理地址`.
- Unsupported URL scheme -> return `代理地址仅支持 http://、https:// 或 socks5://`.
- `username` present, `password` empty, `passwordSaved == true`, secure store missing -> return a Chinese error asking the user to re-enter the proxy password.
- Network request failure -> return the underlying request error wrapped in a Chinese context at the call site when possible.

### 5. Good/Base/Bad Cases

- Good: AI/model/OAuth/diagnostic calls build their `reqwest` client through `network::client(timeout, &proxy)`.
- Base: proxy mode `off` preserves direct connection behavior.
- Bad: a module calls `Client::builder().build()` directly for an external API and silently bypasses the app proxy.

### 6. Tests Required

- Unit tests for accepted and rejected proxy URL schemes.
- Existing AI, diagnostics, and report tests must construct `ProxyConfig::default()` when they instantiate `AiConfig` or `DiagnosticOptions`.
- Frontend `npm run build` must pass to prove `src/model.ts` proxy payload mirrors `models.rs`.
- Rust `cargo check` and `cargo test` must pass after adding or changing proxy-aware network calls.

### 7. Wrong vs Correct

#### Wrong

```rust
let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(30))
    .build()?;
```

#### Correct

```rust
let client = crate::network::client(Duration::from_secs(30), &config.proxy)?;
```
