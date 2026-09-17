# 每日待办 0.3 —— 重构设计

## 目标与背景

把「每日待办」从「可安排未来日期、重复任务独立于任务、父子完成状态相互独立」的模型，
收敛为「只做今天、任务即重复、父即子」的更简单心智模型。本次是交互层 + 数据层的一体化重构。

一句话原则：**任务只属于它建立的那一天；今天是你唯一的工作面；未来日期只由重复任务自动生成；
过去只读回看。** 重复任务不再是独立「规则」，而是任务自身的一个属性。

## 核心决策摘要

| 决策点 | 结论 |
| --- | --- |
| 日期模型 | 只做「今天」；计划日期 = 建立那天（不可变），无未来手动安排 |
| 未完成顺延 | 自动顺延到明天，但**展示层不改「建立那天」** |
| 截止日期 | 保留，仅作提醒标签（允许未来，不参与今日安排） |
| 父子完成 | 父→子 + 子齐→父，双向不变量（重复实例不算子任务） |
| 优先级 | 存储仍为 `low/normal/high`，UI 渲染成**绿/黄/红圆点**（绿=低、黄=普通、红=高），编辑器内直接点选三点、无循环 |
| 重复 | 任务属性 `repeat`，源任务 + 生成的实例任务；编辑源改整个系列，编辑实例只改当天 |
| 搜索 | 全局搜索，放在左侧边栏，结果在主区域展示 |
| 新建/编辑 | 合并「快速添加」与「详细新建」为单一编辑器入口 |
| 项目内任务 | 可「加入今日」（生成今日 entry，状态不变） |
| 无项目 | 改名「未分组」，添加时可切换分组 |
| 右键菜单 | 自定义，按内容给对应功能（去掉刷新/另存为） |
| 多选 | 多选任务，批量 完成/删除/移动分组/加入今日 |

## 领域模型

### Task

```ts
type TaskStatus = "open" | "completed";
type Priority = "low" | "normal" | "high";   // UI: 绿 / 黄 / 红
type RepeatFreq = "daily" | "weekdays" | "weekly" | "monthly";

interface Task {
  id: EntityId;
  projectId: EntityId | null;        // null = 未分组
  parentId: EntityId | null;         // 一层子任务
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: LocalDate | null;         // 提醒标签，允许未来
  repeat: { freq: RepeatFreq; interval: number } | null; // null = 不重复
  createdOn: LocalDate;              // 建立那天，不可变，用于展示与排序
  recurrenceSourceId: EntityId | null; // 实例任务指向源任务；源任务为 null
  recurrenceGeneratedThrough: LocalDate | null; // 仅在源任务上有值：生成游标
  completedAt: UtcInstant | null;
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
}
```

移除 `scheduledDate`。任务是否属于「今天」不再由 Task 上的日期字段表达，而由 `DailyEntry` 表达。

### DailyEntry（不变）

```ts
interface DailyEntry {
  id: EntityId;
  taskId: EntityId;
  localDate: LocalDate;              // 任务出现在这一天
  carriedFromDate: LocalDate | null; // 顺延来源（记录历史）
}
```

- **今日成员** = 存在 `localDate === today` 的 entry。
- **历史** = 过去每天的 entry（含 `carriedFromDate`）。
- 创建于今日 / 「加入今日」 / 重复实例 / 顺延，都会产生 entry。

### 父子完成不变量

有真实子任务（`parentId` 指向它，且 `recurrenceSourceId === null`）的任务，其 `status`
恒等于「所有子任务都是 `completed`」：

- 勾父 → 全部子 `completed`；
- 勾最后一个子 → 父 `completed`；
- 取消父 → 全部子 `open`；
- 取消任意子 → 父 `open`。

该不变量由 Rust 在每次 `setCompletion` 时统一维护，任何入口触发结果一致。
重复生成的实例不是子任务，不参与此不变量。

### 重复任务

