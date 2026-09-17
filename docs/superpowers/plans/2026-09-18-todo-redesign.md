# 每日待办 0.3 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「每日待办」从「可设未来日期 + 独立重复规则 + 父子完成相互独立」重构为「只做今天 + 任务即重复 + 父即子」的模型。

**Architecture:** 后端(Rust + SQLite)统一维护数据模型、级联不变量、重复生成与顺延；前端(React/TS)只做展示与交互。重复任务的「定义」并入 `tasks.repeat`，生成的「实例」由 `recurrence_source_id` 指向源任务。任务是否属于今天由 `daily_entries` 表达，`scheduled_date` 废弃。

**Tech Stack:** Tauri 2, React 19, TypeScript, SQLite (rusqlite), vitest + RTL, playwright, rrule.

**Spec:** `docs/superpowers/specs/2026-09-18-todo-redesign.md`（本计划从 spec 展开，执行者两篇一起读）

## Global Constraints

- 网络/序列化字段一律 camelCase；Rust 结构体用 `#[serde(rename_all = "camelCase")]`。
- 优先级枚举存储仍为 `low | normal | high`；UI 圆点：绿=low、黄=normal、红=high。
- 重复频率枚举：`daily | weekdays | weekly | monthly`，`weekdays` 忽略 interval。
- 子任务只支持一层（沿用现有 trigger 约束）。
- 所有 mutation 走事务，全有或全无。
- 本地日期格式 `YYYY-MM-DD`，校验沿用 `validate_date`。
- 测试命令：前端 `npm test`；类型 `npm run typecheck`；后端（CI/Windows，含 Tauri）`cargo test --manifest-path src-tauri/Cargo.toml`，本地 Linux（无 GTK）用 `cargo test --no-default-features --lib --manifest-path src-tauri/Cargo.toml`（`tauri` 已被 feature-gate 掉，核心 storage/workspace 测试在此命令下运行）。

---

## File Structure

- 后端 `src-tauri/`：
  - `migrations/003_redesign.sql` — 新增列、重建 occurrences 表、回填 created_on（DDL + 简单回填）。
  - `src/storage.rs` — `SCHEMA_VERSION=3`、`validate_schema`、调用 Rust 迁移 `migrate_recurrence_rules`。
  - `src/workspace.rs` — 新 struct（Task 增 `repeat`/`created_on`/`recurrence_source_id`/`recurrence_generated_through`，去 `scheduled_date`）、重写所有 mutation、重复生成、顺延、级联。含 `migrate_recurrence_rules`。
  - `src/workspace/tests.rs` — 后端测试。
  - `src/commands.rs` — Mutation 枚举透传（serde 自动，基本不动）。
- 前端 `src/`：
  - `domain/models.ts` — Task/RepeatRule 等类型，去 RecurrenceRule。
  - `application/workspace.ts` — Mutation 联合类型、OccurrenceBatch。
  - `application/recurrence-expander.ts` — 改为基于任务的展开接口。
  - `infrastructure/rrule-expander.ts` — `expandBatch` 改为吃「源任务」。
  - `infrastructure/memory-repository.ts` — 镜像全部新 mutation（含级联/重复/顺延）。
  - `app/useWorkspace.ts` — expand 遍历源任务而非 rules。
  - `features/tasks/TaskEditor.tsx`、`TaskList.tsx`、`features/daily/DailyView.tsx`、`features/projects/ProjectsView.tsx`、`features/settings/SettingsView.tsx`、`app/App.tsx` — UI。
  - 新增 `features/shared/ContextMenu.tsx`、`features/shared/MultiSelectBar.tsx`、`features/shared/GlobalSearch.tsx`。

---

## Task 1: 后端数据模型 + 迁移 + 全部 mutation（Rust）

**Files:**
- Create: `src-tauri/migrations/003_redesign.sql`
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/workspace/tests.rs`
- Modify: `src-tauri/src/commands.rs`（仅需确认枚举透传）

**Interfaces:**
- Produces: 新 `Workspace`（`tasks` 含 `repeat`/`createdOn`/`recurrenceSourceId`/`recurrenceGeneratedThrough`，无 `scheduledDate`；无 `rules` 字段）、新 `Mutation`（见下）、`migrate_recurrence_rules`。

**新 Mutation 枚举（Rust `#[serde(tag="kind", rename_all="camelCase")]`）：**

