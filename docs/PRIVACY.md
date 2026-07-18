# Privacy and safety boundary

Codeville is local-first. It adds no analytics, telemetry, accounts, cloud sync, multiplayer, or Codeville-hosted backend.

## Renderer contract

The visual layer receives only project-scoped typed envelopes containing:

- session lifecycle and planning/reading/editing phases
- broad command category: test, build, lint, or other
- approval-needed category and explicit local approval details
- tests passed/failed
- a validated completion debrief: `landed`, `followUp`, and `followUpRecommended`

The event translator never places prompts, source, diffs, command output, or raw agent messages into the village stream. Completion prose is treated as untrusted: Codeville extracts only a marked JSON object, requires two strings of at most 96 characters and one boolean, then rejects paths, URLs, emails, markdown/code syntax, code-shaped identifiers, common secret names/prefixes, and malformed payloads. Rejection produces a generic safe fallback.

## Local data

- Repository paths and task text cross isolated IPC only to start the requested local Codex thread.
- Exact commands and working directories may appear in the local approval dialog for an informed decision. They never enter PixiJS or durable progression.
- The mode-`0600` atomic v2 store keeps five local lot assignments, opaque UUID project IDs, repository name/path, level, completion count/timestamp, and sanitized debriefs. Task text and raw messages are never persisted by Codeville.
- Private per-thread final-message accumulators exist only until terminal debrief parsing, then are discarded.
- Demo repositories are isolated under Electron's app-data directory.

## Codex and desktop boundaries

Codeville uses the installed, authenticated Codex CLI with `gpt-5.6-sol`, `workspace-write`, and `on-request` approvals. Codex service communication remains governed by the user's Codex/OpenAI settings.

Electron uses context isolation, renderer sandboxing, and no Node integration. The preload exposes a narrow typed API. The renderer cannot spawn processes, subscribe to raw app-server traffic, or read arbitrary files directly.
