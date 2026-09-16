# 每日待办

独立、纯本地的 Windows 待办应用，使用 Tauri 2、React/TypeScript 和 SQLite。
不依赖 Obsidian；不提供账号、登录、云存储或跨设备同步。

## 当前交付

本版本为可运行骨架，提供每日、项目、设置视图，日期切换，本地数据库初始化，
桌面连接状态和 Windows 构建流程。任务编辑、完成操作、自动顺延、周期生成和
设置修改不在本版本内；界面不会模拟这些操作已经保存成功。

## 开发

使用 Node.js 24 与 npm。Windows 桌面开发另需 Rust stable、MSVC C++ 构建工具、
Windows SDK 和 WebView2。先运行 `npm ci`。

- 浏览器预览：`npm run dev`，默认地址 `http://127.0.0.1:1420`。
- 桌面开发：`npm run tauri -- dev`。
- 单元测试：`npm test`。
- 类型与前端构建：`npm run build`。
- 浏览器检查：先运行 `npx playwright install chromium`，再运行 `npm run test:e2e`。
- 原生检查：`cargo test --manifest-path src-tauri/Cargo.toml --locked`。
- 安装包：`npm run tauri -- build --bundles nsis -- --locked`。

浏览器预览不连接 SQLite，也不保存任务；桌面窗口显示真实的本地数据连接状态。
不要同时启动两个占用 1420 端口的开发服务。仅做浏览器预览时可通过
`npm run dev -- --port 1421` 使用其他空闲端口；桌面开发须同时调整 Tauri devUrl。

## 数据与构建

数据库文件为操作系统每用户应用数据目录下的 `todo.sqlite`，不放入源码仓库。
启动失败不会自动删除或替换原数据库。初始应用标识为 `local.todo.desktop`。

GitHub Actions 的 Checks 工作流运行前端和原生检查。Windows Installer 工作流
需手动触发，产生未签名的 Windows x64 NSIS 安装包，仅作为工作流构件，不发布 Release。
安装包包含 WebView2 离线安装资源；安装包体积不能直接用于衡量应用本体大小。

架构见 `docs/architecture.md`，实际验证记录见 `docs/verification.md`。
