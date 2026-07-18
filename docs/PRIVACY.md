# Privacy and safety boundary

Codeville is intentionally local-first. It does not add analytics, telemetry, accounts, multiplayer, or a Codeville-hosted backend.

## What reaches the renderer

The visual layer receives only the typed `VillageEvent` union:

- session lifecycle
- planning, reading, and editing phase changes
- counts when available
- broad command category: test, build, lint, or other
- approval-needed category
- tests passed/failed

The translator does not put prompts, source code, diffs, command strings, command output, repository names, or filesystem paths into village events. Tests assert this boundary.

## What stays local

- The chosen repository path and task text cross Electron's isolated IPC only to start the requested local Codex thread.
- Exact commands and working directories may appear in the local approval dialog so the user can make an informed decision. They are not sent to the PixiJS village.
- Progression stores only a local project key, level, completion count, and timestamp in Electron's user-data directory.
- The judge fixture is copied into the same app-data directory before use.

## Codex boundary

Codeville uses the locally installed, authenticated Codex CLI. A session is started with the `gpt-5.6-sol` model, `workspace-write` sandbox, and `on-request` approval policy. Codex's own service communication and data handling remain governed by the user's Codex account and OpenAI settings.

## Desktop security

The BrowserWindow uses context isolation, renderer sandboxing, and no Node integration. The preload exposes a small typed API rather than generic IPC. The renderer cannot spawn processes or read arbitrary files directly.
