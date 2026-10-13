# Executed validation

2026-10-10, Windows, Node 24.18.0, Git 2.55.0.windows.2.

M1: `npm run check` PASS; Vitest 5.0.3, 6 real temporary-repository tests PASS. Tests cover independent HEAD/index/disk/untracked evidence, deterministic fingerprints, readonly index bytes, missing/sensitive files, worktree identity, literal paths, unborn/non-Git, resource limits, traversal, cancellation, junction refusal and invalid completion/schema records. `npm install --ignore-scripts` reported zero vulnerabilities after replacing vulnerable Vitest 3.

An initial sandbox-only run could not initialize Git in its temporary directory. That environment failure was not counted as a product pass. Tests were then executed in authorized isolated local temporary directories. An actual Windows configuration-path failure was fixed before PASS.

M2: typecheck and bundled build PASS; 5 real repository tests PASS (checkpoint/handoff/fresh readonly restore; false completion + drift + stale verification; stale/concurrent/immutable writes; tamper + injection + redaction; missing record without writes). One Webview rendering safety test PASS. Real installed VS Code extension host: status command PASS using temporary project and isolated user profile.

Pending: macOS/Linux CI, full GUI E2E, Claude/Gemini runtime integration and bilateral acceptance, 12-person UX study and 216 receiving experiments. Actual independent Codex recovery was subsequently executed in M3 below. No historical v2 result is carried forward as a next-generation pass.

M3: affected storage/adapter/rendering tests 8 PASS; standalone CLI + extension bundled build PASS; real extension host status/missing-record/unsaved-buffer and six command registration PASS. Independent Codex CLI (0.162.0-alpha.2), final safe-parameter run: core recovery PASS; false completion conflict PASS; source unchanged. Actual candidate reports were reviewed, not counted as verified feature completion. Claude/Gemini runtime now deferred by user instruction; only interfaces/design are in scope.

M5: affected scope/path checks 11 PASS, then storage/publication/validation/rendering 12 PASS; typecheck/build PASS; actual isolated VS Code extension host PASS. M6: evaluation schedule/scoring unit tests 2 PASS after correcting a parser error; no study or benchmark run executed. Final local packaging and structural checks are recorded separately in the delivered acceptance note.

Final follow-up: real merge stage/subproject scope and external diff/textconv refusal 2 PASS. Skill quick_validate and six-module/reference structure PASS. Local VSIX packaging and isolated-profile installation PASS. CLI offline schedule smoke: 216 draft entries, Codex/Gemini, NOT EXECUTED.

## 2026-10-11 alpha.2 current GUI follow-up

Current-session typecheck/build/structure PASS; targeted GUI/render/M2 10 tests and event-level GUI host 2 tests PASS. Real VS Code dual-project extension-host status/missing/unsaved/bound-project tests PASS. Installed alpha.2 GUI actually generated JSON/Markdown, restored task and multiline WIP without changing six scoped file/index hashes, reported README FILE_DRIFT, copied recovery instruction with feedback, and rejected a synthetic tampered record with RECORD_CHANGED. These are scoped passes, not full GUI/permission/platform acceptance. Exact evidence and remaining gaps: [GUI acceptance](gui-acceptance-2026-10-11.md). Fresh receiving-chat recovery and authorized packaging task completed: typecheck, two real packages, ZIP allowlist and bundle-byte checks PASS. See [receiving experiment](receiving-experiment.md); prompted recovery and estimated timing only, not a blind benchmark.

2026-10-13 current full suite: 8 files / 30 tests Passed; offline 7-scenario demo and five scoped readonly hashes Passed. Details: [current validation](validation-2026-10-13.md). AI-role showcase and closing requirements are documented; full release acceptance remains incomplete.
