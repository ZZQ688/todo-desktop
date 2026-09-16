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

## Local Evidence

This ledger is updated only with commands executed against the current source revision.
Hosted Windows compilation, desktop IPC, offline reopen, installer packaging, and GitHub
delivery remain pending until their required environments and workflow run are available.

The local environment has Node.js 24 and npm 11.17.0. Native GUI dependencies for Linux
are unavailable, so no local Windows or desktop-native result is claimed.
