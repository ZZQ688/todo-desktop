# Verification Record

Scope: first executable scaffold, not complete task-management workflows.

This is the handover record for source revision
`c51b42e9119067da0a767a3d7b1e54c08f408f69`.

## Verification Summary

| Check | Evidence | Status |
| --- | --- | --- |
| Frontend unit tests and type check | Node v24.16.0, npm 11.17.0; 10 tests in 3 files | PASS |
| Frontend build | Production build completed successfully | PASS |
| Local-date timezone behavior | Revision `9999411`; Asia/Shanghai and America/New_York, 3 tests in each timezone; date helpers are unchanged at `c51b42e` | PASS |
| Today button date freshness | Regression coverage confirms the date is read when the button is clicked | PASS |
| Browser navigation and layout | Desktop 1280 x 800 and narrow 390 x 844 projects; 2 end-to-end tests | PASS |
| Screenshot inspection | Daily, project, and settings views inspected; no overlap or overflow found | PASS |
| Rust formatting | Rust 1.98.1 in an isolated `/tmp` toolchain; real `cargo fmt --check` completed successfully | PASS |
| Final source review | Review found Rust formatting and Today-at-midnight defects; both were fixed in `c51b42e` and independently re-reviewed | PASS |
| GitHub delivery | Private repository `ZZQ688/todo-desktop`; tested application `c51b42e` is on `main`, with final verification record at `9b1054d` | PASS |
| Hosted checks | Checks run `35174591687`, completed successfully for `c51b42e` | PASS |
| Windows installer | Windows Installer run `35174604276`, completed successfully; NSIS `.exe` downloaded and inspected | PASS |
| Native desktop IPC | Requires a real Windows application launch and `health_check` round trip | PENDING MANUAL |
| Offline startup and database reopen | Requires installation and offline testing on Windows | PENDING MANUAL |
| Minimum window size | Requires inspection of the native Windows window at its supported minimum | PENDING MANUAL |

A passing label must come from a completed run for the tested revision. `IN PROGRESS`
and `PENDING MANUAL` are not acceptance results.

## Local Evidence

The final local verification used Node v24.16.0, npm 11.17.0, and Rust 1.98.1.
The frontend suite passed 10 tests across 3 files, the production build passed, and
the end-to-end suite passed both its desktop 1280 x 800 and narrow 390 x 844 projects.
Screenshots of the daily, project, and settings views were inspected with no visible
overlap or overflow.

Rust was installed in an isolated location under `/tmp`. A real formatting check against
the Tauri manifest passed:

```text
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

The timezone-specific date tests were run at revision `9999411` in both Asia/Shanghai
and America/New_York and passed 3 of 3 tests in each timezone. The date helpers did not
change between that revision and `c51b42e`, so this evidence applies to the delivered
source. The final whole-branch review then identified two issues: Rust sources needed
formatting, and the Today action could retain a pre-midnight date after midnight. Both
fixes are included in `c51b42e` and each was independently re-reviewed with a PASS result.

No native Windows GUI was available in the local environment. Local browser tests and
screenshots therefore do not establish native IPC, installer behavior, offline launch,
database retention after reopen, or native minimum-window behavior.

## Source Delivery

The source is in the private repository
[ZZQ688/todo-desktop](https://github.com/ZZQ688/todo-desktop). The new repository was
created with `main` initially at `f89e361`, then fast-forwarded to the tested source
revision. The tested application revision is:

```text
c51b42e9119067da0a767a3d7b1e54c08f408f69
```

The final verification record is commit `9b1054d0ecec6bc74e475a8c285d6ba28d457d60`;
local and remote `main` resolve to that documentation commit.

The tracked-file audit found no database, credentials, original Word document,
dependency directory, build output, or scratch files in the repository.

## Hosted Workflows

Both hosted runs completed successfully for the delivered source revision:

- [Checks run 35174591687](https://github.com/ZZQ688/todo-desktop/actions/runs/35174591687)
- [Windows Installer run 35174604276](https://github.com/ZZQ688/todo-desktop/actions/runs/35174604276)

Checks run `35174591687` passed its frontend and Windows native jobs. Windows Installer
run `35174604276` passed npm, Cargo format/test/Clippy, Tauri NSIS packaging, and artifact
upload. The artifact `todo-desktop-windows-x64` contains
`Daily Todo_0.1.0_x64-setup.exe` (218,094,923 bytes), SHA-256
`bafcc0ee782e90e4b053dead6a421fbefda4c30b0fe3495acd5147d32e484054`. Artifact presence
proves packaging only; it does not prove that the application starts or persists data
correctly.

## Windows Manual Acceptance Checklist

Complete these checks in order on a Windows test machine after the installer workflow
has passed. Keep every item unchecked until it has been observed in the native app.

- [x] Download `todo-desktop-windows-x64` from Windows Installer run `35174604276` and verify that it contains an `.exe` produced by that run.
- [ ] Install the unsigned package through the normal Windows installer UI; record any Windows warning and the installer filename.
- [ ] Disable network access for the offline check, then launch the installed app without registration, login, or a network prompt.
- [ ] Confirm that the actual desktop window displays `本地数据已连接`, proving the native `health_check` IPC round trip completed.
- [ ] Change the date and switch among daily, project, and settings views; confirm navigation remains functional.
- [ ] Record the per-user `todo.sqlite` location, close the app, reopen it, and confirm that the same database is retained.
- [ ] Resize the native window to its minimum supported width and confirm that text and controls fit without overlap, clipping, or horizontal overflow.

The remaining checklist items require access to a Windows desktop. This Linux workspace
cannot truthfully mark native GUI, offline launch, database reopen, or minimum-window
checks as complete. This documentation commit follows the tested application revision;
the installer above contains `c51b42e` and not this later record-only commit.