```rust
pub enum Mutation {
    SaveTask { task: TaskDraft, subtasks: Vec<SubtaskDraft>, schedule_today: bool },
    SetCompletion { ids: Vec<String>, completed: bool },
    DeleteTasks { ids: Vec<String> },
    AddToToday { ids: Vec<String> },
    MoveToGroup { ids: Vec<String>, project_id: Option<String> },
    SaveProject { id: String, name: String },
    DeleteProject { id: String },
    SaveSettings { density: Density },
    Materialize { batches: Vec<OccurrenceBatch> },
    Carryover,
}

pub struct TaskDraft { id, title, project_id: Option<String>, parent_id: Option<String>, priority, due_date: Option<String>, repeat: Option<RepeatRule> }
pub struct SubtaskDraft { id: String, title: String }
pub struct RepeatRule { freq: String /* daily|weekdays|weekly|monthly */, interval: i64 }
pub struct OccurrenceBatch { source_task_id: String, expected_through: Option<String>, through: String, dates: Vec<String> }
```

**Task 字段（`#[serde(rename_all="camelCase")]`）：** 保留 `id, project_id, parent_id, title, status, priority, due_date, completed_at, created_at, updated_at`；新增 `repeat: Option<RepeatRule>`、`created_on: String`、`recurrence_source_id: Option<String>`、`recurrence_generated_through: Option<String>`；**删除 `scheduled_date`**。`Workspace` 删除 `rules` 字段。

- [ ] **Step 1: 写迁移 SQL**

`src-tauri/migrations/003_redesign.sql`：

```sql
ALTER TABLE tasks ADD COLUMN repeat TEXT CHECK(repeat IS NULL OR json_valid(repeat));
ALTER TABLE tasks ADD COLUMN created_on TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_source_id TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_generated_through TEXT;

UPDATE tasks SET created_on = substr(created_at, 1, 10);

CREATE TABLE recurrence_occurrences_v2 (
  source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL CHECK(length(occurrence_date)=10 AND date(occurrence_date,'+0 days') IS occurrence_date AND substr(occurrence_date,1,4) BETWEEN '0001' AND '9999'),
  task_id TEXT UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,
  PRIMARY KEY(source_task_id, occurrence_date)
);
```

（Rust 侧随后把 `recurrence_rules` 数据迁移成源任务并回填 `recurrence_occurrences_v2`，再 drop 旧表。见 Step 3。）

> `task_id` 用 `ON DELETE SET NULL`（可空）：删除单个实例任务时，`(source_task_id, occurrence_date)` 行保留为 tombstone、`task_id` 自动置 NULL，从而「删实例不重生成」；删除源任务则 `source_task_id` 的 `ON DELETE CASCADE` 清掉整系列。

- [ ] **Step 2: 写失败测试（迁移 + 结构体）**

在 `src-tauri/src/workspace/tests.rs` 追加：打开旧库（含一条 `recurrence_rules` 行与一条 `occurrence:...` 实例）后，`load_workspace` 返回的 `tasks` 里存在 `series:<rule_id>` 源任务（`repeat` 非空、`recurrence_source_id` 为空），实例任务 `recurrence_source_id == Some("series:<rule_id>")`，且 `rules` 字段不存在。运行 `cargo test --manifest-path src-tauri/Cargo.toml` 预期编译失败/断言失败。

- [ ] **Step 3: 实现迁移 + 结构体**

1. `storage.rs`：`SCHEMA_VERSION=3`；`match version` 增加 `2 => 执行 003_redesign.sql + 调 workspace::migrate_recurrence_rules(&tx) + user_version=3 + validate_schema`；`0/1` 分支顺序执行 002 再 003。`validate_schema` 改为 `SELECT id,title,status,priority,repeat,created_on,recurrence_source_id,recurrence_generated_through FROM tasks LIMIT 0` 与 `SELECT source_task_id,occurrence_date,task_id FROM recurrence_occurrences LIMIT 0`，去掉 `recurrence_rules` 检查。
2. `workspace.rs` 新增：

