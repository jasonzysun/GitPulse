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
# 如果同时开启 GITPULSE_GITHUB_RELEASE_ENABLED=true，还会自动推送 tag 并发布 GitHub Release
npm run release:win
```

生成 release notes 草稿：

```bash
# 根据上一个 tag..HEAD 的提交生成下个 patch 版本的说明草稿
npm run release:notes

# 或者为指定版本生成草稿
npm run release:notes:set -- 0.1.1

# 如果默认对比范围过大，可以手动指定起始 tag / ref
node ./scripts/generate-release-notes.mjs patch --from-tag 82d4287
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

如果你希望每次发版时自动同步 GitHub Release，请继续补充 `.release.env.local`：

```bash
GITPULSE_GITHUB_RELEASE_ENABLED=true
GITPULSE_GITHUB_TOKEN=github_pat_xxx
# 可选，不填时默认从 git remote origin 自动推断
GITPULSE_GITHUB_REPO=GoldenZqqq/GitPulse
# 可选，优先使用本地 markdown 文件作为 GitHub Release 正文
GITPULSE_RELEASE_NOTES_FILE=release-notes/v0.1.1.md
```

开启后，`npm run release:win*` 会额外执行这些步骤：

- 要求当前 Git 工作区先保持干净，避免源码 tag 与安装包不一致
- 自动提交版本号同步产生的改动，提交信息为 `chore: 发布 vX.Y.Z`
- 自动创建并推送 `vX.Y.Z` tag
- 自动创建或更新对应的 GitHub Release
- 自动上传 `.exe`、`.exe.sig` 与 `gitpulse-latest.json` 到该 release

建议给 Token 配置 GitHub `Contents: Read and write` 权限即可。
如果 `release-notes/vX.Y.Z.md` 存在，发布脚本会优先读取这个文件作为 release 正文；否则才回退到 `GITPULSE_RELEASE_NOTES` 或默认模板。

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
