# Devpost submission draft

## Project name

Codeville

## Track

Developer Tools

## Tagline

A living desktop village where real Codex work becomes visible, calm, and persistent.

## Description

Coding agents are powerful, but their work usually arrives as an anxious stream of logs: commands, diffs, tokens, and tool calls. Codeville asks a different question: what if supervising an agent felt like watching a tiny workshop come alive?

Choose a local repository and describe an improvement. Codeville starts a real `gpt-5.6-sol` Codex session, then translates app-server notifications into a privacy-safe visual language. A builder walks to the workshop while Codex plans, studies blueprints while it reads, hammers while it edits, and checks the workbench while tests run. When the task completes, the project earns a permanent workshop upgrade.

This is not a simulated animation over a canned response. The included judge demo provisions a disposable repository with a missing function and four existing tests. GPT-5.6 implements the function, runs the tests, and produces the completion that upgrades the village. Our automated desktop test verifies the changed source, independently reruns all four tests, relaunches the app, and proves the upgrade persisted.

The core technical idea is a strict privacy translator between Codex and the visual world. The renderer receives only coarse events such as reading, editing, testing, and completion—not prompts, source, diffs, paths, commands, or output. Exact commands remain visible only in the local approval dialog. Electron context isolation, renderer sandboxing, workspace-write execution, and on-request approvals keep the boundary explicit.

Codeville makes agent progress legible at a glance without turning private code into spectacle. Today it is a cozy single-project desktop companion; the broader opportunity is a spatial command center where teams can understand many agents by state and outcome instead of reading every log line.

## How Codex and GPT-5.6 were used

Codex and GPT-5.6 are intrinsic to both the runtime and the build. Codeville speaks directly to the installed Codex app-server over local JSONL stdio and explicitly starts each task with `gpt-5.6-sol`. The primary Codex build thread created the architecture, generated the app-server protocol bindings, implemented the Electron/React/PixiJS product, wrote unit and real-session end-to-end tests, debugged the live workflow, packaged the app, and prepared the submission evidence.

Human decisions defined the product boundary: desktop instead of a browser simulation, stdio instead of an experimental WebSocket path, privacy-safe event types instead of rendering raw logs, persistent single-player progression, and a deterministic judge fixture instead of broad multiplayer scope.

## Links to add before submission

- Public YouTube demo: `[ADD PUBLIC YOUTUBE URL]`
- Repository: `[ADD PUBLIC REPOSITORY URL]`
- Packaged macOS test build: `[ADD RELEASE URL OR DEVPOST FILE]`

## Session ID

Candidate primary build thread: `019f7398-bb25-74f2-9630-49f64427b392`

Run `/feedback` in that thread and use the returned Session ID in the form.