```rust
pub fn migrate_recurrence_rules(tx: &Transaction<'_>) -> Result<(), WorkspaceError> {
    let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)> = {
        let mut stmt = tx.prepare(
            "SELECT id,template_json,rrule,start_date,end_date,generated_through FROM recurrence_rules",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        mapped.collect::<Result<Vec<_>, _>>()?
    };
    for (id, template_json, rrule, start_date, _end_date, generated_through) in rows {
        let template: TaskTemplate = serde_json::from_str(&template_json)?;
        let repeat = repeat_from_rrule(&rrule)?;
        let source_id = format!("series:{id}");
        let ts = format!("{start_date}T00:00:00Z");
        tx.execute("INSERT OR IGNORE INTO tasks(id,project_id,parent_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,completed_at,created_at,updated_at) VALUES (?1,?2,NULL,?3,'open',?4,?5,?6,?7,NULL,?8,NULL,?9,?9)",
            params![source_id, template.project_id, template.title, priority_string(&template.priority), template.due_date, serde_json::to_string(&repeat)?, start_date, generated_through, ts])?;
        tx.execute("UPDATE tasks SET recurrence_source_id=?1 WHERE id IN (SELECT task_id FROM recurrence_occurrences WHERE rule_id=?2)", params![source_id, id])?;
        tx.execute("UPDATE tasks SET created_on=(SELECT occurrence_date FROM recurrence_occurrences WHERE rule_id=?2 AND task_id=tasks.id) WHERE recurrence_source_id=?1", params![source_id, id])?;
        tx.execute("INSERT OR IGNORE INTO recurrence_occurrences_v2(source_task_id,occurrence_date,task_id) SELECT ?1, occurrence_date, task_id FROM recurrence_occurrences WHERE rule_id=?2", params![source_id, id])?;
    }
    tx.execute_batch("DROP TABLE recurrence_occurrences; DROP TABLE recurrence_rules; ALTER TABLE recurrence_occurrences_v2 RENAME TO recurrence_occurrences;")?;
    Ok(())
}
```

`repeat_from_rrule`：解析 `FREQ=...;INTERVAL=n` 与 `BYDAY=MO,TU,WE,TH,FR`，返回 `RepeatRule { freq, interval }`；`weekdays` 时 interval=1；未知频率报 `WorkspaceError::InvalidInput`。`repeat` 序列化用 `#[serde(rename_all="camelCase")]` 或手写 `to_json`（`{"freq":"daily","interval":1}`）。

3. 更新 `load_workspace`：SELECT 新列、解析 `repeat` JSON、`rules` 字段删除。

- [ ] **Step 4: 运行测试通过**（迁移用例）

- [ ] **Step 5: 写失败测试（mutation 新行为）**——覆盖：`SaveTask` 复合保存（父 + 子，替换旧子）、`SetCompletion` 批量级联、`DeleteTasks`、`AddToToday` 幂等、`MoveToGroup`、`Materialize` 游标幂等 + tombstone、`Carryover` 不改 createdOn。

- [ ] **Step 6: 实现 mutations**

要点（`apply_mutation` 各分支）：

`save_task(tx, draft, subtasks, today)`：
- 校验 id/title/due_date/repeat（`repeat.interval` 1..=365，`freq` 合法）。
- 若 `parent_id` 存在：校验父存在、父无父（一层）、父≠自身；`subtasks` 必须为空（子任务不能再有子）。
- effective_project = 父的 project（若有父）否则 draft.project_id（校验项目存在或 null）。
- upsert 父：新任务 `created_on = today`（已有任务保持原 `created_on`）；`repeat` 存 JSON；`recurrence_source_id`/`recurrence_generated_through` 为 null（编辑源任务时保留其 `recurrence_generated_through` 与 `recurrence_source_id` 不动）。
- 子任务对账：对每个 `subtasks` upsert（`parent_id=父id`、`project_id=effective_project`、`priority=父priority`、`created_on=today` 或保留）；删除父的「不在 subtasks 列表」的旧子。
- 若 `schedule_today` 为真且任务为根（`parent_id` 为空）：为新父任务及其子任务各写一条今日 entry（`insert_entry(tx, id, today, None)`）。这样「每日视图新建」原子地落进今天。项目视图新建时 `schedule_today=false`（只进分组）。重复源任务不在此写 entry，改由后续 `Materialize` 生成今日实例。

