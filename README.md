# Codeville

Codeville is a living desktop command center for Codex — the one where **"done" means merged** and the village view is **safe to leave on a shared screen**. Five local repositories become five workshops, each with its own real builder, activity state, approval and input boundaries, saved conversation, progression, and completion debrief.

Every builder works inside a *scaffold*: a git worktree on its own `codeville/<sessionId>` branch. Your checkout stays byte-identical while agents work — `git status` stays clean — until you inspect the diff at the Foreman's Desk and choose **Install in repository** (one squash commit), **Keep branch**, or **Discard**. The village canvas receives only sanitized, project-scoped events — never prompts, paths, diffs, or code — so the map of five working agents can sit on a projector while the repositories stay private.

This is a Developer Tools entry for OpenAI Build Week 2026.

## Judge-ready demo

The fastest path requires no repository setup or rebuild:

1. Install and sign in to the [Codex CLI](https://developers.openai.com/codex/cli/).
2. Open the provided Apple-silicon macOS `Codeville.app` test build.
3. Confirm the header shows `gpt-5.6-sol` and a Codex version.
4. Click **Create demo village**. Codeville creates five isolated copies of the bundled four-test fixture.
5. Click **Start all builders**, review the exact five-repository preflight, and confirm to launch five real Codex threads—or select one workshop and click **Start building**.
6. Answer native Codex questions or a builder's structured stopped-turn question at the Foreman's Desk. Waiting never advances progression and sibling builders continue independently.
7. Watch finished workshops fly an inspection pennant. Open **Site inspection** for verified change counts, the builder's diffstat-verified account, and the full diff — then **Install in repository** to land one squash commit. Missing result markers become **Needs review**, with the session's real work still inspectable.
8. Expand **Codex connection proof** for metadata-only runtime evidence. After a turn stops, optionally hand the saved thread to Ghostty and explicitly reclaim it after closing the CLI session.
9. Quit and reopen Codeville. The five lots, workshop levels, safe debriefs, and any uninstalled improvements remain.

The demo modifies only disposable repositories under Codeville's app-data directory. To use your own repositories, select an empty lot, choose an existing Git repository, enter that project's task, and start it individually—or check several real-project cards and use **Start selected builders**. Codeville shows an explicit name/path/task preflight and starts nothing until you confirm.

**Skills are first-class at prep time.** When a repository is selected, the desk lists the Codex skills visible to it — repo-specific skills first, then your overarching set — as equippable chips. Equipped skills ride along with the task as native turn input, so a builder starts with exactly the working style you chose.

**Several builders can share one repository.** Choosing an already-assigned repository offers **Add a second workshop**: a distinct lot with its own builder, ledger, levels, and queue on the same repo. Every session still works in its own scaffold branch, repo-mutating git operations are serialized, and improvements land one at a time — a second landing that conflicts with the first fails cleanly with its branch kept.

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
pnpm check                                   # typecheck, lint, 82 tests, production build
pnpm test:e2e                                # safe assignment proof + two disposable real Codex projects
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:e2e # five-project release gate
pnpm package:mac                             # unsigned release/mac-arm64/Codeville.app
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:packaged
```

The real-session tests consume Codex usage. They create temporary app data and isolated copies of `fixtures/demo-repo`.

Normal E2E never launches Codex against user repositories. The opt-in real-repository gate requires an explicit JSON payload; supplying it authorizes the listed tasks to modify those working trees through Codex:

```sh
CODEVILLE_REAL_E2E_CONFIG='[{"path":"/Users/me/Projects/graphletter","task":"Run the approved graphletter task"},{"path":"/Users/me/Projects/kalshi-mlb","task":"Run the approved kalshi task"}]' pnpm test:e2e
```

## Architecture

```text
React project rail + selected desk ── one long-lived PixiJS village
                 │ narrow, typed project envelopes
                 ▼
Electron main process ── one JSONL stdio connection ── Codex app-server
       │                         ├── thread 1 → scaffold 1 (worktree of project 1)
       │                         ├── thread 2 → scaffold 2 (worktree of project 2)
       │                         └── ... up to five live threads, none in a user checkout
       ├── scaffold manager: worktree per session, diff/apply/keep/discard, orphan reconcile
       ├── thread/project registry + deterministic approval queue + turn/steer redirects
       ├── privacy translator + dual-register debrief sanitizer (wall strict, desk diffstat-verified)
       └── atomic store: assignments, opaque identities, land-earned levels, session ledger,
           work-order queues, safe debriefs
```

One initialized app-server connection multiplexes all project threads. Every renderer event carries an app-owned opaque `projectId`, so interleaved notifications and approval requests remain attached to the correct workshop. Each builder owns its own visual phase queue and spring motion. PixiJS mounts once; project updates never replace the canvas or reset actors.

The renderer receives only coarse activity events and validated `CompletionDebrief` objects. It never receives prompts, code, diffs, command output, or raw final messages through the village channel. Debrief strings are length-bounded and reject paths, URLs, emails, shell/code syntax, identifiers, and common secret shapes. Exact commands and working directories appear only in the local approval dialog when a user decision is required.

Task drafts are intentionally memory-only: they are project-scoped while Codeville is open and cleared at relaunch. Repository paths/names, opaque UUIDs, detached progression, and safe debriefs persist locally with mode `0600`, so removing and later reopening a repository restores its existing identity and progress.

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
- `electron/input-request.ts` — native multi-question projection and generated response shaping

Codex turns must end with one discriminated `CODEVILLE_RESULT` marker. Only `status: "completed"` with a valid sanitized debrief increments progression. `status: "waiting_for_input"` retains the saved thread for a same-thread reply. A terminal turn without either valid result enters `needs_review`.
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
