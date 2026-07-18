# Codeville product requirements

Status: Build Week demo implemented and verified  
Owner: entrant  
Track: Developer Tools  
Submission deadline: July 21, 2026 at 5:00 PM PT

The interactive implementation control plan, diagrams, contracts, file map, and original definition of done live in [`plans/hackathon-control/plan.mdx`](../plans/hackathon-control/plan.mdx). This document is the stable product specification.

## Product thesis

Agentic coding tools expose progress primarily through logs, tool calls, diffs, and chat. That interface is useful for inspection but costly for ambient supervision and emotionally flat over repeated sessions. Codeville makes real agent progress understandable at a glance by projecting safe execution states into a persistent spatial world.

Codeville is a local-first desktop companion: a repository becomes a workshop, a Codex session becomes its builder, and successful improvements permanently grow the place.

## Audience and job

Primary user: a developer who delegates bounded repository improvements to Codex and wants to understand whether the agent is planning, inspecting, changing, testing, blocked, or done without continuously reading a terminal.

Core job: “While Codex works in my project, help me understand its state and outcomes at a glance without revealing my code or weakening execution controls.”

## Goals

1. Truthfully visualize one real Codex task from start to completion.
2. Make the experience coherent and delightful enough to feel like a product, not protocol telemetry.
3. Preserve the user's existing Codex sandbox and approval authority.
4. Prevent sensitive implementation detail from entering the visual event stream.
5. Reward verified completion with per-project progression that survives relaunch.
6. Give judges a repeatable, no-setup fixture that proves the whole loop.

## Non-goals for the Build Week release

- Multiplayer, accounts, cloud sync, remote control, or hosted telemetry.
- Replacing the Codex app, terminal, diffs, approvals, or debugging tools.
- Full simulation/economy mechanics or user-generated village content.
- Windows/Linux distribution, auto-update, App Store release, signing, or notarization.
- Inferring progress from timers or fabricating activity when Codex is unavailable.

## Primary experience

1. User opens Codeville and sees whether Codex and `gpt-5.6-sol` are available.
2. User chooses a local folder or provisions the bundled **Acorn Tasks** demo.
3. User reviews/edits one task and starts building.
4. Codeville starts a local Codex thread and turn under `workspace-write` with `on-request` approvals.
5. Real protocol messages become a safe timeline and corresponding builder animation.
6. Any approval request pauses the experience and presents exact local details for a user decision.
7. A successful turn upgrades the workshop; failure/interruption does not.
8. Relaunching and choosing the same project restores its progression.

## Functional requirements

| ID | Requirement | Acceptance proof |
| --- | --- | --- |
| F1 | Detect the locally installed Codex CLI from terminal and common GUI-launch locations. | Header shows version in source and packaged builds; resolver unit tests pass. |
| F2 | Let the user choose a local folder through a native dialog. | Selection returns only after an accessible directory is chosen. |
| F3 | Provision a deterministic, disposable demo without repository setup. | One click copies and initializes the four-test fixture under app data. |
| F4 | Start a real Codex app-server thread/turn with `gpt-5.6-sol`. | End-to-end test produces a real source edit and passing tests. |
| F5 | Represent planning, reading, editing, command, test, approval, failure, interruption, and completion states. | Translator and state-machine tests cover mappings and transitions. |
| F6 | Never emit raw prompts, code, diffs, paths, command strings, or output as `VillageEvent`. | Privacy translator tests and closed event union. |
| F7 | Preserve explicit local approval decisions. | Approval dialog supports accept, session accept, decline, and cancel. |
| F8 | Allow the active turn to be interrupted. | Interrupt request maps to a recoverable neutral state without progression. |
| F9 | Record one progression increment only after successful completion. | Atomic store and reducer tests; E2E reads level 1. |
| F10 | Restore progression after full process relaunch. | Source and packaged E2E close/relaunch and assert one completed session. |
| F11 | Provide a visible reset for local village progression. | Reset action clears the versioned store and UI. |
| F12 | Package an Apple-silicon macOS app with bundled demo and branded icon. | `pnpm package:mac` plus `pnpm test:packaged`. |

## Non-functional requirements

- **Truthfulness:** no phase or completion animation may be driven by a fake timer.
- **Privacy:** raw Codex messages terminate in the privileged process; renderer IPC is typed and narrow.
- **Security:** renderer sandbox, context isolation, no Node integration, workspace-write sandbox, on-request approvals.
- **Reliability:** malformed/unknown notifications are ignored or mapped conservatively; progression writes are atomic and versioned.
- **Reproducibility:** exact Node, pnpm, dependency, generated protocol, fixture, and test versions are committed.
- **Performance:** animation remains responsive while app-server work is active; renderer does not process command output.
- **Accessibility:** critical state exists as text, not animation/color alone; controls have semantic labels and focusable native elements.
- **Distribution:** judge test path does not require rebuilding; source path remains documented.

## Data model

The only durable Codeville-owned data is local progression:

```ts
interface ProgressionData {
  version: 1;
  projects: Record<string, {
    level: number;
    completedSessions: number;
    lastCompletedAt: string | null;
  }>;
}
```

No application analytics or telemetry are collected in this release. Codex service communication remains under the signed-in user's normal OpenAI/Codex settings.

## Success criteria

Build Week release success requires all of the following:

- A first-time judge can reach a real completed task from launch in three clicks after prerequisites.
- The bundled task changes the fixture and passes all four tests.
- The UI visibly follows real reading/editing/testing/completion events.
- A relaunch shows the same workshop level.
- No sensitive string crosses the safe event contract.
- Unit, type, lint, production build, source E2E, package build, and packaged E2E pass.
- Submission includes a working artifact, public sub-three-minute narrated video, repository/evidence, `/feedback` session ID, description, and testing instructions.

## Product risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Judge lacks Codex/model entitlement | State prerequisite prominently; detect Codex before enabling the path; video proves the live run. |
| Model/network latency harms demo | Tiny deterministic fixture, no dependency install, generous test timeout, edited video may compress wait while preserving truthful sequence. |
| GUI launch cannot find CLI | Search explicit override, inherited `PATH`, user bin directories, Homebrew paths. |
| Raw code leaks into visuals | Closed coarse event union, pure translator, privacy tests, no renderer access to raw app-server stream. |
| Success claimed without verification | Progress only on successful turn completion; acceptance test independently reruns fixture tests. |
| Unsigned build triggers Gatekeeper | Document Control-click launch; sign/notarize if entrant supplies Developer ID credentials. |
| Name conflicts after hackathon | Treat Codeville as the working entry name; perform formal clearance before commercialization. |

## Future direction

The next product step is not more decorative simulation. It is multi-project supervision: multiple workshops, each representing a project or agent, with spatial state, safe summaries, intervention points, and durable outcomes. Accounts, remote relays, and multiplayer should be considered only after the same privacy vocabulary is proven at that boundary.
