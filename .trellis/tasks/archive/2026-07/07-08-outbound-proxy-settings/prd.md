# 添加应用出站代理配置

## Goal

为 GitPulse 设置面板增加应用级出站代理配置，帮助国内网络环境下的用户更稳定地访问国外 AI 服务、ChatGPT OAuth、模型列表和网络诊断目标。

该功能只影响 GitPulse 自己发起的外部 HTTP 请求，不修改系统代理，不影响本地 Git 扫描、报告生成和文件导出。

## Confirmed Facts

- GitPulse 是 Tauri + React + Rust 桌面应用，网络请求主要在 Rust `reqwest` blocking client 中发起。
- 现有外部网络面包括 AI 润色、模型列表、ChatGPT Codex OAuth、GitHub/更新清单诊断。
- 设置当前保存在 `localStorage`，AI API Key 已通过系统凭据库保存；不能把代理密码明文持久化到普通设置。
- `src/model.ts` 是前端设置、默认值、校验和 Tauri payload builder 的集中位置；`src-tauri/src/models.rs` 是 Rust command payload 的集中位置。

## Requirements

- 新增应用出站代理设置：
  - 支持关闭代理、使用自定义代理。
  - 自定义代理 URL 支持 `http://`、`https://`、`socks5://`。
  - 代理用户名、密码可选。
  - 代理密码不得明文写入 `localStorage`。
- 所有 GitPulse 自己发起的外部 HTTP 请求应能使用该代理：
  - AI 模型列表。
  - AI 润色。
  - ChatGPT Codex OAuth 登录、轮询、刷新和请求。
  - 网络诊断中的 GitHub 与更新清单请求。
- 设置面板中提供代理配置 UI：
  - 放在 AI/网络相关设置区，文案明确是“应用出站代理”而非系统代理。
  - 提供扫描本地代理候选的小图标按钮。
  - 候选扫描只读取本机常见端口并生成建议，不自动启用。
  - 提供连接测试按钮，返回成功/失败与可读原因。
- 扫描本地代理候选：
  - 检测常见本地代理端口，例如 7890、7897、7899、1080、10808、20170。
  - 只探测 `127.0.0.1` / `localhost` 本地端口。
  - 不扫描远程网段，不做高频端口扫描。
- 兼容已有用户设置：
  - 旧设置加载后默认代理关闭。
  - 未开启代理时现有行为保持不变。

## Acceptance Criteria

- [x] 旧用户打开应用后代理默认关闭，AI 与诊断原有直连行为不变。
- [x] 用户可在设置中填写 `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:7890` 并保存。
- [x] 代理密码如果填写，会进入系统凭据库；普通设置持久化中不包含明文密码。
- [x] 点击扫描按钮能列出可连接的本地代理候选，选择候选后填入代理 URL。
- [x] 点击测试连接能返回代理配置是否可用于外部请求的结果。
- [x] AI 模型列表、AI 润色和 ChatGPT OAuth 请求通过同一套代理 client 构建逻辑。
- [x] 诊断网络检查使用代理配置并在失败信息中保留可读错误。
- [x] `npm run build`、`cd src-tauri && cargo check`、`cd src-tauri && cargo test` 完成或如实记录无法执行原因。

## Out of Scope

- 不修改操作系统级代理。
- 不承诺 Tauri updater 插件内部下载一定走该自定义代理。
- 不做远程端口扫描、PAC 自动解析或系统代理自动读取。
- 不新增依赖于外部代理软件的专有集成。
