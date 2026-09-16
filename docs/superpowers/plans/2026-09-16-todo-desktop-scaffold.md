# Windows Todo Desktop Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, offline Windows todo application scaffold with three navigable views, local SQLite initialization, a verified desktop connection, and reproducible build configuration.

**Architecture:** Tauri 2 hosts a React/TypeScript interface; a small Rust backend owns SQLite and its transactions. Domain contracts have no React or Tauri dependencies. Daily and project views will share canonical local tasks, with no account or network service.

**Tech Stack:** Tauri 2, React 19, TypeScript 5, Vite 7, Rust stable, rusqlite with bundled SQLite, Vitest 4, Testing Library, Playwright, lucide-react, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-todo-desktop-design.md` (read together with this plan).

## Global Constraints

The following requirements are copied verbatim from the source specification:

- "Task data and preferences remain on the user's machine."
- "The application is independent of Obsidian and does not require a vault or plugin host."
- "No user accounts, registration, login, cloud storage, device synchronization, or online collaboration. Do not reserve authentication services or synchronization infrastructure."
- "The linked GitHub project supplies ideas, not a feature checklist or a required visual design. Matching its behavior, interface, and full feature set is not a product goal."
- "The scaffold creates files for actual implemented responsibilities. Future feature files are added when the corresponding implementation begins, rather than filling the tree with empty modules."
- "Task CRUD commands are added with their implementations in the next product increment."
- "All entities use stable opaque identifiers. Local calendar dates use `YYYY-MM-DD`; audit timestamps use UTC instants. Scheduling dates must not shift with UTC conversion."
- "The data model has no account ownership, remote identity, or synchronization metadata."
- "Default interface language is Simplified Chinese."
- "SQLite lives in the operating system's per-user application-data directory. Migrations run transactionally."
- "A migration or save failure is surfaced to the user and does not replace existing data with an empty database."
- "Product task workflows and local persistence require no network access, account, or login."
- "Browser development previews the navigation shell. Desktop persistence is available only inside Tauri; browser preview must not imply that desktop saves occurred."
- "CI does not create a public release or require signing secrets."

---

## Execution Boundary

This plan implements the first scaffold in spec Section 1. Tasks 1-6 produce one working,
testable increment; Task 7 publishes and verifies that increment. Do not turn the whole
product roadmap into a single implementation task.

The scaffold implements date navigation, view switching, domain contracts, database
initialization, health reporting, and build tooling. It does not implement task editing,
completion, carryover, recurrence expansion, or settings mutations. Those behaviors are
specified in the design but excluded from this delivery. Their interfaces and initial
schema are included; do not install a recurrence library without a recurrence implementation.

The user requested planning in the current turn. Commands below are for execution after
the user chooses an execution mode; writing this file does not execute them.

Environment observations from 2026-09-16 are evidence to recheck, not permanent facts:

- Workspace: `/home/yanxu/zzq/todo`; it contains the source document and design, not an app.
- Node.js/npm are available. `cargo` and `rustc` were not on PATH.
- No initialized Git repository; the managed `.git` path may require a sandbox write approval.
- `gh` is installed but unauthenticated. Destination owner and repository visibility are unconfirmed.

Use Node 24 for local execution and CI. Install exact npm resolutions with `--save-exact`
and commit `package-lock.json`. Commit `Cargo.lock` for the desktop binary. Resolve
compatible Rust dependencies within the declared versions; record the toolchain used.
The spec requires Tauri major 2 and does not impose a Rust version floor beyond its
dependencies' requirements. Do not invent a previously approved Rust version pin.

Native compilation is performed on Windows with Rust stable, MSVC C++ build tools,
Windows SDK, and WebView2. A Linux executor can complete frontend verification and let
Windows CI perform native compilation. Do not install Linux desktop libraries or modify
system toolchains solely to make a Windows-targeted plan appear locally validated.

Cargo is still required to generate `Cargo.lock` before any `--locked` check or publish.
If it is absent, prepare a user-scoped Rust toolchain with the environment owner's
authorization, or generate and verify the lockfile in a prepared Windows checkout of
the same manifest. Generating a lockfile does not require compiling Tauri or installing
Linux GUI libraries. Never commit a guessed lockfile or expect locked CI to create it.

## File Map and Ownership

| Files | Responsibility | Task |
| --- | --- | --- |
| `package.json`, `package-lock.json`, `.node-version`, `.npmrc`, `.gitignore`, `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | Frontend tooling and reproducible dependencies | 1 |
| `src/main.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `tests/setup.ts` | Application entry point and basic render test | 1, 4, 5 |
| `src/domain/local-date.ts`, `src/domain/local-date.test.ts`, `src/domain/models.ts` | Calendar semantics and entity types | 2 |
| `src/application/task-repository.ts`, `src/application/recurrence-expander.ts` | Future task-storage and recurrence contracts; no fake implementation | 2 |
| `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` | Desktop host and constrained configuration | 3, 5 |
| `assets/app-icon.svg`, `src-tauri/icons/icon.png`, `src-tauri/icons/icon.ico`, `src-tauri/icons/32x32.png`, `src-tauri/icons/128x128.png`, `src-tauri/icons/128x128@2x.png` | Application-owned packaging icons | 3 |
| `src-tauri/migrations/001_initial.sql`, `src-tauri/src/storage.rs`, `src-tauri/src/storage/tests.rs` | Transactional schema initialization and persistence tests | 3 |
| `src/features/daily/DailyView.tsx`, `src/features/projects/ProjectsView.tsx`, `src/features/settings/SettingsView.tsx`, `src/styles/app.css` | Compact Chinese application views | 4 |
| `playwright.config.ts`, `tests/e2e/navigation.spec.ts` | Browser navigation and layout verification | 4 |
| `src/application/health.ts`, `src/infrastructure/tauri-health.ts`, `src/infrastructure/tauri-health.test.ts`, `src/app/useHealth.ts` | Typed health boundary and honest connection state | 5 |
| `src-tauri/src/commands.rs` | Desktop health command and error serialization | 5 |
| `.github/workflows/checks.yml`, `.github/workflows/windows-build.yml` | Frontend/native checks and unsigned installer artifact | 6 |
| `README.md`, `docs/architecture.md`, `docs/verification.md` | Development instructions, implementation boundaries, actual verification evidence | 6, 7 |

Use named exports. Feature components own their view; shared domain and application
contracts do not depend on the UI. Do not add a router, state-management framework,
web server, authentication package, SQL plugin, or empty repository class for this scaffold.

## Task 1: Runnable Frontend and Test Harness

**Files:** Create the Task 1 files in the file map. The design and this plan already exist.

**Interfaces:**

- Consumes: none.
- Produces: `App(): React.JSX.Element`; scripts `dev`, `build`, `preview`, `typecheck`,
  `test`, `test:watch`, and `tauri`; test setup with DOM cleanup.

- [ ] **Step 1: Establish the repository and install exact dependency resolutions.**

At execution time inspect `git status` and existing files before writing. Initialize
Git only if it is still uninitialized. Do not remove the managed `.git` directory or
overwrite an existing project. Request a normal sandbox escalation if Git initialization
is denied; do not move metadata elsewhere to evade the restriction.

```bash
git init --initial-branch=main
```

Create `package.json`:

```json
{
  "name": "todo-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  }
}
```

```bash
npm install --save-exact react@19 react-dom@19 @tauri-apps/api@2 lucide-react
npm install --save-dev --save-exact typescript@5 vite@7 @vitejs/plugin-react@5 @types/react@19 @types/react-dom@19 @types/node@24 vitest@4 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @tauri-apps/cli@2 cross-env
```

Create `.node-version` containing `24`, `.npmrc` containing `save-exact=true`, and
`.gitignore` with these entries. Lockfiles must remain tracked.

```gitignore
/node_modules/
/dist/
/src-tauri/target/
/src-tauri/gen/
/playwright-report/
/test-results/
/.superpowers/
/.agents/
/.codex/
/TODO.docx
.env
.env.*
!.env.example
*.sqlite
*.sqlite-*
*.db
*.db-*
/src-tauri/icons/*
!/src-tauri/icons/icon.png
!/src-tauri/icons/icon.ico
!/src-tauri/icons/32x32.png
!/src-tauri/icons/128x128.png
!/src-tauri/icons/128x128@2x.png
```

- [ ] **Step 2: Write the render test and minimal tooling; observe a meaningful failure.**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx",
    "strict": true, "noEmit": true, "skipLibCheck": true,
    "esModuleInterop": true, "resolveJsonModule": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

`vite.config.ts` and `vitest.config.ts`, respectively:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
});
```

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);
```

`src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";

test("opens the daily view", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "每日待办" })).toBeInTheDocument();
});
```

Run `npm test -- src/app/App.test.tsx`. Expected: failure resolving `./App`, not a
missing test runner. Resolve harness errors before implementing the component.

- [ ] **Step 3: Implement the minimal application entry point.**

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>每日待办</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

`src/app/App.tsx`:

```tsx
export function App() {
  return <main><h1>每日待办</h1></main>;
}
```

- [ ] **Step 4: Verify the web deliverable.**

```bash
npm test -- src/app/App.test.tsx
npm run typecheck
npm run build
```

Expected: one passing render test, no TypeScript diagnostics, and a generated `dist/`.
Do not infer desktop readiness from this result.

- [ ] **Step 5: Commit the independently runnable frontend.**

```bash
git add .gitignore .node-version .npmrc package.json package-lock.json index.html tsconfig.json vite.config.ts vitest.config.ts src/main.tsx src/app/App.tsx src/app/App.test.tsx tests/setup.ts docs/superpowers/specs/2026-09-16-todo-desktop-design.md docs/superpowers/plans/2026-09-16-todo-desktop-scaffold.md
git diff --cached --check
git commit -m "feat: scaffold React application and test harness"
```

## Task 2: Local Dates and Domain Contracts

**Files:** Create `src/domain/local-date.ts`, `src/domain/local-date.test.ts`,
`src/domain/models.ts`, `src/application/task-repository.ts`, and
`src/application/recurrence-expander.ts`.

**Interfaces:**

- Consumes: TypeScript and Vitest from Task 1.
- Produces: `LocalDate`, `asLocalDate(value: string): LocalDate`,
  `localToday(now?: Date): LocalDate`, `addDays(value: LocalDate, days: number): LocalDate`;
  the entity and repository types shown below.

- [ ] **Step 1: Write boundary tests for calendar dates.**

`src/domain/local-date.test.ts`:

```ts
import { expect, test } from "vitest";
import { addDays, asLocalDate, localToday } from "./local-date";

test("rejects malformed and nonexistent dates", () => {
  for (const value of ["2026-02-29", "2026-13-01", "2026-9-1", "0000-01-01", ""]) {
    expect(() => asLocalDate(value)).toThrow(RangeError);
  }
  expect(asLocalDate("2024-02-29")).toBe("2024-02-29");
});

test("moves across month, leap-day, and year boundaries", () => {
  expect(addDays(asLocalDate("2024-02-28"), 1)).toBe("2024-02-29");
  expect(addDays(asLocalDate("2026-03-01"), -1)).toBe("2026-02-28");
  expect(addDays(asLocalDate("2026-12-31"), 1)).toBe("2027-01-01");
  expect(() => addDays(asLocalDate("2026-09-16"), 0.5)).toThrow(RangeError);
});

test("today follows the local calendar near both ends of the day", () => {
  expect(localToday(new Date(2026, 8, 16, 0, 30))).toBe("2026-09-16");
  expect(localToday(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16");
});
```

- [ ] **Step 2: Run the date test and confirm the missing-module failure.**

```bash
npm test -- src/domain/local-date.test.ts
```

- [ ] **Step 3: Implement date-only operations without converting local today to UTC.**

`src/domain/local-date.ts`:

```ts
export type LocalDate = string & { readonly __localDate: unique symbol };

export function asLocalDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new RangeError("Invalid local date");
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid local date");
  }
  return value as LocalDate;
}

export function localToday(now = new Date()): LocalDate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return asLocalDate(`${year}-${month}-${day}`);
}

export function addDays(value: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError("Days must be an integer");
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return asLocalDate(date.toISOString().slice(0, 10));
}
```

UTC is used only to perform arithmetic on an already validated date label. `localToday`
uses local getters; never replace it with `new Date().toISOString().slice(0, 10)`.

- [ ] **Step 4: Define the domain and future application interfaces.**

`src/domain/models.ts`:

```ts
import type { LocalDate } from "./local-date";

export type EntityId = string;
export type UtcInstant = string;
export type TaskStatus = "open" | "completed";
export type Priority = "low" | "normal" | "high";

export interface Project {
  id: EntityId; name: string; createdAt: UtcInstant; updatedAt: UtcInstant;
}
export interface Task {
  id: EntityId; projectId: EntityId | null; parentId: EntityId | null;
  title: string; status: TaskStatus; priority: Priority; dueDate: LocalDate | null;
  completedAt: UtcInstant | null; createdAt: UtcInstant; updatedAt: UtcInstant;
}
export interface DailyEntry {
  id: EntityId; taskId: EntityId; localDate: LocalDate;
  carriedFromDate: LocalDate | null;
}
export type TaskTemplate = Pick<Task, "projectId" | "title" | "priority" | "dueDate">;
export interface RecurrenceRule {
  id: EntityId; template: TaskTemplate; rrule: string; startDate: LocalDate;
  endDate: LocalDate | null; timeZone: string;
}
export interface RecurrenceOccurrence {
  ruleId: EntityId; occurrenceDate: LocalDate; taskId: EntityId;
}
export interface Settings {
  schemaVersion: 1; locale: "zh-CN"; density: "comfortable" | "compact";
}
```

Identifiers are opaque strings (generate UUIDs in the task-creation increment).
`UtcInstant` values are ISO 8601 UTC strings. These declarations are compile-time
contracts, not runtime validation of arbitrary incoming data.

`src/application/task-repository.ts`:

```ts
import type { LocalDate } from "../domain/local-date";
import type { DailyEntry, EntityId, Task, UtcInstant } from "../domain/models";

export interface TaskRepository {
  listDaily(date: LocalDate): Promise<readonly Task[]>;
  listProject(projectId: EntityId): Promise<readonly Task[]>;
  save(task: Task): Promise<void>;
  setCompletion(id: EntityId, completedAt: UtcInstant | null): Promise<Task>;
  schedule(taskId: EntityId, date: LocalDate): Promise<DailyEntry>;
}
```

`setCompletion(id, null)` reopens a task; a non-null instant completes it. `schedule`
returns the existing reference when `(taskId, date)` already exists. No implementation
of these methods is part of this scaffold.

`src/application/recurrence-expander.ts`:

```ts
import type { LocalDate } from "../domain/local-date";
import type { EntityId, RecurrenceRule } from "../domain/models";

export interface OccurrenceCandidate { ruleId: EntityId; date: LocalDate }
export interface RecurrenceExpander {
  expand(
    rule: RecurrenceRule,
    range: { start: LocalDate; end: LocalDate },
  ): readonly OccurrenceCandidate[];
}
```

The future adapter returns sorted, unique candidates within an inclusive local-date
range; `range.start > range.end` is invalid. It does not write tasks or expand free-form
text itself. A maintained recurrence library will be selected in that separate increment.

- [ ] **Step 5: Verify date behavior in both positive and negative UTC offsets.**

```bash
npx cross-env TZ=Asia/Shanghai npm test -- src/domain/local-date.test.ts
npx cross-env TZ=America/New_York npm test -- src/domain/local-date.test.ts
npm run typecheck
```

Expected: all three date tests pass in both timezones. Type-only contracts require no
tests that merely duplicate their property declarations.

- [ ] **Step 6: Commit the domain boundary.**

```bash
git add src/domain src/application/task-repository.ts src/application/recurrence-expander.ts
git diff --cached --check
git commit -m "feat: define local date and task domain contracts"
```

## Task 3: Desktop Host and Transactional SQLite Initialization

**Files:** Create all Task 3 files in the file map, including generated icons and
`src-tauri/src/storage/tests.rs`. Generate, rather than hand-author, `Cargo.lock`.

**Interfaces:**

- Consumes: the frontend build from Task 1 and the entity/date semantics from Task 2.
- Produces: `storage::open_database(path: &Path) -> Result<Connection, StorageError>`,
  `storage::initialize(connection: &mut Connection) -> Result<(), StorageError>`,
  `storage::SCHEMA_VERSION: i64 = 1`, and a standard `todo_desktop_lib::run()` host.
- Database tables: `projects`, `tasks`, `daily_entries`, `recurrence_rules`,
  `recurrence_occurrences`, and `settings`. Snake-case SQL columns map to the camel-case
  domain properties in Task 2 when the future task repository is implemented.

- [ ] **Step 1: Create the native build configuration and application-owned icon.**

`src-tauri/Cargo.toml`:

```toml
[package]
name = "todo-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "todo_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
rusqlite = { version = "0.37", features = ["bundled"] }
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

`src-tauri/build.rs`:

```rust
fn main() { tauri_build::build() }
```

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { todo_desktop_lib::run() }
```

`src-tauri/src/lib.rs`:

```rust
pub mod storage;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Failed to run the desktop application");
}
```

`src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Daily Todo",
  "version": "0.1.0",
  "identifier": "local.todo.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "label": "main", "title": "每日待办", "width": 1040, "height": 760,
      "minWidth": 360, "minHeight": 480
    }],
    "security": {
      "csp": "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'",
      "devCsp": "default-src 'self'; connect-src ipc: http://ipc.localhost http://127.0.0.1:1420 ws://127.0.0.1:1420; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"],
    "windows": { "webviewInstallMode": { "type": "offlineInstaller", "silent": true } }
  }
}
```

The WebView2 offline installer can increase artifact size, but permits installation
without downloading the runtime on the target machine. This is a packaging dependency,
not a network-dependent product feature. The build environment needs network access.
Only the development CSP permits Vite's loopback HTTP/WebSocket connection; it does not
grant external network access to the packaged application.

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-window",
  "description": "Main application window with no plugin privileges",
  "windows": ["main"],
  "permissions": []
}
```

Application commands are registered explicitly in Task 5. Do not add filesystem,
HTTP, shell, updater, or SQL plugins. If the installed Tauri minor release requires an
additional capability for a used API, add only that documented capability and explain it.

`assets/app-icon.svg` (packaging source, not a hand-drawn toolbar icon):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="32" fill="#202421"/>
  <path d="M60 132L106 178L196 78" fill="none" stroke="#72D39B" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

```bash
npm run tauri -- icon assets/app-icon.svg --output src-tauri/icons
```

Review the generated Windows icon and tracked PNGs; unrelated generated platform icons
are ignored by Task 1. Set the application identifier before initial installation and
keep it stable, because it affects the per-user data directory.

- [ ] **Step 2: Write storage tests before the storage module.**

Create `src-tauri/src/storage/tests.rs`:

```rust
use super::{initialize, open_database, StorageError, SCHEMA_VERSION};
use rusqlite::{params, Connection};

fn insert_task(conn: &Connection, id: &str, parent: Option<&str>) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO tasks(id,parent_id,title,status,priority,created_at,updated_at)
         VALUES (?1,?2,'Task','open','normal','2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')",
        params![id, parent],
    )
}

#[test]
fn initializes_once_and_preserves_preferences_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("todo.sqlite");
    {
        let mut conn = open_database(&path).unwrap();
        conn.execute("UPDATE settings SET density='compact' WHERE id=1", []).unwrap();
        initialize(&mut conn).unwrap();
    }
    let conn = open_database(&path).unwrap();
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
    let foreign_keys: i64 = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0)).unwrap();
    let density: String = conn.query_row("SELECT density FROM settings WHERE id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(foreign_keys, 1);
    assert_eq!(density, "compact");
}

#[test]
fn failed_migration_rolls_back_and_preserves_existing_data() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE tasks(id TEXT); INSERT INTO tasks VALUES ('preserve-me');").unwrap();
    assert!(initialize(&mut conn).is_err());
    let existing: String = conn.query_row("SELECT id FROM tasks", [], |r| r.get(0)).unwrap();
    let projects: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='projects'", [], |r| r.get(0)
    ).unwrap();
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
    assert_eq!(existing, "preserve-me");
    assert_eq!(projects, 0);
    assert_eq!(version, 0);
}

#[test]
fn refuses_a_newer_schema_without_downgrading_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "user_version", 2).unwrap();
    assert!(matches!(initialize(&mut conn), Err(StorageError::UnsupportedVersion(2))));
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
    assert_eq!(version, 2);
}

#[test]
fn daily_references_require_a_task_and_cannot_duplicate_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    let sql = "INSERT INTO daily_entries(id,task_id,local_date) VALUES (?1,?2,'2026-09-16')";
    assert!(conn.execute(sql, params!["missing-entry", "missing-task"]).is_err());
    insert_task(&conn, "task-a", None).unwrap();
    conn.execute(sql, params!["entry-a", "task-a"]).unwrap();
    assert!(conn.execute(sql, params!["entry-b", "task-a"]).is_err());
    let count: i64 = conn.query_row("SELECT count(*) FROM daily_entries", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);
}

#[test]
fn prevents_deep_nesting_and_parent_cycles() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    insert_task(&conn, "parent", None).unwrap();
    insert_task(&conn, "child", Some("parent")).unwrap();
    assert!(insert_task(&conn, "grandchild", Some("child")).is_err());
    assert!(conn.execute("UPDATE tasks SET parent_id='child' WHERE id='parent'", []).is_err());
    assert!(conn.execute("UPDATE tasks SET parent_id=id WHERE id='parent'", []).is_err());
}

#[test]
fn one_rule_date_cannot_create_two_occurrences() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    insert_task(&conn, "occurrence-a", None).unwrap();
    insert_task(&conn, "occurrence-b", None).unwrap();
    conn.execute(
        "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone)
         VALUES ('rule-a',?1,'FREQ=DAILY','2026-09-16','Asia/Shanghai')",
        [r#"{"projectId":null,"title":"Task","priority":"normal","dueDate":null}"#],
    ).unwrap();
    let sql = "INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id)
               VALUES ('rule-a','2026-09-16',?1)";
    conn.execute(sql, ["occurrence-a"]).unwrap();
    assert!(conn.execute(sql, ["occurrence-b"]).is_err());
}
```

- [ ] **Step 3: Establish the native red result in a prepared Windows environment.**

```bash
cargo generate-lockfile --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --locked storage::tests
```

Expected: module `storage` is missing. If Rust/MSVC/WebView prerequisites are missing,
record an environment block, not a red test result. Continue independent frontend work
and arrange the native checks through the Windows workflow in Task 6.
The native commit still needs an actually generated `Cargo.lock`; do not skip that file
when deferring compilation to Windows.

- [ ] **Step 4: Implement the initial schema.**

`src-tauri/migrations/001_initial.sql`:

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  status TEXT NOT NULL CHECK(status IN ('open','completed')),
  priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(parent_id IS NULL OR parent_id <> id),
  CHECK((status='open' AND completed_at IS NULL) OR (status='completed' AND completed_at IS NOT NULL)),
  CHECK(due_date IS NULL OR (length(due_date)=10 AND date(due_date,'+0 days') IS due_date AND substr(due_date,1,4) BETWEEN '0001' AND '9999'))
);
CREATE INDEX tasks_project_id ON tasks(project_id);
CREATE INDEX tasks_parent_id ON tasks(parent_id);
CREATE TRIGGER tasks_parent_insert BEFORE INSERT ON tasks
WHEN NEW.parent_id IS NOT NULL AND (
  EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM tasks WHERE parent_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'Only one subtask level is supported'); END;
CREATE TRIGGER tasks_parent_update BEFORE UPDATE OF parent_id ON tasks
WHEN NEW.parent_id IS NOT NULL AND (
  EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM tasks WHERE parent_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'Only one subtask level is supported'); END;
CREATE TABLE daily_entries (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL CHECK(length(local_date)=10 AND date(local_date,'+0 days') IS local_date AND substr(local_date,1,4) BETWEEN '0001' AND '9999'),
  carried_from_date TEXT CHECK(carried_from_date IS NULL OR (length(carried_from_date)=10 AND date(carried_from_date,'+0 days') IS carried_from_date AND carried_from_date < local_date)),
  UNIQUE(task_id, local_date)
);
CREATE INDEX daily_entries_date ON daily_entries(local_date);
CREATE TABLE recurrence_rules (
  id TEXT PRIMARY KEY NOT NULL,
  template_json TEXT NOT NULL CHECK(json_valid(template_json)),
  rrule TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND date(start_date,'+0 days') IS start_date AND substr(start_date,1,4) BETWEEN '0001' AND '9999'),
  end_date TEXT CHECK(end_date IS NULL OR (length(end_date)=10 AND date(end_date,'+0 days') IS end_date AND end_date >= start_date)),
  time_zone TEXT NOT NULL
);
CREATE TABLE recurrence_occurrences (
  rule_id TEXT NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL CHECK(length(occurrence_date)=10 AND date(occurrence_date,'+0 days') IS occurrence_date AND substr(occurrence_date,1,4) BETWEEN '0001' AND '9999'),
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY(rule_id, occurrence_date)
);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  locale TEXT NOT NULL CHECK(locale='zh-CN'),
  density TEXT NOT NULL CHECK(density IN ('comfortable','compact'))
);
INSERT INTO settings(id,schema_version,locale,density) VALUES (1,1,'zh-CN','comfortable');
```

No migration deletes a database, falls back to in-memory storage, or overwrites the
existing file. Runtime validation of recurrence syntax and UTC timestamps belongs to
the task commands that will accept those inputs; no such command exists in this scaffold.

- [ ] **Step 5: Implement the storage module and run native checks.**

`src-tauri/src/storage.rs`:

```rust
use std::path::Path;
use rusqlite::Connection;
use thiserror::Error;

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("Unsupported database schema version: {0}")]
    UnsupportedVersion(i64),
}

pub fn open_database(path: &Path) -> Result<Connection, StorageError> {
    let mut connection = Connection::open(path)?;
    initialize(&mut connection)?;
    Ok(connection)
}

pub fn initialize(connection: &mut Connection) -> Result<(), StorageError> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    let version: i64 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
    match version {
        0 => {
            let tx = connection.transaction()?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            tx.commit()?;
        }
        SCHEMA_VERSION => {}
        other => return Err(StorageError::UnsupportedVersion(other)),
    }
    connection.prepare("SELECT id,title,status,priority FROM tasks LIMIT 0")?;
    connection.prepare("SELECT schema_version,locale,density FROM settings WHERE id=1")?;
    Ok(())
}

#[cfg(test)]
mod tests;
```

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --locked storage::tests
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run build
```

Expected: six native storage tests pass; migrations are repeatable, existing preferences
survive reopen, failed migration is atomic, and uniqueness/foreign keys are enforced.
If native checks remain unavailable locally, mark them pending Windows CI, not passed.

- [ ] **Step 6: Commit the host and storage increment.**

```bash
git add assets/app-icon.svg src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/icons src-tauri/migrations src-tauri/src
git diff --cached --check
git commit -m "feat: add Tauri host and transactional local database"
```

## Task 4: Daily, Project, and Settings Navigation

**Files:** Modify `src/app/App.tsx`, `src/app/App.test.tsx`, `src/main.tsx`, and
`package.json`; create the three feature view files, `src/styles/app.css`,
`playwright.config.ts`, and `tests/e2e/navigation.spec.ts`.

**Interfaces:**

- Consumes: Task 2 `LocalDate`, `localToday`, `addDays`, and `asLocalDate`.
- Produces: `App({ today?: () => LocalDate })`; `DailyView({ date: LocalDate,
  today: LocalDate, onDateChange: (date: LocalDate) => void })`; parameterless
  `ProjectsView()` and `SettingsView()` components.
- No view claims task data was loaded or persisted; there is no TaskRepository adapter yet.

- [ ] **Step 1: Add behavior tests for date navigation and view switching.**

Append to `src/app/App.test.tsx`, retaining the original smoke test and adding these imports:

```tsx
import userEvent from "@testing-library/user-event";
import { asLocalDate } from "../domain/local-date";

test("changes dates and preserves selection when switching views", async () => {
  const user = userEvent.setup();
  render(<App today={() => asLocalDate("2026-09-16")} />);
  const date = screen.getByLabelText("日期");
  expect(date).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("button", { name: "下一天" }));
  expect(date).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("tab", { name: "项目" }));
  expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "每日" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("button", { name: "今天" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("tab", { name: "设置" }));
  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the view test and confirm the missing-controls failure.**

```bash
npm test -- src/app/App.test.tsx
```

- [ ] **Step 3: Implement the three views and accessible navigation.**

`src/features/daily/DailyView.tsx`:

```tsx
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { addDays, asLocalDate, type LocalDate } from "../../domain/local-date";

interface Props {
  date: LocalDate;
  today: LocalDate;
  onDateChange: (date: LocalDate) => void;
}

export function DailyView({ date, today, onDateChange }: Props) {
  return <>
    <h1>每日待办</h1>
    <div className="date-toolbar">
      <button aria-label="上一天" title="上一天" disabled={date === "0001-01-01"}
        onClick={() => onDateChange(addDays(date, -1))}><ArrowLeft aria-hidden="true" /></button>
      <input aria-label="日期" type="date" min="0001-01-01" max="9999-12-31" value={date}
        onChange={(event) => {
          if (event.target.value && event.target.validity.valid) {
            onDateChange(asLocalDate(event.target.value));
          }
        }} />
      <button aria-label="下一天" title="下一天" disabled={date === "9999-12-31"}
        onClick={() => onDateChange(addDays(date, 1))}><ArrowRight aria-hidden="true" /></button>
      <button onClick={() => onDateChange(today)}><CalendarDays aria-hidden="true" />今天</button>
    </div>
    <p className="empty-state">未加载任务</p>
  </>;
}
```

`src/features/projects/ProjectsView.tsx`:

```tsx
export function ProjectsView() {
  return <><h1>项目</h1><p className="empty-state">未加载项目</p></>;
}
```

`src/features/settings/SettingsView.tsx`:

```tsx
export function SettingsView() {
  return <><h1>设置</h1><dl className="settings-list">
    <dt>语言</dt><dd>简体中文</dd>
  </dl></>;
}
```

`src/app/App.tsx`:

```tsx
import { useState, type KeyboardEvent } from "react";
import { CalendarDays, Folder, Settings } from "lucide-react";
import { localToday, type LocalDate } from "../domain/local-date";
import { DailyView } from "../features/daily/DailyView";
import { ProjectsView } from "../features/projects/ProjectsView";
import { SettingsView } from "../features/settings/SettingsView";

const views = [
  { id: "daily", label: "每日", Icon: CalendarDays },
  { id: "projects", label: "项目", Icon: Folder },
  { id: "settings", label: "设置", Icon: Settings },
] as const;
type View = (typeof views)[number]["id"];

export function App({ today = localToday }: { today?: () => LocalDate }) {
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(today);
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % views.length,
      ArrowDown: (index + 1) % views.length,
      ArrowLeft: (index + views.length - 1) % views.length,
      ArrowUp: (index + views.length - 1) % views.length,
      Home: 0, End: views.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setView(views[next].id);
    document.getElementById(`tab-${views[next].id}`)?.focus();
  }
  return <div className="app-shell">
    <aside className="navigation">
      <div className="brand">待办</div>
      <div className="view-tabs" role="tablist" aria-label="视图">
        {views.map(({ id, label, Icon }, index) => <button key={id} id={`tab-${id}`}
          role="tab" aria-selected={view === id} aria-controls={`panel-${id}`}
          tabIndex={view === id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)}
          onClick={() => setView(id)}><Icon aria-hidden="true" />{label}</button>)}
      </div>
    </aside>
    <main>
      <section role="tabpanel" id="panel-daily" aria-labelledby="tab-daily" tabIndex={0} hidden={view !== "daily"}>
        <DailyView date={date} today={today()} onDateChange={setDate} />
      </section>
      <section role="tabpanel" id="panel-projects" aria-labelledby="tab-projects" tabIndex={0} hidden={view !== "projects"}>
        <ProjectsView />
      </section>
      <section role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" tabIndex={0} hidden={view !== "settings"}>
        <SettingsView />
      </section>
    </main>
  </div>;
}
```

The scaffold does not render inactive task-add or save buttons. Read-only shell states
remain truthful even if someone inspects a database seeded outside the application.

- [ ] **Step 4: Style the compact layout and import it from the entry point.**

Append `import "./styles/app.css";` to the imports in `src/main.tsx`.
Create `src/styles/app.css`:

```css
:root { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; color: #242824;
  background: #ffffff; font-size: 14px; letter-spacing: 0; font-synthesis: none; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input { font: inherit; color: inherit; }
button { min-height: 36px; border: 1px solid #d4d9d5; border-radius: 6px;
  background: #ffffff; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; padding: 6px 10px; cursor: pointer; }
button:hover { background: #f0f3f1; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, input:focus-visible, [role="tabpanel"]:focus-visible {
  outline: 2px solid #187a49; outline-offset: 3px; }
svg { width: 18px; height: 18px; flex: 0 0 18px; }
.app-shell { min-height: 100dvh; display: grid; grid-template-columns: 176px minmax(0, 1fr); }
.navigation { padding: 20px 12px; border-right: 1px solid #d4d9d5; background: #f5f6f5; }
.brand { font-size: 20px; font-weight: 650; padding: 0 10px 20px; }
.view-tabs { display: grid; gap: 6px; }
.view-tabs button { justify-content: flex-start; border-color: transparent; background: transparent; }
.view-tabs button[aria-selected="true"] { color: #116b3c; background: #e1f1e7; }
main { min-width: 0; padding: 28px; }
[role="tabpanel"] { min-width: 0; }
h1 { margin: 0 0 24px; font-size: 22px; line-height: 1.3; overflow-wrap: anywhere; }
.date-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.date-toolbar input { width: 156px; max-width: 100%; min-height: 36px;
  border: 1px solid #d4d9d5; border-radius: 6px; padding: 6px; background: #ffffff; }
.date-toolbar button[aria-label] { width: 36px; padding: 0; flex: 0 0 36px; }
.empty-state { margin-top: 32px; padding: 20px 0; border-top: 1px solid #e5e8e5; color: #626862; }
.settings-list { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; }
.settings-list dd { margin: 0; overflow-wrap: anywhere; }
.health-status { margin: 0 0 18px; color: #626862; overflow-wrap: anywhere; }
.health-status[role="alert"] { color: #a32c2c; }
@media (max-width: 600px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
  .navigation { padding: 12px; border-right: 0; border-bottom: 1px solid #d4d9d5; }
  .brand { font-size: 18px; padding: 0 4px 10px; }
  .view-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .view-tabs button { justify-content: center; }
  main { padding: 20px 16px; }
}
```

- [ ] **Step 5: Add browser behavior and viewport checks.**

Add `"test:e2e": "playwright test"` to `package.json` scripts. Create
`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:1420", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://127.0.0.1:1420", reuseExistingServer: false },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "narrow", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
```

`tests/e2e/navigation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("date navigation and three views fit the viewport", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("日期", { exact: true }).fill("2026-09-16");
  await page.getByRole("button", { name: "下一天" }).click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue("2026-09-17");
  await page.getByRole("button", { name: "上一天" }).click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue("2026-09-16");
  for (const [tab, heading, screenshot] of [
    ["每日", "每日待办", "daily.png"], ["项目", "项目", "projects.png"], ["设置", "设置", "settings.png"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
  }
  await page.getByRole("tab", { name: "每日", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "项目", exact: true })).toBeFocused();
});
```

```bash
npm test -- src/app/App.test.tsx
npm run build
npx playwright install chromium
npm run test:e2e
```

Review all six screenshots, including button labels and date controls, for clipping or
overlap. Screenshot existence alone is not visual verification. The test server closes
when Playwright completes; do not terminate an unrelated process using port 1420.
If the port is occupied, select a free port and change the test URL/command together.

- [ ] **Step 6: Commit the navigable application shell.**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/main.tsx src/features src/styles package.json playwright.config.ts tests/e2e/navigation.spec.ts
git diff --cached --check
git commit -m "feat: add daily project and settings navigation"
```

## Task 5: Desktop Health Command and Visible Storage Failures

**Files:** Create `src/application/health.ts`, `src/infrastructure/tauri-health.ts`,
`src/infrastructure/tauri-health.test.ts`, `src/app/useHealth.ts`, and
`src-tauri/src/commands.rs`; modify `src-tauri/src/lib.rs`, `src/app/App.tsx`, and
`src/app/App.test.tsx`.

**Interfaces:**

- Consumes: Task 3 `open_database`, `SCHEMA_VERSION`, and Tauri configuration;
  Task 4 `App({ today?: () => LocalDate })`.
- Produces: `HealthReport = { schemaVersion: 1; databaseReady: true }`,
  `HealthCheck = () => Promise<HealthReport>`, `checkHealth: HealthCheck`,
  `useHealth(check: HealthCheck): HealthState`, and `App({ today?, getHealth? })`.
- IPC command: `health_check` has no parameters and returns the exact camel-case
  `HealthReport` shape, or `{ code: "database_unavailable", message: string }` as an error.
- Rust state: `DatabaseState { connection: Mutex<Option<Connection>> }`.
  Failed startup is represented by `None`, never an empty replacement database.

- [ ] **Step 1: Write frontend boundary and failure-state tests.**

`src/infrastructure/tauri-health.test.ts`:

```ts
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => mocks);
import { checkHealth } from "./tauri-health";

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReset().mockReturnValue(true);
});

test("uses the registered IPC command and validates its response", async () => {
  mocks.invoke.mockResolvedValue({ schemaVersion: 1, databaseReady: true });
  await expect(checkHealth()).resolves.toEqual({ schemaVersion: 1, databaseReady: true });
  expect(mocks.invoke).toHaveBeenCalledWith("health_check");
});

test("a browser preview cannot report a connected database", async () => {
  mocks.isTauri.mockReturnValue(false);
  await expect(checkHealth()).rejects.toThrow("desktop_required");
  expect(mocks.invoke).not.toHaveBeenCalled();
});

test("rejects invalid IPC payloads and propagates native failures", async () => {
  mocks.invoke.mockResolvedValue({ schemaVersion: 2, databaseReady: true });
  await expect(checkHealth()).rejects.toThrow("invalid_health_response");
  mocks.invoke.mockRejectedValue({ code: "database_unavailable", message: "Cannot open database" });
  await expect(checkHealth()).rejects.toMatchObject({ code: "database_unavailable" });
});
```

In `src/app/App.test.tsx`, add these tests. Change the original render test to `async`
and await the ready status using an injected successful `getHealth`. In the navigation
test, inject that same constant and await readiness before interacting, so effects do
not create unobserved updates after test completion.

```tsx
import type { HealthCheck } from "../application/health";

const ready: HealthCheck = async () => ({ schemaVersion: 1, databaseReady: true });

test("shows a successful native connection", async () => {
  render(<App getHealth={ready} />);
  expect(await screen.findByText("本地数据已连接")).toBeInTheDocument();
});

test("surfaces storage failures instead of displaying success", async () => {
  const failed: HealthCheck = async () => { throw { code: "database_unavailable" }; };
  render(<App getHealth={failed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("本地数据无法打开");
  expect(screen.queryByText("本地数据已连接")).not.toBeInTheDocument();
});
```

The resulting original test body is:

```tsx
test("opens the daily view", async () => {
  render(<App getHealth={ready} />);
  expect(screen.getByRole("heading", { name: "每日待办" })).toBeInTheDocument();
  await screen.findByText("本地数据已连接");
});
```

The navigation test's render and readiness lines become:

```tsx
render(<App today={() => asLocalDate("2026-09-16")} getHealth={ready} />);
await screen.findByText("本地数据已连接");
```

- [ ] **Step 2: Confirm the frontend tests fail before creating the health implementation.**

```bash
npm test -- src/infrastructure/tauri-health.test.ts src/app/App.test.tsx
```

Expected: missing health implementation or absent status UI; no native test is required
for this frontend red result.

- [ ] **Step 3: Implement the typed command client and connection-state hook.**

`src/application/health.ts`:

```ts
export interface HealthReport { schemaVersion: 1; databaseReady: true }
export type HealthCheck = () => Promise<HealthReport>;
export type HealthState =
  | { phase: "loading" }
  | { phase: "ready"; report: HealthReport }
  | { phase: "unavailable"; desktopRequired: boolean };
```

`src/infrastructure/tauri-health.ts`:

```ts
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { HealthCheck } from "../application/health";

export const checkHealth: HealthCheck = async () => {
  if (!isTauri()) throw new Error("desktop_required");
  const value: unknown = await invoke("health_check");
  if (typeof value !== "object" || value === null ||
      !("schemaVersion" in value) || value.schemaVersion !== 1 ||
      !("databaseReady" in value) || value.databaseReady !== true) {
    throw new Error("invalid_health_response");
  }
  return { schemaVersion: 1, databaseReady: true };
};
```

`src/app/useHealth.ts`:

```ts
import { useEffect, useState } from "react";
import type { HealthCheck, HealthState } from "../application/health";

export function useHealth(check: HealthCheck): HealthState {
  const [state, setState] = useState<HealthState>({ phase: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    check().then(
      (report) => { if (!cancelled) setState({ phase: "ready", report }); },
      (error: unknown) => {
        if (!cancelled) setState({
          phase: "unavailable",
          desktopRequired: error instanceof Error && error.message === "desktop_required",
        });
      },
    );
    return () => { cancelled = true; };
  }, [check]);
  return state;
}
```

In `src/app/App.tsx` add these imports and replace the function signature. Keep the
navigation and date state from Task 4:

```tsx
import type { HealthCheck } from "../application/health";
import { checkHealth } from "../infrastructure/tauri-health";
import { useHealth } from "./useHealth";

export function App({ today = localToday, getHealth = checkHealth }: {
  today?: () => LocalDate;
  getHealth?: HealthCheck;
}) {
```

Inside `App`, before its return, add `const health = useHealth(getHealth);`. Immediately
inside the existing `<main>`, before the tab panels, insert:

```tsx
<p className="health-status" role={health.phase === "unavailable" && !health.desktopRequired ? "alert" : "status"}>
  {health.phase === "loading" ? "正在连接本地数据" :
    health.phase === "ready" ? "本地数据已连接" :
    health.desktopRequired ? "未连接本地数据" : "本地数据无法打开。已有文件已保留。"}
</p>
```

The browser preview deliberately displays the disconnected state. It does not simulate
SQLite with localStorage or silently create an in-memory TaskRepository.

- [ ] **Step 4: Write native health tests and confirm a red result.**

Create `src-tauri/src/commands.rs` initially with this test module; add `mod commands;`
to `lib.rs` so Cargo compiles it:

```rust
#[cfg(test)]
mod tests {
    use super::{read_health, DatabaseState};
    use crate::storage;
    use rusqlite::Connection;
    use std::sync::Mutex;

    #[test]
    fn reports_initialized_storage() {
        let mut connection = Connection::open_in_memory().unwrap();
        storage::initialize(&mut connection).unwrap();
        let state = DatabaseState { connection: Mutex::new(Some(connection)) };
        let report = read_health(&state).unwrap();
        assert_eq!(report.schema_version, 1);
        assert!(report.database_ready);
    }

    #[test]
    fn failed_startup_does_not_report_ready() {
        let state = DatabaseState { connection: Mutex::new(None) };
        let error = read_health(&state).unwrap_err();
        assert_eq!(error.code, "database_unavailable");
    }
}
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml --locked commands::tests
```

Expected: unresolved `read_health` and `DatabaseState`. Follow the environment-boundary
rule from Task 3 if native compilation is unavailable.

- [ ] **Step 5: Register the real command and open the per-user database.**

Prepend the production code below to `src-tauri/src/commands.rs`, retaining its tests:

```rust
use std::sync::Mutex;
use rusqlite::Connection;
use serde::Serialize;
use crate::storage::SCHEMA_VERSION;

pub struct DatabaseState {
    pub connection: Mutex<Option<Connection>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub schema_version: i64,
    pub database_ready: bool,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: &'static str,
}

fn unavailable() -> CommandError {
    CommandError {
        code: "database_unavailable",
        message: "本地数据无法打开。已有文件已保留。",
    }
}

fn read_health(state: &DatabaseState) -> Result<HealthReport, CommandError> {
    let guard = state.connection.lock().map_err(|_| unavailable())?;
    let connection = guard.as_ref().ok_or_else(unavailable)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| unavailable())?;
    if version != SCHEMA_VERSION { return Err(unavailable()); }
    connection.query_row("SELECT id FROM settings WHERE id=1", [], |row| row.get::<_, i64>(0))
        .map_err(|_| unavailable())?;
    Ok(HealthReport { schema_version: version, database_ready: true })
}

#[tauri::command]
pub fn health_check(state: tauri::State<'_, DatabaseState>) -> Result<HealthReport, CommandError> {
    read_health(state.inner())
}
```

Replace `src-tauri/src/lib.rs` with:

```rust
mod commands;
pub mod storage;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let result = (|| -> Result<rusqlite::Connection, Box<dyn std::error::Error>> {
                let directory = app.path().app_data_dir()?;
                std::fs::create_dir_all(&directory)?;
                Ok(storage::open_database(&directory.join("todo.sqlite"))?)
            })();
            if let Err(error) = &result {
                eprintln!("Database initialization failed: {error}");
            }
            app.manage(commands::DatabaseState { connection: Mutex::new(result.ok()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::health_check])
        .run(tauri::generate_context!())
        .expect("Failed to run the desktop application");
}
```

A directory/permission/migration failure still permits the window to open and display
the health error. No application code receives broad filesystem access; only the Rust
backend resolves the app-data path. Do not include paths or database contents in IPC errors.

- [ ] **Step 6: Verify boundary tests and a real native command round trip.**

```bash
npm test -- src/infrastructure/tauri-health.test.ts src/app/App.test.tsx
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run test:e2e
```

On prepared Windows run `npm run tauri -- dev`. Verify the actual desktop window shows
`本地数据已连接`; browser mock tests do not establish this. Exit and reopen; the same
app-data database remains in place. Close the dev session before continuing.

Check offline startup with the installed artifact in Task 7. Do not corrupt an existing
user database for manual testing; migration-failure tests use temporary databases only.

- [ ] **Step 7: Commit the connected desktop shell.**

```bash
git add src/application/health.ts src/infrastructure src/app/App.tsx src/app/App.test.tsx src/app/useHealth.ts src-tauri/src/commands.rs src-tauri/src/lib.rs
git diff --cached --check
git commit -m "feat: connect desktop health and surface local storage failures"
```

## Task 6: Windows Build Automation and Developer Documentation

**Files:** Create `.github/workflows/checks.yml`, `.github/workflows/windows-build.yml`,
`README.md`, `docs/architecture.md`, and `docs/verification.md`.

**Interfaces:**

- Consumes: npm scripts, both lockfiles, native tests, icons, and health UI from Tasks 1-5.
- Produces: automatic validation on push/PR; a manually requested unsigned Windows x64
  NSIS installer artifact; precise developer and verification documentation.
- This task adds no GitHub Release, telemetry, signing secret, or updater functionality.

- [ ] **Step 1: Define the automatic check workflow.**

Create `.github/workflows/checks.yml`:

```yaml
name: Checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx cross-env TZ=Asia/Shanghai npm test -- src/domain/local-date.test.ts
      - run: npx cross-env TZ=America/New_York npm test -- src/domain/local-date.test.ts
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: browser-verification
          path: test-results/
          if-no-files-found: ignore
          retention-days: 7
  native:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - run: npm ci
      - run: npm run build
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo test --manifest-path src-tauri/Cargo.toml --locked
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
```

Hosted CI may install browser system dependencies on its disposable runner. This is not
permission to alter the user's host environment. Rust unit tests verify database and
command functions, not a real WebView-to-Rust round trip.

- [ ] **Step 2: Define the installer workflow with explicit manual invocation.**

Create `.github/workflows/windows-build.yml`:

```yaml
name: Windows Installer
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  windows-installer:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - run: node --version
      - run: rustc --version
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo test --manifest-path src-tauri/Cargo.toml --locked
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
      - run: npm run tauri -- build --bundles nsis -- --locked
      - uses: actions/upload-artifact@v4
        with:
          name: todo-desktop-windows-x64
          path: src-tauri/target/release/bundle/nsis/*.exe
          if-no-files-found: error
          retention-days: 14
```

Use Windows x64 only for the first artifact; do not imply ARM64 coverage. The workflow
fails if no installer is produced. `-- --locked` forwards Cargo's lockfile flag through
the Tauri CLI. Verify this invocation with the installed CLI's `build --help` at execution.

- [ ] **Step 3: Write the README and architecture documentation.**

Create `README.md` with this content:

```markdown
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
```

Create `docs/architecture.md` with this content:

```markdown
# Architecture

The selected stack is Tauri 2, React/TypeScript, and SQLite. The application is a
standalone offline Windows tool. The referenced Obsidian Tasks project is inspiration
only; there is no plugin host, account service, remote database, or synchronization layer.

## Implemented Boundary

React owns navigation and calendar selection. The application layer defines task,
recurrence, and health contracts. The infrastructure layer invokes only `health_check`.
Rust resolves the per-user application-data path, initializes SQLite transactionally,
and returns a validated health response. The JavaScript frontend has no filesystem,
shell, SQL-plugin, or network capability.

## Data Model

Projects group canonical Tasks. DailyEntries reference tasks by identifier and enforce
uniqueness by task and local date. Project and daily completion will therefore refer to
the same local status, not to synchronization across servers or devices. Parent/child
tasks have independent completion state and at most one subtask level.

RecurrenceRules and RecurrenceOccurrences reserve the persisted structure required by
the specification. Actual recurrence expansion, task mutations, completion, and daily
carryover are outside this scaffold. TaskRepository and RecurrenceExpander are interfaces
without a runtime adapter. Do not claim that their workflows are already implemented.

Calendar dates are validated YYYY-MM-DD labels. Local today uses local calendar fields;
UTC instants are used for audit timestamps. Database schema version 1 is transactionally
initialized and rejects unsupported versions without replacing the existing database.

## Failure and Preview States

Storage initialization failure keeps the desktop window usable and exposes a visible
error through the health boundary. Failed storage is not replaced with an empty database.
Browser preview reports no local-data connection and does not simulate persistent saves.

The source specification and implementation plan are stored under `docs/superpowers/`.
```

- [ ] **Step 4: Create the verification ledger and run the final local checks.**

Create `docs/verification.md` with the following initial ledger. Replace each status
with actual evidence as the relevant check runs; never prefill `PASS` from this plan.

```markdown
# Verification Record

Scope: first executable scaffold, not complete task-management workflows.

| Check | Required evidence | Status |
| --- | --- | --- |
| Frontend unit tests and type check | Commands, exit codes, Node version, tested source revision | Not run |
| Frontend build | Successful command and generated dist directory | Not run |
| Local-date timezone behavior | Tests in Asia/Shanghai and America/New_York | Not run |
| Browser navigation and layout | Desktop/narrow screenshots inspected, no overlap or overflow | Not run |
| Native database and health tests | Windows Cargo output, Rust version, tested source revision | Not run |
| Actual desktop IPC | Native window shows connected local data after health_check | Not run |
| Offline startup and reopen | Installed Windows app starts offline, same database retained | Not run |
| Windows package | Successful workflow URL and installer artifact | Not run |
| GitHub delivery | Repository URL, pushed commit, matching remote revision | Not run |

Failures and environment blocks must be recorded explicitly. A workflow marked running
or an artifact produced before the tested revision does not satisfy a passing check.
```

Run the checks appropriate to the available environment:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Native checks are the Task 5 Cargo commands. Do not manufacture a local native result
on a machine without its prerequisites. Record missing Windows GUI access separately
from successful hosted compilation. No unit tests are added for static README wording.

- [ ] **Step 5: Review workflow configuration and commit delivery tooling.**

Check that workflow paths match the repository, npm and Cargo use tracked lockfiles,
only manual workflow dispatch builds an installer, and `contents: read` suffices.
Use an installed YAML parser or actionlint if available; do not install tooling merely
to count a check as passed. The actual workflow run in Task 7 is the decisive validation.

```bash
git add .github/workflows/checks.yml .github/workflows/windows-build.yml README.md docs/architecture.md docs/verification.md
git diff --cached --check
git commit -m "ci: verify frontend and Windows builds"
```

## Task 7: Publish the Source and Verify the Windows Artifact

**Files:** Modify `docs/verification.md` with real evidence. Git remotes and repository
metadata are external delivery state, not application features.

**Interfaces:**

- Consumes: committed Tasks 1-6, a tracked `Cargo.lock`, GitHub authentication, and an
  agreed destination. The source document's reference repository is not the destination.
- Produces: repository URL, uploaded source revision, completed check/build runs, installer
  artifact link, and an honest list of any remaining Windows GUI verification gaps.

- [ ] **Step 1: Resolve delivery inputs without blocking independent local work.**

At execution time inspect authentication and any existing remote:

```bash
gh auth status
git remote -v
git status --short
```

If authentication is still absent, use the user's normal browser flow:

```bash
gh auth login --hostname github.com --git-protocol https --web
```

Do not ask for a token in chat or display credential files. Resolve the missing owner,
repository name, and visibility with the user when necessary. The proposed default is
`todo-desktop` as a private repository under the authenticated account. This is a delivery
input, not a request to authorize application login or to reauthorize the user's upload request.

- [ ] **Step 2: Inspect tracked files and create or attach the correct repository.**

```bash
git ls-files
git diff --cached --check
gh api user --jq .login
```

Verify that source, both lockfiles, icons, and documentation are tracked; no database,
credential, dependency directory, build output, or original Word document is tracked.

If the user accepts the proposed new private repository and no existing repository
conflicts with that name, run:

```bash
gh repo create todo-desktop --private --source . --remote origin --push
```

For an existing destination, inspect it before linking/pushing. Obtain its literal clone
URL and use that URL as the argument to `git remote add origin`; do not guess a different
owner, rewrite history, or force-push. If it already has history, preserve it and reconcile
through a branch or ordinary merge appropriate to the existing repository.
The commands below target the proposed new repository's `main` branch. For an existing
repository, inspect `gh repo view --json defaultBranchRef` and consistently use its agreed
delivery branch instead of assuming `main`.

- [ ] **Step 3: Trigger and verify builds for the uploaded revision.**

```bash
git rev-parse HEAD
gh repo view --json nameWithOwner,visibility,url
gh workflow run windows-build.yml --ref main
gh run list --branch main --limit 10 --json databaseId,workflowName,headSha,status,conclusion,url
```

For each matching source revision, use its numeric `databaseId` as the argument to
`gh run view` to inspect status and logs. Continue monitoring until Checks and Windows
Installer have completed. Capture failure logs and fix the source/configuration before
retrying. Never report a queued or in-progress workflow as a successful build.

Use `gh run download` with the verified installer run's numeric identifier and
`--name todo-desktop-windows-x64 --dir /tmp/todo-desktop-installer` on the Linux workspace.
On Windows select a temporary output directory instead. Verify that the artifact contains
an `.exe` from that run; artifact existence does not prove the application starts.

- [ ] **Step 4: Complete native GUI/offline verification where Windows is available.**

On a Windows test environment, install the unsigned artifact through the normal installer
UI, with network access disabled for the offline check. Do not change the user's network
configuration remotely or bypass Windows protections automatically.

Verify these actions in order:

1. Launch the app; the daily view opens without registration, login, or a network prompt.
2. The actual desktop window displays `本地数据已连接`.
3. Change the date and switch daily/project/settings views; navigation remains functional.
4. Close and reopen the app; the same per-user `todo.sqlite` file is retained.
5. Check the desktop window at its minimum supported width; text and controls fit.

If no Windows GUI is accessible, record these specific checks as pending and hand over
the installer plus the verified CI results. Do not claim the full acceptance list passed.

- [ ] **Step 5: Record delivery evidence, push it, and check the remote revision.**

Update `docs/verification.md` with actual commands, tested commit identifiers, workflow
URLs, artifact identity, screenshot review, and any pending GUI checks. A documentation-only
evidence commit may follow the tested app commit; state both identifiers and do not imply
that an earlier binary contains the later documentation revision.

```bash
git add docs/verification.md
git diff --cached --check
git commit -m "docs: record scaffold delivery verification"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status --short
```

Expected: local and remote `main` identifiers match, no unexpected local changes remain,
and the repository URL and verification record are ready to return to the user.
Check any automatically triggered validation for the evidence commit before claiming
all checks on the latest revision passed; rebuilding an unchanged installer is unnecessary.

## Spec Coverage and Self-Review

| Spec requirement | Implementation or explicit scope boundary |
| --- | --- |
| Selected standalone Tauri/React/SQLite architecture | Tasks 1, 3, 5; no server or plugin host |
| Daily/project/settings views and compact Chinese UI | Task 4; Task 5 truthful connection states |
| Task, hierarchy, project, daily-entry, recurrence and settings contracts | Task 2; initial persistence constraints in Task 3 |
| Dates unaffected by UTC conversion | Task 2 tests in both positive and negative UTC offsets |
| Local data, transactional migration, no destructive recovery | Task 3 tests and Task 5 visible startup errors |
| Frontend/backend connection | Task 5 mocked boundary tests plus separate actual native round trip |
| Reproducible dependency resolution | Tasks 1 and 3 tracked lockfiles; Task 6 locked CI |
| Windows installer and offline first launch | Tasks 3, 6, 7; offline WebView2 packaging |
| No login, synchronization, remote data, or dependency on Obsidian | Global constraints; Tasks 3, 5, 6 |
| Documentation and GitHub delivery | Tasks 6 and 7 |
| Full editing/completion/carryover/recurrence workflows | Outside the first scaffold, explicitly identified in the spec and README |

Task dependencies: `1 -> 2`; `1 + 2 -> 3`; `1 + 2 -> 4`; `3 + 4 -> 5`;
`1-5 -> 6`; `6 + authenticated destination -> 7`. Native environment preparation can
proceed while Task 4's frontend work runs, but the desktop deliverable is not complete
until its native checks have actual evidence.

Self-review before handoff:

- Confirm every created/modified file appears in a task and the file map.
- Confirm `health_check`, `schemaVersion`, `databaseReady`, `getHealth`, and `SCHEMA_VERSION`
  have the same names and types across native code, TypeScript, tests, and documentation.
- Confirm recurrence and task-storage interfaces are not presented as working adapters.
- Confirm no credential, cloud feature, public release, or unrequested full product
  implementation has entered the scaffold plan.
- Confirm plan checkboxes remain unchecked until the corresponding execution evidence exists.
