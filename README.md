# GitPulse

本地优先的 Git 工作报告生成器。应用使用 **Tauri + React + Rust** 构建，不依赖 Python 运行时，适合从本机多个 Git 仓库生成日报、提交摘要和绩效月报。

## 功能

- 扫描本机 workspace 下的 Git 仓库
- 按作者、日期范围、当前分支或所有分支提取 commit
- 支持项目名映射，例如 `api-service(*) -> 后端服务-`
- 一键生成上个月绩效月报
- 月报按项目拆分，并包含“项目进度 / 实际完成情况 / 当月总结”
- 可选 OpenAI-compatible 或 Anthropic Native AI 润色，API Key 只从环境变量读取
- 生成结果支持预览、复制和按需保存到本地

## 技术栈

```text
Tauri 2
React 19
Vite
Rust
```

旧版 Python/Tkinter 代码已保留在分支：

```bash
codex/legacy-python-desktop
```

## 开发

安装依赖：

```bash
npm install
```

启动桌面应用：

```bash
npm run tauri dev
```

仅启动前端：

```bash
npm run dev
```

构建安装包：

```bash
npm run tauri build
```

构建产物位于：

```text
src-tauri/target/release/bundle/
```

## AI 润色

应用不会保存真实 API Key。请先在系统环境变量中设置密钥，例如：

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:ANTHROPIC_API_KEY="sk-ant-..."
```

然后在界面中配置：

- 协议：`OpenAI Compatible` 或 `Anthropic Native`
- Base URL：例如 `https://api.openai.com/v1` 或 `https://api.anthropic.com/v1`
- 模型：对应协议支持的模型名
- Key 环境变量：例如 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`

如果 AI 调用失败，应用会自动回退到本地月报模板。

## 验证

```bash
npm run build
cd src-tauri
cargo check
cargo test
```

完整打包验证：

```bash
npm run tauri build
```
