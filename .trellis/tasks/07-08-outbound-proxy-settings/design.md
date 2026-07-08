# 添加应用出站代理配置 - Design

## Architecture

新增一个 Rust `network` 模块，集中负责：

- 构建带超时和可选代理的 `reqwest::blocking::Client`。
- 校验代理 URL 协议。
- 保存/读取代理密码使用现有 `secure_store` 模式。
- 扫描本地常见代理端口并生成候选。
- 测试当前代理配置是否能访问外部端点。

前端保持现有设置模式：

- `src/model.ts` 增加 `ProxyMode`、`ProxySettings` 字段和默认值。
- `buildAiOptions` 将代理字段放入 `AiConfig`，供 AI 与 ChatGPT OAuth 使用。
- 诊断 payload 增加代理字段。
- 设置面板在 AI 页新增“应用出站代理”区块，保持现有暗色紧凑表单风格。

## Data Flow

### 保存

1. 用户在设置面板编辑代理 URL、用户名、密码。
2. URL、用户名、模式跟随普通设置进入 `localStorage`。
3. 密码输入后调用 Tauri command 保存到系统凭据库，并在普通设置中只记录 `proxyPasswordSaved`。

### 请求

1. 前端构造 `AiConfig` 或 `DiagnosticOptions` 时附带代理配置。
2. Rust command 反序列化为 `ProxyConfig`。
3. 网络模块通过 `Client::builder().proxy(...)` 设置代理。
4. AI、Codex OAuth、诊断模块复用该 client builder。

### 扫描与测试

1. 前端点击扫描按钮，调用 `scan_proxy_candidates`。
2. Rust 只尝试连接本机常见端口，返回可连通候选 URL 与标签。
3. 前端点击候选填入 `proxyUrl`。
4. 前端点击测试按钮，调用 `test_proxy_connection`，Rust 访问 GitHub API 或当前 AI Base URL，返回状态文本。

## Contracts

Rust models:

- `ProxyMode`: `"off" | "custom"`。
- `ProxyConfig`: `mode`, `url`, `username`, `password`, `passwordSaved`。
- `ProxyCandidate`: `url`, `label`。
- `ProxyTestResult`: `ok`, `message`, `latencyMs`。

Frontend mirrors camelCase fields in `src/model.ts`.

## Compatibility

- 默认 `mode = "off"`，旧设置无需迁移脚本。
- `ProxyConfig` 字段在 Rust payload 中使用 `#[serde(default)]`，避免旧前端或测试构造缺字段时报错。
- `socks5://` 支持需要为 `reqwest` 开启 `socks` feature。

## Security

- 代理密码按凭据处理，不放入普通设置。
- 候选扫描仅检查本机回环地址和少量常见端口，避免变成端口扫描器。
- 错误信息使用中文并避免回显密码。

## Trade-offs

- 不实现“跟随系统代理”：跨平台读取系统代理复杂且容易与 Tauri/updater 行为不一致；MVP 先提供明确可控的自定义代理。
- 候选扫描只检测端口连通，不验证端口背后一定是 HTTP/SOCKS 代理；连接测试会做真实请求兜底。
- Tauri updater 插件可能有独立网络栈，本次只覆盖 GitPulse 代码中直接发起的外部 HTTP 请求。
