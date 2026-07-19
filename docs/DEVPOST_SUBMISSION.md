# Devpost submission draft

## Project name

Codeville

## Category

Developer Tools

## Tagline

The agent command center where "done" means merged — and the map of five real Codex builders is safe to leave on a shared screen.

## Description

Coding agents can work in parallel, but supervising them usually means scanning several streams of logs, tool calls, diffs, and chat. Codeville asks a different question: what if five agent sessions felt like one living town?

Five local repositories become five stable workshops. Each can start an independent real `gpt-5.6-sol` Codex thread through one local app-server connection. As a thread plans, reads, edits, tests, waits for approval, or completes, its own builder moves through the corresponding workshop state. Selecting a project changes the Foreman's Desk while every lot remains visible, making concurrent work legible at a glance.

Two things make Codeville a command center rather than a dashboard. First, **nothing an agent does touches your repository until you approve it**: every session runs in a scaffold — a git worktree on its own branch — and finished work arrives as a pennant on the workshop. Site inspection shows verified change counts, a deterministic fact line (tests passed, duration) the model cannot claim, the builder's account in which file names survive only when the diffstat vouches for them, and the full diff. One click installs a single squash commit; Keep and Discard cover the other outcomes. Second, **supervision is specific without turning code into spectacle**: the desk's Village feed streams every builder's real steps in one place — files read and edited, commands run, tests passing, validated one-line debriefs — newest first and named per repository and task, while prompts, diffs, and command output never cross into the visual layer. A missing result marker becomes an honest "needs review", never a fabricated debrief, and wall mode (press **W**) drops to a provably code-free subset — phases and counts only — so the map of five working agents stays safe on a projector. A pulsing lantern, village signpost, dock badge, and background notifications route attention to whichever builder needs a decision.

You also stay in command mid-flight: redirect a builder without stopping its turn, queue work orders that auto-start when the current improvement lands, promote a debrief's recommended follow-up into the queue in one click, and open a second workshop on the same repository when one builder isn't enough.

The judge demo creates five disposable repositories in one click and can launch all five builders together. This is not a simulation: the automated release gate starts five real GPT-5.6 Codex threads, verifies five separate source repairs and twenty passing fixture tests, proves the Pixi canvas is never replaced, validates five routed debriefs and progression records, then relaunches the packaged app to prove persistence.

Codeville makes multi-agent progress understandable without turning private code into spectacle. It is a complete native developer tool: Electron sandboxing and context isolation, workspace-write Codex execution, project-scoped interrupt and approval handling, deterministic approval queuing, atomic versioned storage, migration, accessible textual state, and a persistent spring-animated PixiJS world.

## How Codex and GPT-5.6 were used

Codex and GPT-5.6 are intrinsic to both runtime and build. At runtime, Codeville speaks to the installed Codex app-server over local JSONL stdio and explicitly starts each workshop with `gpt-5.6-sol`. One initialized transport multiplexes five thread-scoped turns.

In the primary build thread, Codex created the architecture, generated and integrated app-server protocol bindings, implemented Electron/React/PixiJS, diagnosed the canvas-recreation glitch, proved real concurrent app-server behavior, designed the safe debrief contract, built the v1→v2 migration, wrote unit and real-session tests, packaged the app, and prepared submission evidence.

Human decisions established the product boundary: a native local tool instead of a browser simulation; spatial multi-project supervision instead of another log dashboard; one local stdio connection instead of hosted orchestration; validated outcome debriefs instead of raw model text; and exactly five visible lots for a focused, judgeable experience.

## Testing instructions

Apple-silicon Mac plus authenticated Codex CLI with `gpt-5.6-sol` access. Unzip and Control-click **Codeville.app → Open** if Gatekeeper warns. Click **Create demo village**, then **Start all builders**; review the exact preflight and confirm. While builders work, `git status` in any demo repository stays clean — every session runs in an isolated scaffold worktree. While they work, the **Village feed** names each builder's real steps, and **Redirect builder** steers a live turn without stopping it. Finished workshops fly an inspection pennant: open **Site inspection**, view the verified counts and full diff, and click **Install in repository** to land one squash commit. Quit/reopen and select Acorn Tasks to verify level 1, its plaque, and the ledger persist. Press **W** for the wall-safe display. Full details are in `docs/JUDGE_TESTING.md`; `node scripts/demo-drive.mjs` replays the whole tour automatically.

## Links to add

- Public YouTube demo: `[ADD PUBLIC YOUTUBE URL]`
- Code repository: https://github.com/p-boaz/codeville
- Free macOS test build: `[ADD RELEASE URL OR DEVPOST FILE]`

## Required Codex session ID

Primary build thread candidate: `019f7398-bb25-74f2-9630-49f64427b392`

Run `/feedback` in that thread and paste the exact returned Session ID into Devpost.