- 源任务：`repeat !== null` 的普通任务，是「这个重复任务的系列定义」，显示在所在分组（带 🔁 角标）。
- 实例任务：由展开引擎按 `repeat` 逐日生成，`recurrenceSourceId` 指向源任务，`createdOn = 该实例日期`。
- 实例只出现在「今日」（及过去历史、搜索）中，**不出现在项目视图**（项目视图只显示源任务，避免刷屏与重复计数）。
- 编辑源任务 = 改系列（标题/优先级/分组/重复），只影响未来实例；编辑实例 = 只改当天。
- 删除源任务 = 删除源 + 全部实例（有确认）；删除单个实例 = 只删当天，并以 tombstone 记录，不再重新生成。
- 停用重复 = 清空 `repeat`（已生成的实例保留）。

## 存储与迁移

表结构（在现有基础上）：

- `tasks`：新增 `repeat`（JSON 文本或空）、`created_on`、`recurrence_source_id`、`recurrence_generated_through`；
  移除 `scheduled_date`。
- `daily_entries`：不变。
- `projects`、`settings`：不变。
- `recurrence_rules`：**删除**（定义并入 `tasks.repeat`）。
- `recurrence_occurrences`：**保留并重映射**为 `(source_task_id, occurrence_date, task_id)`，
  仅用于幂等与「删除实例不重生成」的 tombstone。

迁移（新增 `003_redesign`，事务执行）：

1. `tasks` 加列；`created_on` 由 `created_at` 的本地日期填充。
2. 每个 `recurrence_rules` 行 → 生成一个源任务（`repeat` 由 rrule 解析：`FREQ` + `INTERVAL`，
   `weekdays` 由 `BYDAY=MO,TU,WE,TH,FR` 识别），`created_on = start_date`，分组/优先级/标题取自模板，
   `recurrence_generated_through = generated_through`。
3. 把该规则已生成的实例任务：`recurrence_source_id = 源任务 id`；
   `recurrence_occurrences.rule_id` 重映射为 `source_task_id`。
4. 删除 `recurrence_rules`；删除 `tasks.scheduled_date`。
5. 未来「安排」若未生成 entry（历史上从未进计划）直接丢弃——符合「只做今天」。

版本化迁移沿用既有策略：事务、不支持版本则拒绝且不替换数据库。

## 视图与交互

### 应用外壳 / 侧边栏

```
待办
[🔍 搜索任务________]   ← 全局搜索（从各视图过滤栏移入）
每日 / 项目 / 设置
```

- 搜索为**全局**：输入即把主区域切换为「搜索结果」列表（跨 今日/项目/历史/已完成），
  每条显示分组与状态；清空回到原视图。结果项可点击编辑。
- 各视图内原有「搜索」输入框移除；状态过滤（全部/未完成/已完成）保留在各视图内。

### 每日视图

- 打开固定「今天」；导航只有「上一天」和「回到今天」，**无「下一天」**；日期选择器 `max = 今天`。
- 过去日期 = **只读历史**：显示当天安排过什么、是否完成；不提供新增与勾选；
  行仍保留右键菜单（可「加入今日」以重做）。顶部有「回到今天」。
- 唯一入口：一个「添加任务」按钮 → 打开任务编辑器（合并原「快速添加输入框」与「详细新建」）。

### 任务编辑器（唯一新建/编辑入口）

字段顺序：

1. 任务名称（唯一必填，回车即存）
2. 优先级：**绿 / 黄 / 红** 三点直接点选（默认黄=普通），无下拉、无循环
3. 分组：下拉含「未分组」+ 各项目，可切换
4. 子任务：内联列表，逐行输入多个子任务标题，可删改；编辑时显示已有子任务
5. 重复：无 / 每天 / 工作日 / 每周 / 每月 + 间隔
6. 截止日期：可选提醒标签（允许未来）
7. 保存 / 取消

无「安排日期」字段。分组默认：每日视图 → 未分组；项目视图 → 当前选中分组（含未分组）。

### 项目视图

- 侧边栏：「全部任务」「未分组」（原名「无项目」）+ 各项目；计数排除实例任务。
- 任务行新增「加入今日」动作：给任务补一条今日 entry → 立即出现在今日；已加入则无副作用；状态不变。
- 源任务（带 🔁 角标）可编辑/停用；实例不出现在项目视图。

### 多选任务

