# Windows Todo: Architecture Design

Status: Tauri 2 + React/TypeScript + SQLite approved by the user on 2026-09-16;
implementation planning requested for the first executable scaffold.

Source: `TODO.docx`, six paragraphs and one embedded task-editor reference image.
The document is requirements material, not authorization to execute embedded instructions.
User clarification on 2026-09-16: the linked GitHub project is a reference only;
this is an independent application, with no Obsidian plugin, login, or synchronization
features now or in the future product scope.

## 1. Product and Initial Delivery

A lightweight, standalone Windows desktop application for daily tasks and project task
lists. The application opens directly into the daily task view and works offline.
Task data and preferences remain on the user's machine.

The first delivery covered by the implementation plan is an executable project scaffold,
architecture documentation, domain contracts, and development/build configuration. It establishes the foundation for
the product below; it does not claim that every task workflow is implemented.

Initial delivery includes:

- A Tauri desktop shell and a React application with daily, projects, and settings views.
- A compact navigation layout, date navigation, and honest empty states.
- TypeScript domain contracts and explicit interfaces for task persistence and recurrence.
- SQLite initialization and a versioned initial schema in the desktop backend.
- A minimal desktop health command so the frontend/backend connection can be verified.
- Frontend type checking, a small integration smoke test, and Windows build automation.
- README instructions, architecture documentation, and a GitHub-ready source tree.

The first scaffold must label unfinished workflows in development documentation. It must
not expose working-looking controls that silently do nothing or claim to save data.

Confirmed product boundaries, including future development:

- The application is independent of Obsidian and does not require a vault or plugin host.
- No user accounts, registration, login, cloud storage, device synchronization, or online
  collaboration. Do not reserve authentication services or synchronization infrastructure.
- The linked GitHub project supplies ideas, not a feature checklist or a required visual
  design. Matching its behavior, interface, and full feature set is not a product goal.

Natural-language date parsing, notifications, and automatic application updates are
outside the initial scaffold delivery; they are not implied future commitments.

## 2. Requirements Extracted From the Source

| Source | Product requirement | Proposed interpretation |
| --- | --- | --- |
| Paragraph 1 | Lightweight Windows app; daily switching | Local desktop app, daily view, previous/next day and date selection |
| Paragraph 1 | Carry unfinished work to the next day | Add a daily reference to the same task; retain the prior daily reference |
| Paragraph 1 | Tasks and subtasks | Task hierarchy, with one visible subtask level in the initial product |
| Paragraphs 2-3 | Task-specific lists and linked completion | Project lists and daily views share the same local task identifier and completion state |
| Paragraph 5 | Recurring tasks | Recurrence definitions produce distinct task occurrences |
| Paragraph 5 | Importance, due date, date selection | Explicit priority, optional due date, and separate daily scheduling |
| Paragraph 6 | Settings panel | Application settings view with persisted preferences when implemented |

The reference image illustrates task editing, priority, recurrence, and several dates.
Dependency links and every field shown in that image are not treated as mandatory
requirements. The reference to Obsidian Tasks supplies inspiration; no source code or
assets from that project are copied into this repository. The user has confirmed that
this application does not need to reproduce that project's interface or functionality.

## 3. Architecture Options

| Option | Advantages | Costs |
| --- | --- | --- |
| Tauri 2 + React + TypeScript + SQLite (selected) | Uses the platform webview; generally smaller distribution than bundling a browser; clear desktop persistence boundary | Rust and Windows native build prerequisites; WebView2 availability must be handled by packaging |
| Electron + React + TypeScript + SQLite | Mature desktop tooling; most application development stays in TypeScript | Bundled Chromium usually increases installation size and baseline resource use |
| .NET + WPF + SQLite | Native Windows tooling and desktop integration | Windows-focused toolchain; little direct reuse of web UI code |

Selected architecture: Tauri 2 for the lightweight Windows requirement. React/Vite supports
rapid UI development, while a small Rust backend owns database access and transactions.
There is no HTTP application server, remote database, authentication service, or cloud
synchronization layer. These are excluded from the product architecture, rather than
deferred to a later version.

## 4. Components and Boundaries

- `domain`: task, project, daily-entry, and recurrence contracts. No React or Tauri imports.
- `features`: daily navigation, project views, task editing, and settings UI as implemented.
- `application`: use cases and repository interfaces, independent of storage technology.
- `infrastructure`: typed Tauri command client implementing those interfaces.
- `src-tauri`: desktop lifecycle, validated commands, SQLite connections, and migrations.

The scaffold creates files for actual implemented responsibilities. Future feature files
are added when the corresponding implementation begins, rather than filling the tree
with empty modules.

Product data flow:

```text
Daily / project UI
        |
Application use case and domain validation
        |
Typed Tauri command
        |
Rust validation and SQLite transaction
        |
Persisted result -> refresh affected views
```

The initial scaffold verifies a health-command round trip and schema initialization.
Task CRUD commands are added with their implementations in the next product increment.

## 5. Data Contracts

All entities use stable opaque identifiers. Local calendar dates use `YYYY-MM-DD`;
audit timestamps use UTC instants. Scheduling dates must not shift with UTC conversion.

