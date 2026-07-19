# Privacy and safety boundary

Codeville is local-first. It adds no analytics, telemetry, accounts, cloud sync, multiplayer, or Codeville-hosted backend.

## Renderer contract

Codeville has two registers with one contract.

The **village stream** (the wall-safe register) receives only project-scoped typed envelopes containing:

- session lifecycle and planning/reading/editing phases
- broad command category: test, build, lint, or other
- approval-needed category and explicit local approval details
- tests passed/failed
- a validated completion debrief: `landed`, `followUp`, and `followUpRecommended`
- landable-change counts only (`diff_ready`: files changed, insertions, deletions) and landing outcomes (applied commit prefix, kept branch name)
- sanitized pending question text, option labels, conversation ownership/status, opaque thread IDs, safe-event counts, and connection/start timestamps

The event translator never places prompts, source, diffs, command output, or raw agent messages into the village stream. Completion prose is treated as untrusted: Codeville extracts only a marked JSON object, requires two strings of at most 96 characters and one boolean, then rejects paths, URLs, emails, markdown/code syntax, code-shaped identifiers, common secret names/prefixes, and malformed payloads. A missing or invalid marker produces **Result needs review** — never a fabricated debrief.

The **Foreman's Desk register** is privileged, owner-initiated, and invoke-only: `scaffold:diff` returns the session's real per-file patches for inspection, and the scaffold summary carries a *desk account* — the builder's own prose in which dotted or path-like tokens are allowed only when they name a file the session's diffstat proves was changed. The desk register never crosses the village event channel. Raw marker prose is held transiently in the privileged process until the diff is known, validated into the desk account, then discarded.

## Local data

- Repository paths and task text cross isolated IPC only after an individual start or confirmed batch launch, to start the requested local Codex thread.
- Exact commands and working directories may appear in the local approval dialog for an informed decision. They never enter PixiJS or durable progression.
- Skill names, short descriptions, and paths (from Codex's own `skills/list` for the selected repository) appear in the desk prep panel so skills can be equipped per task. They never enter the village stream or persistence; equipped skill references are sent only to the local Codex thread as native turn input.
- The mode-`0600` atomic v2 store keeps five local lot assignments, opaque UUID project IDs, repository name/path, detached progression records, completion count/timestamp, sanitized debriefs, saved thread identity, safe pending-input projections, and ownership metadata. Task drafts and user replies remain project-scoped renderer memory and are cleared on relaunch; request IDs, raw native questions, secrets, prompts, commands, output, diffs, reasoning, and agent prose are never persisted by Codeville.
- **Work orders are a deliberate exception to task-text non-persistence** (amended 2026-07-18): user-authored queued tasks are stored in the mode-`0600` store so a day of planned work survives relaunch. The safe-register session ledger (per-session counts, test telemetry, landing verb, and the ≤96-character wall debrief) is stored the same way. Live task drafts and user replies still stay in renderer memory only.
- Native secret answers use password inputs and are sent directly in the generated app-server response shape. They never enter the village event stream or persistence.
- Raw final-message accumulation is discarded immediately after parsing on completed, waiting, malformed, and missing-marker paths.
- Ghostty handoff uses argument arrays, is prohibited during an active turn, and transfers exclusive ownership. Codeville sends no turns until the user confirms the CLI session is closed and reclaims the thread.
- Private per-thread final-message accumulators exist only until terminal debrief parsing, then are discarded.
- Demo repositories are isolated under Electron's app-data directory.
- Normal development and E2E flows never launch against user repositories. Real-repository E2E requires the explicit `CODEVILLE_REAL_E2E_CONFIG` payload naming every path and task.

## Codex and desktop boundaries

Codeville uses the installed, authenticated Codex CLI with `gpt-5.6-sol`, `workspace-write`, and `on-request` approvals. Codex service communication remains governed by the user's Codex/OpenAI settings.

Electron uses context isolation, renderer sandboxing, and no Node integration. The preload exposes a narrow typed API. The renderer cannot spawn processes, subscribe to raw app-server traffic, or read arbitrary files directly.

Selecting a real project requires an existing `.git` entry with at least one commit.

## Scaffold isolation

Every Codex session runs inside a *scaffold*: a git worktree on its own `codeville/<sessionId>` branch, created from the repository's `HEAD` under Codeville's app-data directory. The `workspace-write` sandbox therefore physically encloses only the scaffold — **an agent session never writes to the user's checkout**. Scaffold records are mode-`0600` JSON holding branch, base commit, timestamps, and the validated session outcome (test telemetry, duration, desk account); they hold no diffs, prompts, or output.

Codeville performs git operations only in two situations: read-only queries (status, diff, worktree management on its own scaffolds), and the three explicit landing verbs the user invokes after inspection — **Install** (one squash commit into a clean checkout), **Keep branch** (scaffold removed, branch preserved for the user's own merge), and **Discard** (worktree and branch deleted after a second confirmation). A conflicting or dirty checkout aborts cleanly with the repository left untouched and the branch kept. Crash-orphaned scaffolds are listed for review at launch and never silently deleted.

macOS notifications and the dock badge carry only the repository name and safe-register phrasing ("needs your approval", change counts) — never task text, paths, or code.