`set_completion(tx, ids, completed)`：先对每个 id 更新自身 status/completed_at；再执行级联闭包：
- 若 `completed`：把「父在 ids 中的任务的子」全部置 completed；把「所有子都 completed 的父」置 completed（含刚被改的子引发的父）。
- 若 `!completed`：把「父在 ids 中的任务的子」全部置 open；把「任一子 open 的父」置 open。
- 只对 `recurrence_source_id IS NULL` 的任务做父子级联（实例不参与）。

`delete_tasks(tx, ids)`：对每个 id——若为源任务（`repeat` 非空），删除源 + `recurrence_source_id=id` 的实例 + occurrences；否则删除该任务 + 其子（`parent_id=id`）。子级联删除由 DB 的 `ON DELETE CASCADE` 兜底。

`add_to_today(tx, ids, today)`：对每个 id `INSERT OR IGNORE` 今日 entry（`carried_from_date` NULL）。

`move_to_group(tx, ids, project_id)`：校验项目存在（null 合法=未分组）；对每个 id 若为根任务（`parent_id IS NULL`），更新 `project_id` 并级联子。

`materialize(tx, batches)`：与旧逻辑等价，但 key 改为 `source_task_id`，模板来自源任务（`repeat` 展开）而非 `recurrence_rules`。为每个 date 生成实例任务：`id = format!("occurrence:{}:{}", source_id, date)`，`repeat=NULL`、`recurrence_source_id=source_id`、`created_on=date`、`priority/project_id/due_date` 复制自源任务；写 entry(date)；写 occurrences；推进源任务 `recurrence_generated_through=through`。tombstone 检查沿用 `recurrence_occurrences` 主键（已生成日期即使实例被删也不重生成——删除实例时保留 occurrences 行）。

`carryover(tx, today)`：候选 = 「`status='open'` 且 `recurrence_source_id IS NULL` 且有 entry、最新 entry < today」的任务；对每项 `INSERT OR IGNORE` entry(today, carried_from=latest)；**不改 created_on**。

- [ ] **Step 7: 运行 `cargo test` 全绿**

- [ ] **Step 8: Commit**

```bash
git add src-tauri/
git commit -m "feat: redesign backend to today-only task model"
```

---

## Task 2: 前端领域 + 应用 + 基础设施（TS）

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/application/workspace.ts`
- Modify: `src/application/recurrence-expander.ts`
- Modify: `src/infrastructure/rrule-expander.ts`
- Modify: `src/infrastructure/memory-repository.ts`
- Modify: `src/app/useWorkspace.ts`
- Modify: `src/infrastructure/memory-repository.test.ts`、`src/app/useWorkspace.test.ts`、`src/infrastructure/tauri-workspace.test.ts`、`src/infrastructure/rrule-expander.test.ts`

**Interfaces:**
- Produces: `Task`（含 `repeat`/`createdOn`/`recurrenceSourceId`/`recurrenceGeneratedThrough`，无 `scheduledDate`）、`RepeatRule`、新 `Mutation`（`saveTask{task,subtasks,scheduleToday}`、`setCompletion{ids,completed}`、`deleteTasks{ids}`、`addToToday{ids}`、`moveToGroup{ids,projectId}`、`materialize{batches}`、`carryover`、`saveProject`、`deleteProject`、`saveSettings`）、`OccurrenceBatch{sourceTaskId,expectedThrough,through,dates}`、`Workspace`（去 `rules`）、`expandBatch(task, through)`。

- [ ] **Step 1: 更新 `models.ts`**（`RepeatRule`、Task 新字段、删 `RecurrenceRule`/`RecurrenceOccurrence`/`TaskTemplate`）
- [ ] **Step 2: 更新 `workspace.ts`**（`Workspace` 去 rules；`Mutation` 新联合；`TaskDraft`/`SubtaskDraft`/`OccurrenceBatch`）
- [ ] **Step 3: 更新 `recurrence-expander.ts`**（`OccurrenceCandidate` 改 `sourceTaskId`）
- [ ] **Step 4: 更新 `rrule-expander.ts`**（`expandBatch(task, through)`：读 `task.repeat` + `task.recurrenceGeneratedThrough` 计算区间；`freq`→rrule 映射复用旧 `toRrule` 逻辑搬进来）
- [ ] **Step 5: 更新 `memory-repository.ts`**（`apply` 各分支改为镜像 Task 1 的 Rust 行为：`saveTask` 复合 + 子继承 + 不写 entry；`setCompletion` 批量级联；`deleteTasks`；`addToToday`；`moveToGroup`；`materialize` 基于源任务；`carryover` 基于 entry 且不动 createdOn；`emptyWorkspace` 去 rules）
- [ ] **Step 6: 更新 `useWorkspace.ts`**（`expand` 遍历 `current.tasks.filter(t => t.repeat)`；删除 `saveRule` 分支；`run` 里 `SaveTask` 后若 `task.repeat` 非空则 `expand`）
- [ ] **Step 7: 更新现有测试 + 补新测试**（memory-repository 级联/复合保存/顺延；rrule-expander 任务化）
- [ ] **Step 8: `npm run typecheck` + `npm test` 全绿**
- [ ] **Step 9: Commit** `feat: align frontend domain and adapters with today-only model`

---

## Task 3: TaskEditor（子任务 + 重复 + 三点优先级 + 分组切换）

**Files:** Modify `src/features/tasks/TaskEditor.tsx`；Test `src/features/tasks/TaskEditor.test.tsx`（若不存在则建）

- 新增 state：`subtasks: {id,title}[]`（编辑时从 `workspace.tasks.filter(t=>t.parentId===task.id)` 初始化）、`repeat`、`interval`。
- 优先级：三按钮，绿/黄/红圆点（`aria-pressed`），默认 `normal`；`aria-label` 分别为「低/普通/高」。
- 分组：下拉「未分组」+ 各项目（替换原「项目/无项目」）。
- 子任务：`fieldset` 内映射 `subtasks` 行，每行 input + 删除按钮 + 底部「添加子任务」；`parentId` 非空时隐藏子任务区。
- 重复：`select`（无/每天/工作日/每周/每月）+ `interval` number（`weekdays` 禁用）。
- 移除「安排日期」字段。`onSubmit` 组装 `run({kind:"saveTask", task:{...}, subtasks})`。
- 测试：渲染三点、点选优先级、输入子任务并保存后 `run` 收到 `subtasks`、编辑已有任务回填子任务。

- [ ] Step 1 写测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: expand task editor with subtasks, repeat, dot priority`