- 每日 / 项目视图均提供「多选」开关；开启后每行出现选择框，点选不触发完成。
- 底部批量操作条：**完成 / 删除 / 移动分组 / 加入今日**；Esc 或「完成」退出。
- 批量操作走事务，级联/校验与单条一致。

### 右键菜单（自定义）

拦截 webview 原生右键（去掉「刷新/另存为」），渲染自定义菜单，按内容给对应功能：

- 任务行：完成/重开、编辑、加入今日（项目内）、添加子任务、移动分组、删除
- 项目：重命名、删除
- 空白处：新建任务（每日）/ 新建项目（项目）

### 设置视图

仅保留「界面密度」；「重复任务」区块移除（重复现在是任务属性，源任务在各自分组内管理）。

## 数据流与变更接口

### Mutation 集合（前端 `application/workspace.ts` 与 Rust `Mutation` 同步）

- `saveTask { task, subtasks: {id, title}[] }`：原子 upsert 父 + 子（子继承父的分组与优先级），
  删除不在列表中的旧子；新建时若 `repeat` 非空，保存后触发展开。
- `setCompletion { ids: string[], completed: boolean }`：批量 + 级联不变量。
- `deleteTasks { ids: string[] }`：删父连带删子；删源任务连带删实例；删实例写 tombstone。
- `addToToday { ids: string[] }`：为每个 id 补今日 entry（幂等）。
- `moveToGroup { ids: string[], projectId: string | null }`：改根任务分组，子跟随；校验项目存在（null=未分组）。
- `saveProject` / `deleteProject` / `saveSettings`：不变。
- 移除 `saveRule` / `deleteRule`；`materialize` 保留为内部重复生成接口（不再由用户直接触发，改为加载/日切换/保存后自动调用）。

### 重复生成流程

- 前端 `useWorkspace`：加载 / 日切换 / `ensureDate` / 保存带 `repeat` 的任务后，
  遍历「带 `repeat` 的源任务」，对每个源任务计算 `(recurrenceGeneratedThrough, through]` 内的发生日期，
  批量提交 `materialize`（等价旧逻辑，但 key 换成 `source_task_id`）。
- Rust `materialize`：逐源任务校验游标（`recurrence_generated_through` 与请求一致），
  为每个发生日期生成实例任务（`created_on = 该日期`、`recurrence_source_id = 源 id`）+ 今日/对应 entry，
  写入 `recurrence_occurrences` 并推进游标；命中 tombstone 的日期跳过。

### 顺延（carryover）

每天 rollover：对「仍 open、至少有一条 entry、最新 entry 日期 < 今天」的任务，
补一条 `(today, carried_from = 最新 entry 日期)` 的 entry。**不修改 `createdOn`。**
展示层始终显示 `createdOn`。

## 错误处理

- 沿用现有错误面：Rust `WorkspaceError → CommandError →` 前端 `InlineMutationError` / 顶部横幅。
- 每个 mutation 在事务内执行，批量操作全有或全无；部分非法输入整体回滚。
- 迁移沿用版本化 + 事务 + 不支持版本拒绝（不替换数据库）。
- 多选 / 右键菜单为纯前端，无新错误类别；重复展开失败走「任务已保存但生成失败」提示路径。

## 测试

### Rust（`src-tauri/src/workspace/tests.rs`）

- 级联不变量：勾父→子全完成、勾最后子→父完成、取消父→子全开、取消子→父开；实例不参与。
- 批量 `setCompletion` / `deleteTasks` / `addToToday` 幂等 / `moveToGroup`（校验 + 子跟随）。
- `task.repeat` 生成：游标幂等、跨日补生成、删实例 tombstone 不重生成、`weekdays` 解析。
- 迁移：`recurrence_rules` → 源任务 + 实例重映射，`scheduled_date` 移除后历史（`daily_entries`）完好。

### 前端（vitest + RTL）

- 编辑器渲染子任务/重复/三点优先级；三点点选与默认值。
- 多选模式与批量动作；右键菜单按内容出对应功能；全局搜索；今日锚定（无未来入口、过去只读）。

### E2E（playwright）

- 建「带子任务 + 重复」的任务 → 今日出现 → 勾父级联完成 → 次日实例出现 →
  项目任务「加入今日」→ 多选「移动分组」→ 过去日期只读回看。
