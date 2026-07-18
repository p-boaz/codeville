# Devpost submission draft

## Project name

Codeville

## Category

Developer Tools

## Tagline

A living desktop command center where five real Codex agents become visible, calm, and accountable.

## Description

Coding agents can work in parallel, but supervising them usually means scanning several streams of logs, tool calls, diffs, and chat. Codeville asks a different question: what if five agent sessions felt like one living town?

Five local repositories become five stable workshops. Each can start an independent real `gpt-5.6-sol` Codex thread through one local app-server connection. As a thread plans, reads, edits, tests, waits for approval, or completes, its own builder moves through the corresponding workshop state. Selecting a project changes the Foreman's Desk while every lot remains visible, making concurrent work legible at a glance.

Completion is an outcome, not confetti. Each builder shows a small debrief with what landed and whether follow-up is recommended. Raw agent prose never reaches the visual layer. Codeville extracts a bounded marked object in the privileged process, rejects paths, URLs, emails, code/shell syntax, identifiers, and secret-shaped text, and falls back safely. The renderer otherwise receives only coarse project-scoped events—not prompts, source, diffs, commands, or output.

The judge demo creates five disposable repositories in one click and can launch all five builders together. This is not a simulation: the automated release gate starts five real GPT-5.6 Codex threads, verifies five separate source repairs and twenty passing fixture tests, proves the Pixi canvas is never replaced, validates five routed debriefs and progression records, then relaunches the packaged app to prove persistence.

Codeville makes multi-agent progress understandable without turning private code into spectacle. It is a complete native developer tool: Electron sandboxing and context isolation, workspace-write Codex execution, project-scoped interrupt and approval handling, deterministic approval queuing, atomic versioned storage, migration, accessible textual state, and a persistent spring-animated PixiJS world.

## How Codex and GPT-5.6 were used

Codex and GPT-5.6 are intrinsic to both runtime and build. At runtime, Codeville speaks to the installed Codex app-server over local JSONL stdio and explicitly starts each workshop with `gpt-5.6-sol`. One initialized transport multiplexes five thread-scoped turns.

In the primary build thread, Codex created the architecture, generated and integrated app-server protocol bindings, implemented Electron/React/PixiJS, diagnosed the canvas-recreation glitch, proved real concurrent app-server behavior, designed the safe debrief contract, built the v1→v2 migration, wrote unit and real-session tests, packaged the app, and prepared submission evidence.

Human decisions established the product boundary: a native local tool instead of a browser simulation; spatial multi-project supervision instead of another log dashboard; one local stdio connection instead of hosted orchestration; validated outcome debriefs instead of raw model text; and exactly five visible lots for a focused, judgeable experience.

## Testing instructions

Apple-silicon Mac plus authenticated Codex CLI with `gpt-5.6-sol` access. Unzip and Control-click **Codeville.app → Open** if Gatekeeper warns. Click **Create demo village**, then **Start all builders**; review the exact preflight and confirm. Confirm five project cards complete and display debriefs. Quit/reopen and select Acorn Tasks to verify level 1 persists. Full details are in `docs/JUDGE_TESTING.md`.

## Links to add

- Public YouTube demo: `[ADD PUBLIC YOUTUBE URL]`
- Code repository: `[ADD PUBLIC REPOSITORY URL]`
- Free macOS test build: `[ADD RELEASE URL OR DEVPOST FILE]`

## Required Codex session ID

Primary build thread candidate: `019f7398-bb25-74f2-9630-49f64427b392`

Run `/feedback` in that thread and paste the exact returned Session ID into Devpost.
