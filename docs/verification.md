# Verification Record

Scope: first executable scaffold, not complete task-management workflows.

| Check | Required evidence | Status |
| --- | --- | --- |
| Frontend unit tests and type check | `npm test` (10 tests), including 4 App tests; Node v24.16.0 | PASS |
| Frontend build | `npm run build` exit 0; generated `dist/` assets | PASS |
| Local-date timezone behavior | Asia/Shanghai and America/New_York targeted tests, 3 tests each | PASS |
| Today button date freshness | Date provider changed while App remained mounted; click selected the updated date | PASS |
| Browser navigation and layout | `npm run test:e2e` with desktop and narrow projects; 2 passed | PASS |
| Rust formatting | Isolated toolchain `cargo fmt --manifest-path src-tauri/Cargo.toml --check` exit 0 | PASS |
| Native database and health tests | Windows Cargo output, Rust version, tested source revision | Pending Windows runner |
| Actual desktop IPC | Native window shows connected local data after health_check | Not run |
| Offline startup and reopen | Installed Windows app starts offline, same database retained | Not run |
| Windows package | Successful workflow URL and installer artifact | Pending manual workflow |
| GitHub delivery | Repository URL, pushed commit, matching remote revision | Pending parent delivery |

Failures and environment blocks must be recorded explicitly. A workflow marked running
or an artifact produced before the tested revision does not satisfy a passing check.

## Local Evidence

This ledger is updated only with commands executed against the current source revision.
Hosted Windows compilation, desktop IPC, offline reopen, installer packaging, and GitHub
delivery remain pending until their required environments and workflow run are available.

The local environment has Node.js 24 and npm 11.17.0. Native GUI dependencies for Linux
are unavailable, so no local Windows or desktop-native result is claimed.

`npm ci` passed with the strict npm 11.17 install-script policy after recording pinned
approvals for `esbuild@0.28.2` and `fsevents@2.3.3`. The Today-button regression was
observed failing with the stale `2026-09-16` render-time value, then passing with the
click-time `2026-09-17` value; the complete frontend suite passes 10 tests. The isolated
Rust toolchain now includes rustfmt, and `cargo fmt --check` passes after formatting the
affected Rust sources. Windows Cargo tests, clippy, native IPC, offline reopen, packaging,
and GitHub delivery remain unverified here.
