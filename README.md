# 每日待办

独立、纯本地的 Windows 待办应用，使用 Tauri 2、React/TypeScript 和 SQLite。
不依赖 Obsidian；不提供账号、登录、云存储或跨设备同步。

## 当前交付

0.2.0 提供每日待办、项目、任务编辑与完成、一级子任务、优先级、截止与安排日期、
跨日顺延、每日/工作日/每周/每月重复任务，以及持久化的界面密度设置。
每日和项目列表共用任务状态。应用直接打开本机数据文件，无需配置数据库连接。

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

浏览器预览使用标明“浏览器演示”的临时内存数据，刷新页面即清空；
只有桌面应用保存到 SQLite，桌面保存失败不会切换成演示数据。
不要同时启动两个占用 1420 端口的开发服务。仅做浏览器预览时可通过
`npm run dev -- --port 1421` 使用其他空闲端口；桌面开发须同时调整 Tauri devUrl。

## 数据与构建

数据库文件为操作系统每用户应用数据目录下的 `todo.sqlite`，不放入源码仓库。
启动失败不会自动删除或替换原数据库。初始应用标识为 `local.todo.desktop`。
升级会保留原有任务并事务性迁移数据库。删除项目保留任务；删除重复规则保留
已生成任务；删除父任务会连同其子任务一起删除，并在界面上确认。

顺延保留历史日期的引用，不复制任务；已明确安排到未来的任务不会提前顺延。
父子任务分别完成。重复任务每次生成独立实例，删除实例不会使它在重启后重生。
每月重复按开始日期对齐，例如 31 日会跳过没有 31 日的月份。

GitHub Actions 的 Checks 工作流运行前端和原生检查。Windows Installer 工作流
需手动触发，产生未签名的 Windows x64 NSIS 安装包，仅作为工作流构件，不发布 Release。
安装包包含 WebView2 离线安装资源；安装包体积不能直接用于衡量应用本体大小。

架构见 `docs/architecture.md`，实际验证记录见 `docs/verification.md`。
