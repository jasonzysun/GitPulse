# 添加启动自动更新提醒

## Goal

应用启动后自动检查一次在线更新，并在发现新版本时用主界面提示提醒用户，减少用户必须进入设置页手动检查更新的成本。

## Background

- GitPulse 已经接入 Tauri updater：
  - 前端依赖 `@tauri-apps/plugin-updater`，见 `package.json`。
  - Rust 依赖并注册 `tauri-plugin-updater`，见 `src-tauri/Cargo.toml` 与 `src-tauri/src/lib.rs`。
  - 更新端点与 pubkey 已配置在 `src-tauri/tauri.conf.json`。
- 当前更新能力已经存在于 `src/hooks/useAppRuntime.ts`：
  - `checkForUpdates()` 调用 `check({ timeout: 20000 })`。
  - 发现更新后写入 `updateSummary` 与 `updateMessage`。
  - `installUpdate()` 使用 `pendingUpdate.downloadAndInstall()` 下载并安装。
- 设置页已经展示更新状态和安装按钮：
  - `src/components/SettingsDialog.tsx` 传入更新状态与操作。
  - `src/components/UpdateSection.tsx` 展示当前版本、新版本、更新说明、检查更新、下载并安装。
- 主界面已有全局轻提示：
  - `src/App.tsx` 的 `showMessage()` 与 `AppMessageHost` 可展示 info/success/warning/error/loading。
  - `src/components/AppMessageHost.tsx` 支持用户手动关闭提示。
- 项目规范要求：
  - Tauri/runtime 相关副作用优先保留在 `useAppRuntime`，见 `.trellis/spec/frontend/hook-guidelines.md`。
  - 子组件负责展示状态和发出意图，业务决策保留在 `App.tsx`/hooks，见 `.trellis/spec/frontend/component-guidelines.md`。
  - 不应为 updater 新增无必要 Rust 命令或改变 Tauri updater internals，见 `.trellis/spec/tauri-rust/command-boundaries.md`。

## Requirements

- R1: 桌面应用启动后自动执行一次更新检查。
- R2: 自动检查必须复用现有 Tauri updater 前端链路，保留设置页手动检查和下载安装能力。
- R3: 自动检查发现新版本时，主界面应出现可见提醒，文案包含新版本号。
- R4: 自动检查未发现新版本时，不应打扰用户；设置页仍可显示当前版本/最新状态。
- R5: 自动检查失败时默认不弹出全局错误提示，避免网络波动或浏览器预览环境在启动时制造噪音；设置页手动检查失败仍按现有逻辑展示错误。
- R6: 自动检查不能在 React 严格模式或重渲染中重复触发多次。
- R7: 浏览器预览或 updater 不可用环境应优雅降级，不影响应用启动、主题初始化和其他本地功能。
- R8: 发现新版本时的主界面提醒只做轻提示，不新增“打开设置”或“下载并安装”操作入口；下载安装继续由设置页承载。

## Acceptance Criteria

- [ ] 启动桌面打包版后，应用自动调用 updater 检查一次更新。
- [ ] 当 updater 返回新版本时，`updateSummary` 被填充，设置页显示可安装版本，主界面出现一次“发现新版本 vX.Y.Z，可在设置中下载并安装”类轻提示。
- [ ] 当 updater 返回无更新时，主界面不出现 toast；设置页仍能表达当前已是最新版本。
- [ ] 当自动检查失败时，主界面不出现启动错误 toast；用户仍可在设置页点击“检查更新”看到错误或结果。
- [ ] 手动点击“检查更新”和“下载并安装”的现有流程不退化。
- [ ] `npm run build` 通过。

## Out of Scope

- 不新增更新偏好开关、忽略某版本、更新频率设置或后台轮询。
- 不改发布脚本、版本号、updater endpoint、签名 pubkey 或 release artifact 生成逻辑。
- 不新增 Rust Tauri command；本任务只复用 Tauri updater 插件的前端 API。
- 不处理应用代理对 Tauri updater 的影响；现有规范明确应用级代理不修改 updater internals。

## Technical Notes

- 预计主要改动在 `src/hooks/useAppRuntime.ts` 与 `src/App.tsx`。
- 可考虑让 `useAppRuntime` 暴露“自动检查发现更新”的一次性信号，`App.tsx` 负责通过现有 `showMessage()` 呈现主界面提醒。
- 自动检查与手动检查需要区分通知策略：自动检查静默处理“无更新/失败”，手动检查继续更新 `updateMessage` 供设置页展示。
- 用户已确认：发现新版本后的主界面提醒采用轻提示，不直接提供操作入口。