---

## Task 4: TaskList（圆点显示 + 加入今日 + 去掉安排日期展示）

**Files:** Modify `src/features/tasks/TaskList.tsx`；测试 `src/features/tasks/TaskList.test.tsx`

- `priorityLabels` 文本替换为彩色圆点 `<span className="priority-dot priority-low|normal|high" aria-label="...">`。
- 移除 `task.dueDate` 外的 `scheduledDate` 相关展示（若有）；`task-meta` 增「建立于 {createdOn}」。
- 新增 prop `onAddToToday(task)` 与行内「加入今日」图标按钮（`CalendarDays` 或 `Plus`）；重复实例/源任务显示 `repeat` 角标（`Repeat` 图标 + `describeRepeat`）。
- 子任务进度 `completedChildren/children.length` 保留。
- 测试：圆点渲染、加入今日回调、建立日期展示。

- [ ] Step 1 测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: dot priority and add-to-today in task list`

---

## Task 5: DailyView（今天锚定 + 只读过去 + 单入口）

**Files:** Modify `src/features/daily/DailyView.tsx`；测试 `src/features/daily/DailyView.test.tsx`

- 去掉「快速添加输入框」与「详细新建」两个入口，合并为单个「添加任务」按钮 → `setEditor({})`。编辑器保存时 `saveTask` 传 `scheduleToday: true`（今日新建即入今日）。
- 日期栏：移除「下一天」按钮与日期输入框的 `max` 设为今天；「上一天」保留；加「回到今天」；`onDateChange` 只允许 `<= today`。`date === today` 时隐藏/禁用「回到今天」。
- 过去日期（`date < today`）：渲染只读列表——`busy`/`error`/`run` 仍传但 `TaskList` 用新 prop `readOnly` 隐藏复选框与行内编辑/删除/加入今日（或直接不渲染操作区）。顶部提示「浏览历史 · {date}」+「回到今天」。
- 移除本视图内的「搜索任务」输入（搜索已入侧边栏）；保留状态过滤。
- 测试：无未来入口（不存在下一天按钮）、过去日期只读、单添加按钮。

- [ ] Step 1 测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: today-anchored daily view with read-only history`

---

## Task 6: ProjectsView（未分组 + 加入今日 + 去搜索）

