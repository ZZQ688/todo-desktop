# Version 0.2.0 Verification

Application source: `a8d0848` (includes business implementation `1e39a92` and
recovery/form fix `bfc9077`). Source is on private repository
[ZZQ688/todo-desktop](https://github.com/ZZQ688/todo-desktop), branch `main`.

Implemented: persistent task/project CRUD, shared completion, independent subtasks,
priority and due dates, scheduling/unscheduling, missed-day carryover, recurrence
generation and stopping, search/status filters, and saved density preferences.
Database schema 2 migrates existing data transactionally. The application has no
accounts or network service. Browser preview uses labelled temporary memory data.

## Local Evidence

- Frontend typecheck and production build passed; 25 tests across 6 files passed.
- Date and recurrence tests passed under Asia/Shanghai and America/New_York.
- Six Playwright workflows passed across desktop 1280 x 800 and narrow 390 x 844
  before the final error/form fixes. Screenshots showed no overlapping content.
- Real storage/workspace Rust modules passed 21 SQLite tests in a temporary
  standalone harness, including file reopen, rollback, migrations, completion,
  deferral, unscheduling, child inheritance, recurrence cursors and wire format.
- Rust formatting passed on final source. Full local Tauri tests are blocked by
  missing Linux libdbus development libraries; Windows checks provide native evidence.
- The final startup-retry test is part of Windows CI, not the storage-only harness.

## Hosted Evidence

Final application source `a8d0848` passed Checks
[35236711726](https://github.com/ZZQ688/todo-desktop/actions/runs/35236711726)
and [35236711684](https://github.com/ZZQ688/todo-desktop/actions/runs/35236711684).
These include frontend tests/build, six browser workflows and Windows native
formatting/tests/Clippy. Windows Installer
[35236806653](https://github.com/ZZQ688/todo-desktop/actions/runs/35236806653)
completed successfully for `a8d0848`, including native tests/Clippy, NSIS packaging
and artifact upload. The artifact name is `todo-desktop-windows-x64`.

The downloaded `Daily Todo_0.2.0_x64-setup.exe` is saved in the repository root:
218,201,308 bytes, SHA-256
`e4e8728da0dcc604289d5a58bf92852671ce637a800b47e69622aea09d18597c`.
Its hash matches the downloaded artifact; file inspection identifies an NSIS Windows
installer. The older 0.1.0 installer remains alongside it. This documentation follows
the tested application revision and does not change the binary's source revision.

## Manual Windows Acceptance

CI compilation and packaging do not establish GUI behavior. No Windows desktop was
available in this Linux session, so these remain unverified:

- Install the unsigned NSIS package, launch offline and create tasks.
- Complete tasks in daily/project views, then close/reopen and confirm retention.
- Upgrade an existing 0.1.0 installation and confirm the data file is retained.
- Inspect the native window at its minimum 360 x 480 dimensions.

The installer embeds WebView2 offline resources at the user's request; its roughly
208 MiB download size is not the installed application's size. Old 0.1.0 artifacts
are preserved, and installer binaries are ignored by Git.