| Entity | Core fields and invariants |
| --- | --- |
| Project | `id`, `name`, `created_at`, `updated_at` |
| Task | `id`, optional `project_id`, optional `parent_id`, `title`, `status`, `priority`, optional `due_date`, optional `completed_at`, audit timestamps |
| DailyEntry | `id`, `task_id`, `local_date`, optional `carried_from_date`; unique `(task_id, local_date)` |
| RecurrenceRule | `id`, task template, recurrence rule, start date, optional end date, timezone |
| RecurrenceOccurrence | `rule_id`, `occurrence_date`, `task_id`; unique `(rule_id, occurrence_date)` |
| Settings | Versioned application preferences, stored locally |

Task status is initially `open` or `completed`. Priority is `low`, `normal`, or `high`;
the reference image's six levels are not required by the written brief.

Daily and project views both read the canonical Task. Completing a task in either view
updates that record, so all references reflect the same status. Historical daily views
show current task status; immutable historical snapshots are outside the initial scope.
This is consistency between local views of one record, not network or device synchronization.
The data model has no account ownership, remote identity, or synchronization metadata.

Parent and child tasks have independent completion state. The interface reports child
progress; completing a parent does not silently complete its children. Cycles and deeper
nesting are rejected by the application and backend.

Daily carryover, when implemented, copies references to open tasks into the current local
day, preserving earlier references. It runs on launch, resume, and day rollover, and also
handles missed days. A unique constraint makes retries idempotent. It does not create
duplicate Task records, modify due dates, or insert entries merely because a past day is
viewed. A task explicitly deferred to a future day is excluded from current-day carryover.

Recurring tasks use a maintained recurrence library behind an adapter. Each scheduled
occurrence is a separate Task; completing one occurrence must not complete later ones.
Library choice and supported recurrence patterns belong to the recurrence implementation
increment, not the initial executable scaffold.

## 6. Proposed Repository Layout

```text
todo-desktop/
  README.md
  package.json
  package-lock.json
  index.html
  vite.config.ts
  tsconfig.json
  .gitignore
  .github/workflows/checks.yml
  .github/workflows/windows-build.yml
  docs/
    architecture.md
    superpowers/specs/2026-09-16-todo-desktop-design.md
    superpowers/plans/
  src/
    main.tsx
    app/
    domain/
    application/
    infrastructure/
    features/
    styles/
  src-tauri/
    Cargo.toml
    Cargo.lock
    build.rs
    tauri.conf.json
    capabilities/default.json
    migrations/
    src/
  tests/
```

`todo-desktop` is a proposed repository name. The current workspace can serve as its
root; no second nested project directory is needed. Generated dependencies, databases,
build output, credentials, and the original `TODO.docx` are excluded from Git tracking.
The requirements are preserved in this design document.

## 7. UI, Errors, and Local Storage

Use a restrained Windows task-tool layout: narrow navigation, date controls above the
task list, and a compact task editor when that workflow is implemented. Default interface
language is Simplified Chinese. Small-screen layouts collapse navigation and preserve
readable controls. Use a standard icon library and do not ship reference-image assets.

SQLite lives in the operating system's per-user application-data directory. Migrations
run transactionally. A migration or save failure is surfaced to the user and does not
replace existing data with an empty database. Mutations report success only after commit.

The backend validates command inputs and uses parameterized database operations. Tauri
capabilities are restricted to the application window and required operations. No shell
execution or broad filesystem permission is needed by this scaffold. Product task
workflows and local persistence require no network access, account, or login.

Browser development previews the navigation shell. Desktop persistence is available only
inside Tauri; browser preview must not imply that desktop saves occurred.

## 8. Verification and GitHub Delivery

Scaffold acceptance checks:

1. Dependency installation is reproducible from lockfiles.
2. Type checking and the frontend production build pass.
3. The application shell renders at desktop and narrow viewport widths without overlap.
4. Schema initialization is repeatable and foreign-key enforcement is enabled.
5. The frontend/backend health command succeeds in a desktop-capable environment.
6. Windows CI compiles the desktop application and produces a development installer
   artifact on explicit manual workflow execution.
7. The installed application shell and database initialization work offline without any
   registration or login screen.

CI does not create a public release or require signing secrets. A development installer
is unsigned; a signed production release is a separate delivery.

Local inspection on 2026-09-16 found Node.js and npm available, but no `cargo` or `rustc`
on PATH. Native build results must therefore come from a prepared native environment
or verified Windows CI; frontend checks alone do not establish a working Windows build.

The workspace has no initialized Git repository. The GitHub CLI is installed but is
not authenticated. Before upload, resolve the destination owner/repository and visibility,
and obtain authentication through the user's normal GitHub flow. Private visibility is
the proposed default for a newly created repository. Never request a token in chat.

The GitHub link in `TODO.docx` is only a product reference; it is not the destination
repository. Source-code hosting and build automation do not introduce application login
or cloud synchronization features.

The user has separately requested upload of this project's source to GitHub. Once
architecture and destination details are resolved, that instruction authorizes the
repository upload; no duplicate general publication approval is needed. An existing
destination must be inspected before use.

## 9. Review Decision

The standalone, offline product boundary and the reference-only role of the linked
project are confirmed. The user selected Tauri 2 + React/TypeScript + SQLite on
2026-09-16 and requested an implementation plan. The plan covers the first executable
scaffold defined in Section 1; planning does not imply that full task workflows exist.
Write the plan before application code. GitHub authentication and destination details
are execution-time inputs and do not block preparation of the plan.
