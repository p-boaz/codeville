# Codeville

Codeville turns real Codex activity into a calm, persistent coding village. Pick a local repository, describe an improvement, and watch a tiny builder plan, inspect, edit, and test while the actual Codex session runs. A completed task upgrades that project's workshop permanently.

This is a Developer Tools entry for OpenAI Build Week 2026.

## Judge-ready demo

The fastest path does not require rebuilding Codeville or preparing a repository:

1. Install and sign in to the [Codex CLI](https://developers.openai.com/codex/cli/).
2. Open the provided macOS `Codeville.app` test build.
3. Confirm the header shows `gpt-5.6-sol` and a Codex version.
4. Click **Use the judge-ready demo project**.
5. Click **Start building**. The included four-test fixture is copied to an isolated app-data directory; Codex implements its missing function and runs the tests.
6. Wait for **Improvement complete** and Workshop level 1. Close and reopen Codeville, choose the demo again, and the upgrade remains.

The demo edits only the disposable fixture. Choosing a real project is optional.

## Supported platform

- Judge test build: macOS on Apple silicon.
- Development: validated on macOS with Node 24.16.0 and pnpm 10.33.4.
- Windows and Linux are not validated for this hackathon build.

Codeville locates Codex from `PATH`, common Homebrew/user install locations, or the optional `CODEVILLE_CODEX_BINARY` environment variable. It requires an authenticated Codex CLI account with access to `gpt-5.6-sol`.

## Run from source

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Quality and packaging commands:

```sh
pnpm check       # typecheck, lint, unit tests, production build
pnpm test:e2e    # real Codex session, real file edit/tests, persistence relaunch
pnpm package:mac # unsigned Codeville.app under release/mac-arm64/
pnpm test:packaged # repeat the real-session proof against that packaged app
```

`pnpm test:e2e` consumes a real Codex session and can take several minutes. It creates only temporary app data and a temporary copy of `fixtures/demo-repo`.

## How it works

```text
Electron renderer (React + PixiJS)
          │ narrow, typed IPC
          ▼
Electron main process ── JSONL over local stdio ── Codex app-server
          │
          ├── privacy translator ──> safe VillageEvent vocabulary
          ├── local approval bridge ──> exact command shown only to the user
          └── atomic progression store ──> per-project workshop level
```

The Electron main process starts the installed Codex app-server with `workspace-write` sandboxing and `on-request` approvals. App-server messages pass through a strict translator before reaching the village. The renderer receives only coarse events such as `reading`, `editing`, `running_command: test`, and `tests_passed`; it never receives prompts, code, diffs, command output, or filesystem paths through that channel. Exact commands and working directories appear only in the local approval dialog when Codex explicitly requests approval.

Progression is stored as a small versioned JSON file in Electron's user-data directory and written atomically. Project code remains in the selected repository and Codex's normal local execution boundary.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the complete data boundary and [docs/JUDGE_TESTING.md](docs/JUDGE_TESTING.md) for the short verification path.

The complete product requirements are in [docs/PRD.md](docs/PRD.md); the original interactive implementation plan is in [plans/hackathon-control/plan.mdx](plans/hackathon-control/plan.mdx).

## Codex and GPT-5.6

Codex and GPT-5.6 are part of both the product and its creation:

- **Product runtime:** every animation is driven by a real Codex app-server notification. Each Codeville task starts a real `gpt-5.6-sol` thread in the selected local repository.
- **Build acceleration:** Codex produced the architecture, implementation, generated app-server protocol bindings, procedural village, tests, packaging, and submission documentation in the primary build thread.
- **Live verification:** the end-to-end test makes GPT-5.6 repair a deliberately incomplete JavaScript fixture, runs its four real tests, verifies the changed file, and relaunches the desktop app to prove persistence.

Primary build session ID: `019f7398-bb25-74f2-9630-49f64427b392`.

Human product decisions were deliberately retained: a desktop app instead of a browser mock; local stdio instead of the experimental WebSocket transport; a privacy-safe event vocabulary; persistent single-player progression; and a narrow, judgeable task instead of multiplayer or decorative scope.

## Repository guide

- `electron/` — secure desktop shell, Codex protocol client, generated protocol types, persistence
- `src/codex/` — privacy-preserving app-server-to-village translation
- `src/game/` — procedural PixiJS village renderer
- `src/state/` — deterministic session and progression state
- `fixtures/demo-repo/` — disposable four-test judge fixture
- `e2e/` — real Codex desktop acceptance test
- `docs/` — judge guide, evidence, submission copy, video script, and checklist
- `plans/hackathon-control/` — original Build Week implementation control plan

## Evidence and third-party work

Codeville was created during the July 13–21, 2026 submission period. Timestamped commits, the primary Codex session, and repeatable verification commands are recorded in [docs/BUILD_WEEK_EVIDENCE.md](docs/BUILD_WEEK_EVIDENCE.md).

The application uses React, Electron, PixiJS, and standard open-source build/test tooling declared in `package.json`. All village art is procedurally drawn in code; the project contains no stock art, music, external fonts, or pre-existing application code.

## License

[MIT](LICENSE)
