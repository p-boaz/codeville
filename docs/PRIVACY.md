# Privacy and safety boundary

Codeville is local-first. It adds no analytics, telemetry, accounts, cloud sync, multiplayer, or Codeville-hosted backend.

## Renderer contract

The visual layer receives only project-scoped typed envelopes containing:

- session lifecycle and planning/reading/editing phases
- broad command category: test, build, lint, or other
- approval-needed category and explicit local approval details
- tests passed/failed
- a validated completion debrief: `landed`, `followUp`, and `followUpRecommended`
- sanitized pending question text, option labels, conversation ownership/status, opaque thread IDs, safe-event counts, and connection/start timestamps

The event translator never places prompts, source, diffs, command output, or raw agent messages into the village stream. Completion prose is treated as untrusted: Codeville extracts only a marked JSON object, requires two strings of at most 96 characters and one boolean, then rejects paths, URLs, emails, markdown/code syntax, code-shaped identifiers, common secret names/prefixes, and malformed payloads. Rejection produces a generic safe fallback.

## Local data

- Repository paths and task text cross isolated IPC only after an individual start or confirmed batch launch, to start the requested local Codex thread.
- Exact commands and working directories may appear in the local approval dialog for an informed decision. They never enter PixiJS or durable progression.
- The mode-`0600` atomic v2 store keeps five local lot assignments, opaque UUID project IDs, repository name/path, detached progression records, completion count/timestamp, sanitized debriefs, saved thread identity, safe pending-input projections, and ownership metadata. Task drafts and user replies remain project-scoped renderer memory and are cleared on relaunch; request IDs, raw native questions, secrets, prompts, commands, output, diffs, reasoning, and agent prose are never persisted by Codeville.
- Native secret answers use password inputs and are sent directly in the generated app-server response shape. They never enter the village event stream or persistence.
- Raw final-message accumulation is discarded immediately after parsing on completed, waiting, malformed, and missing-marker paths.
- Ghostty handoff uses argument arrays, is prohibited during an active turn, and transfers exclusive ownership. Codeville sends no turns until the user confirms the CLI session is closed and reclaims the thread.
- Private per-thread final-message accumulators exist only until terminal debrief parsing, then are discarded.
- Demo repositories are isolated under Electron's app-data directory.
- Normal development and E2E flows never launch against user repositories. Real-repository E2E requires the explicit `CODEVILLE_REAL_E2E_CONFIG` payload naming every path and task.

## Codex and desktop boundaries

Codeville uses the installed, authenticated Codex CLI with `gpt-5.6-sol`, `workspace-write`, and `on-request` approvals. Codex service communication remains governed by the user's Codex/OpenAI settings.

Electron uses context isolation, renderer sandboxing, and no Node integration. The preload exposes a narrow typed API. The renderer cannot spawn processes, subscribe to raw app-server traffic, or read arbitrary files directly.

Selecting a real project requires an existing `.git` entry. Codeville never initializes, resets, deletes, checks out, commits, or otherwise edits repository metadata itself. Any working-tree changes occur only inside the user-approved Codex session with `workspace-write` and `on-request` approvals.
