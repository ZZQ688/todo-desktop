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
