# GitPulse

本地优先的 Git 工作报告生成器。应用使用 **Tauri + React + Rust** 构建，不依赖 Python 运行时，适合从本机多个 Git 仓库生成日报、提交摘要和绩效月报。

## 功能

- 扫描本机 workspace 下的 Git 仓库
- 按作者、日期范围、当前分支或所有分支提取 commit
- 支持项目名映射，例如 `api-service(*) -> 后端服务-`
- 一键生成上个月绩效月报
- 月报按项目拆分，并包含“项目进度 / 实际完成情况 / 当月总结”
- 可选 OpenAI-compatible 或 Anthropic Native AI 润色，支持直接保存 API Key
- 生成结果支持预览、复制和按需保存到本地
- 支持 Windows x86_64 在线检查更新

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

发布在线更新包：

```bash
# Windows PowerShell
Copy-Item .release.env.example .release.env.local

# 自动升级 patch 版本、构建、签名、上传安装包并发布 latest.json
npm run release:win
```

常用版本与发布命令：

```bash
# 仅同步版本号到 package.json / package-lock.json / Tauri / Cargo
npm run version:patch
npm run version:minor
npm run version:major
npm run version:set -- 1.2.3

# 升级版本并本地打包，不上传
npm run build:patch
npm run build:minor
npm run build:major

# 升级版本并发布在线更新包
npm run release:win:patch
npm run release:win:minor
npm run release:win:major
npm run release:win:set -- 1.2.3

# 按当前版本重新构建并发布，适合重传安装包
npm run release:win:current

# 预览版本升级计划，不写文件、不构建、不上传
npm run release:win -- --dry-run
```

## AI 润色

在设置中开启 AI 润色后，直接填写以下内容即可：

- 协议：`OpenAI Compatible` 或 `Anthropic Native`
- Base URL：例如 `https://api.openai.com/v1` 或 `https://api.anthropic.com/v1`
- API Key：对应服务的密钥，默认隐藏显示，可点击按钮切换可见状态
- 模型：可手动填写，也可点击“获取模型”后从服务返回的模型列表中选择

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
