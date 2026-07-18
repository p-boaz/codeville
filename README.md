# Codeville

Codeville is a living desktop command center for Codex. Five local repositories become five workshops, each with its own real builder, activity state, approval boundary, progression, and completion debrief. You can understand what several agents are doing—and where they landed—without reading five log streams or exposing private code to the visual layer.

This is a Developer Tools entry for OpenAI Build Week 2026.

## Judge-ready demo

The fastest path requires no repository setup or rebuild:

1. Install and sign in to the [Codex CLI](https://developers.openai.com/codex/cli/).
2. Open the provided Apple-silicon macOS `Codeville.app` test build.
3. Confirm the header shows `gpt-5.6-sol` and a Codex version.
4. Click **Create demo village**. Codeville creates five isolated copies of the bundled four-test fixture.
5. Click **Start all builders** to launch five real Codex threads, or select one workshop and click **Start building**.
6. Watch every builder independently plan, read, edit, test, and complete. Each completion produces a safe speech bubble explaining what landed and whether follow-up is recommended.
7. Quit and reopen Codeville. The five lots, workshop levels, and safe debriefs remain.

The demo modifies only disposable repositories under Codeville's app-data directory. Choosing a real repository is optional.

## Supported platform

- Judge test build: macOS on Apple silicon.
- Development: validated on macOS with Node 24.16.0 and pnpm 10.33.4.
- Windows and Linux are not validated for this hackathon build.

Codeville locates Codex from `PATH`, common Homebrew/user install locations, or `CODEVILLE_CODEX_BINARY`. It requires an authenticated Codex CLI account with access to `gpt-5.6-sol`.

## Run from source

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Verification and packaging:

```sh
pnpm check                                   # typecheck, lint, 26 tests, production build
pnpm test:e2e                                # two concurrent real Codex projects by default
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:e2e # five-project release gate
pnpm package:mac                             # unsigned release/mac-arm64/Codeville.app
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:packaged
```

The real-session tests consume Codex usage. They create temporary app data and isolated copies of `fixtures/demo-repo`.

## Architecture

```text
React project rail + selected desk ── one long-lived PixiJS village
                 │ narrow, typed project envelopes
                 ▼
Electron main process ── one JSONL stdio connection ── Codex app-server
       │                         ├── thread 1 → project 1
       │                         ├── thread 2 → project 2
       │                         └── ... up to five live threads
       ├── thread/project registry + deterministic approval queue
       ├── privacy translator + completion debrief sanitizer
       └── atomic v2 store: five lots, levels, safe debriefs
```

One initialized app-server connection multiplexes all project threads. Every renderer event carries an app-owned opaque `projectId`, so interleaved notifications and approval requests remain attached to the correct workshop. Each builder owns its own visual phase queue and spring motion. PixiJS mounts once; project updates never replace the canvas or reset actors.

The renderer receives only coarse activity events and validated `CompletionDebrief` objects. It never receives prompts, code, diffs, command output, or raw final messages through the village channel. Debrief strings are length-bounded and reject paths, URLs, emails, shell/code syntax, identifiers, and common secret shapes. Exact commands and working directories appear only in the local approval dialog when a user decision is required.

See [privacy](docs/PRIVACY.md), [judge testing](docs/JUDGE_TESTING.md), and the full [PRD](docs/PRD.md). The approved multi-project implementation plan is in [plans/multi-project-village](plans/multi-project-village/plan.mdx).

## Codex and GPT-5.6

Codex and GPT-5.6 are part of both the product and its creation:

- **Runtime:** each workshop starts a real `gpt-5.6-sol` Codex thread. Five projects can run simultaneously through the installed app-server.
- **Build:** Codex produced the architecture, protocol integration, Electron/React/PixiJS implementation, privacy contracts, migration, tests, packaging, and submission documentation in the primary thread.
- **Proof:** the acceptance harness makes up to five GPT-5.6 agents independently repair five repositories, reruns every fixture test, verifies routed debriefs and an unchanged canvas, then relaunches the app to prove persistence.

Primary build session ID: `019f7398-bb25-74f2-9630-49f64427b392`.

Human product decisions set the boundaries: native desktop instead of a browser mock; one local stdio transport instead of hosted orchestration; safe spatial state instead of raw logs; five simultaneously visible projects; and persistent outcome debriefs instead of transient completion confetti.

## Repository guide

- `electron/` — secure shell, concurrent Codex routing, approval queue, protocol bindings, v2 persistence
- `src/codex/` — privacy-safe event translation and completion debrief sanitizer
- `src/game/` — persistent five-lot PixiJS scene and independent spring-driven actors
- `src/state/` — deterministic session and visual phase reducers
- `fixtures/demo-repo/` — disposable four-test fixture copied into five repositories
- `e2e/` — real concurrent Codex acceptance and relaunch proof
- `docs/` — PRD, judge guide, evidence, Devpost copy, video script, privacy, checklist

## Evidence and third-party work

Codeville was created during the July 13–21, 2026 submission period. Timestamped commits and repeatable proof are recorded in [Build Week evidence](docs/BUILD_WEEK_EVIDENCE.md).

The application uses React, Electron, PixiJS, and standard open-source tooling declared in `package.json`. All village art is procedurally drawn in code; there is no stock art, music, external font, or pre-existing application code.

## License

[MIT](LICENSE)
