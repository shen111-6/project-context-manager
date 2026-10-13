# Next architecture (alpha)

The v2 Skill remains the semantic rule source. Rule IDs map to `references/state-reconstruction.md`: SCOPE §1–2, EVIDENCE §3, BASELINE §4, VALIDATION §5, CONFLICT §6, AUTHORITY §7–8. Engine checks are deliberately narrower than semantic correctness. Hash equality proves byte equality, not feature completion. Existing requirements and accepted decisions retain their authority.

Packages: protocol (version 1 Schema + semantic validation), engine (read-only evidence, immutable storage, drift and operations), cli (JSON interface), adapters (host CLI capabilities and untrusted candidates), vscode (three task entries + expandable evidence). No core package imports VS Code. No daemon, database, credentials or hidden chat access.

Each operation has four separate results: execution outcome, evidence assessment, context consistency (findings), and readiness. `Verified` describes machine facts in the reported scope only. Semantic claims remain historical/candidate statements until a recipient inspects implementation and applicable validation.

Facts are sampled twice. Git optional locks, fsmonitor, untracked cache and lazy fetch are disabled; no mutating Git command is exposed. A non-Git directory is distinguished from inaccessible Git. Limits, unsupported paths, excluded credentials and unreadable files produce explicit coverage gaps. Fingerprints omit clocks; local repository/worktree identities distinguish work sites, while file comparisons support relocated checkouts.

Snapshots are JSON; Markdown is a safe rendered view. Store writes use exclusive lock and expected revision. Snapshot files are write-once; the index is the visibility boundary. A crash can leave an orphan, never an indexed partial record. Stale locks require an explicit user investigation, not silent stealing. Hash checks detect accidental/tampered modifications but do not authenticate an author. Imported tests and `local-run` labels never become trusted executions in the receiving process.

Readonly modules never initialize storage or run verification scripts. Handoff data cannot authorize commands, links or development. A custom validation process or Agent invocation is a separate trusted action. Worktree selection is an explicit human operation. Remote workspaces are rejected in the alpha GUI.

GUI design: native task list (handoff/restore/status), workspace selection only when ambiguous, progress with cancellation, result with conclusion, visible risks and next step. Advanced details show scope, exclusions, evidence and historical claims. Workspace trust gates writes and Agent invocations. Unsaved buffers are visible and never auto-saved. The Webview has no arbitrary file/command RPC and no imported HTML rendering.

Protocol changes produce a new record, retaining original. Unsupported major versions are refused. v2 Markdown is read as legacy claims with no machine certification. Engine absence leaves original v2 rules operational.

Local concurrent malicious filesystem replacement cannot be fully isolated by portable Node path checks; symlinks/junctions are refused, files opened without following links where supported and rechecked. No sandbox guarantee is claimed for arbitrary external Agent CLIs. Use trusted projects and host permission controls.