**Files:** Modify `src/features/projects/ProjectsView.tsx`；测试 `src/features/projects/ProjectsView.test.tsx`

- 「无项目」文案改「未分组」；「删除项目」弹窗里的「无项目」同步改「未分组」。
- 过滤出「实例任务」（`recurrenceSourceId !== null`）不在项目列表/计数中出现。
- 移除本视图搜索输入，保留状态过滤。
- 源任务（`repeat` 非空）在侧边栏计数里按普通任务计，行内带重复角标。
- 透传 `onAddToToday` 给 `TaskList`，`run` 里 `{kind:"addToToday", ids:[id]}`；本视图新建任务时 `saveTask` 传 `scheduleToday: false`（只进分组，不自动入今日）。

- [ ] Step 1 测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: rename ungrouped and add-to-today in projects`

---

## Task 7: 应用外壳 + 侧边栏全局搜索 + 自定义右键菜单

**Files:** Modify `src/app/App.tsx`；Create `src/features/shared/GlobalSearch.tsx`、`src/features/shared/ContextMenu.tsx`；测试 `src/app/App.test.tsx`

- 侧边栏：品牌下加 `GlobalSearch`（受控 `query`），非空时主区域渲染「搜索结果」列表（`workspace.tasks` 全量 filter，含分组/状态/是否实例）。
- `ContextMenu`：`window.addEventListener("contextmenu", e => { e.preventDefault(); ... })` 拦截原生菜单，按目标内容类型（任务行/项目/空白）显示对应操作（完成/重开、编辑、加入今日、添加子任务、移动分组、删除 / 重命名、删除 / 新建任务、新建项目）。用 `ModalActivityContext` 之类控制「编辑」等打开对应弹窗。
- 测试：搜索过滤、右键不再出现默认菜单、任务行右键出现「编辑/删除」。

- [ ] Step 1 测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: global sidebar search and custom context menu`

---

## Task 8: 多选任务批量操作

**Files:** Create `src/features/shared/MultiSelectBar.tsx`；Modify `src/features/tasks/TaskList.tsx`、`src/features/daily/DailyView.tsx`、`src/features/projects/ProjectsView.tsx`

- `TaskList` 新增 `selection` 模式：prop `selectable` + 回调 `onToggleSelected(id)` + `selected: Set<string>`；多选开启时行首渲染选择框（不触发完成）。
- `MultiSelectBar`：显示选中数 + 按钮「完成 / 删除 / 移动分组 / 加入今日」。完成→`setCompletion{ids,completed:true}`（或重开）、删除→`deleteTasks{ids}`、移动分组→弹分组选择→`moveToGroup{ids,projectId}`、加入今日→`addToToday{ids}`。
- Daily/Projects 视图提供「多选」开关，开启后进入选择模式，底部渲染 `MultiSelectBar`，Esc/「完成」退出。
- 测试：勾选多项后批量完成/删除回调参数正确、移动分组。

- [ ] Step 1 测试 → Step 2 实现 → Step 3 通过 → Step 4 Commit `feat: multi-select bulk actions`

---

## Task 9: SettingsView 瘦身

**Files:** Modify `src/features/settings/SettingsView.tsx`

- 删除「重复任务」区块与 `saveRule`/`deleteRule` 引用；仅保留「界面密度」。

- [ ] Step 1 更新测试（若引用重复区块则删）→ Step 2 实现 → Step 3 通过 → Step 4 Commit `chore: remove recurrence UI from settings`

---

## Task 10: E2E 更新 + 版本号 + 全量验证

**Files:** Modify `tests/e2e/navigation.spec.ts`；Modify `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`

- E2E 改为：建「带子任务+重复」→ 今日出现 → 勾父级联 → 项目任务加入今日 → 多选移动分组 → 过去只读。无未来日期入口。
- 版本号 0.2.0 → 0.3.0（三处）。
- 运行 `npm test`、`npm run typecheck`、`cargo test --manifest-path src-tauri/Cargo.toml` 全绿。
- Commit `chore: bump 0.3.0 and refresh e2e`

> 注意：Windows 安装包（NSIS .exe）需在 Windows/CI 上构建（`.github/workflows/windows-build.yml`）；Linux 本机只验证前端 + Rust 测试与 `npm run build` 前端产物。交付 .exe 走 GitHub Actions。
