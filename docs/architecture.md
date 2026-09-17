# Architecture

The selected stack is Tauri 2, React/TypeScript, and SQLite. The application is a
standalone offline Windows tool. The referenced Obsidian Tasks project is inspiration
only; there is no plugin host, account service, remote database, or synchronization layer.

## Implemented Boundary

React owns navigation, task editing and presentation. `WorkspaceRepository` defines
the snapshot and mutation contract; the desktop adapter invokes `load_workspace` and
`mutate_workspace`. Rust owns validation and SQLite transactions and returns committed
snapshots. The frontend has no filesystem, shell, SQL-plugin or network capability.

## Data Model

Projects group canonical Tasks. DailyEntries reference tasks by identifier and enforce
uniqueness by task and local date. Project and daily completion refer to
the same local status, not to synchronization across servers or devices. Parent/child
tasks have independent completion state and at most one subtask level.

Task.scheduledDate stores the active plan separately from historical DailyEntries.
Clearing it keeps history but excludes the task from later carryover. New children
inherit their parent's active date when created without a date; subsequent edits are
explicit. Carryover advances the active date and appends a historical reference.

The `rrule` adapter expands date-only rules. A persisted generation cursor and unique
occurrence constraint make retries idempotent and prevent deleted occurrences from
being regenerated. Native transactions materialize occurrences and advance the cursor
together. Monthly rules follow RFC behavior and skip nonexistent month days.

The React workspace hook serializes reads/mutations and performs recurrence generation
and carryover at startup, resume and day rollover. Browsing another date generates
recurrences through that date but never carries tasks into a historical date. Open tasks
with older schedules are carried by reference; explicit future scheduling takes priority.

Calendar dates are validated YYYY-MM-DD labels. Local today uses local calendar fields;
UTC instants are used for audit timestamps. Versioned database migrations run
transactionally and reject unsupported versions without replacing the database.

## Failure and Preview States

Storage initialization failure keeps the desktop window usable and exposes a visible
error through the workspace boundary. Failed storage is not replaced with an empty database.
Browser preview uses a separate explicitly labelled in-memory adapter. That adapter is
never a fallback for a failed desktop operation, and its data does not survive reload.

The source specification and implementation plan are stored under `docs/superpowers/`.
