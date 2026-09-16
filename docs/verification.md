# Verification Record

Scope: first executable scaffold, not complete task-management workflows.

| Check | Required evidence | Status |
| --- | --- | --- |
| Frontend unit tests and type check | `npm test` (9 tests), `npm run typecheck`; Node v24.16.0; source `8aca8ee` plus Task 6 changes | PASS |
| Frontend build | `npm run build` exit 0; generated `dist/` assets | PASS |
| Local-date timezone behavior | Asia/Shanghai and America/New_York targeted tests, 3 tests each | PASS |
| Browser navigation and layout | `npm run test:e2e` with desktop and narrow projects; 2 passed | PASS |
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
approvals for `esbuild@0.28.2` and `fsevents@2.3.3`. Local `cargo fmt --check` could not
run because the supplied isolated Rust toolchain has no rustfmt component; the affected
Rust sources were formatted to the stable rustfmt layout manually. Windows Cargo tests,
clippy, native IPC, offline reopen, packaging, and GitHub delivery remain unverified here.
