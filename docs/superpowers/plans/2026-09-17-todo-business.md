# Todo Business Implementation

Approved stack and semantics: ../specs/2026-09-16-todo-desktop-design.md.
The user requested usable todo workflows and a quieter interface. On September 17,
they clarified that installed size is satisfactory: retain offline WebView2 packaging.

## Constraints

- Offline Tauri 2, React/TypeScript and SQLite; no account, network service or sync.
- Preserve the existing database and transactional failure behavior.
- Hide successful database health details. Surface actual read/write failures.
- Daily/project views share tasks. One child level, independent completion.
- Carry open work across missed days without copying tasks or overriding deferral.
- Use rrule for recurrence; persist generation cursors and unique occurrences.
- Browser development uses explicitly labelled temporary demonstration data only.
- Keep the original installer; deliver version 0.2.0 in the repository root.

## Tasks

1. Implement SQLite workspace commands, validated mutations, migration and regression
   tests (CRUD, shared status, hierarchy, carryover, recurrence cursor/idempotency,
   failed writes, reopen persistence). Review backend before delivery.
2. Implement the typed client and rrule adapter, serialized maintenance on startup,
   focus/visibility/day changes, and focused date/recurrence/client tests.
3. Replace placeholders with compact usable daily/project/settings views: task editor,
   priority/due date/scheduling, completion, one-level subtasks/progress, project
   management, recurrence management, search/filter, saved density and errors.
   Review the complete integration and address concrete defects.
4. Validate typecheck, unit tests, build, desktop/narrow browser workflows and Windows
   native checks. Commit and push, build Windows installer and download it to root.

## Evidence Boundaries

Browser tests exercise UI and a test-only bridge; Rust tests exercise real SQLite.
Windows CI verifies native compilation/tests/packaging. A real Windows GUI session
and offline installed-app reopen remain manual checks if no Windows desktop is available.
