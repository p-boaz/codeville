# Codeville product requirements

Status: five-project Build Week demo implemented and verified

Track: Developer Tools

Deadline: July 21, 2026 at 5:00 PM PT

The approved architecture and visual specification is [`plans/multi-project-village/plan.mdx`](../plans/multi-project-village/plan.mdx).

## Product thesis

Agentic coding tools expose work through logs, diffs, and chat. Those interfaces are essential for inspection but expensive for supervising several agents at once. Codeville projects safe execution state into a persistent spatial world: five repositories become five workshops, live Codex sessions become builders, and verified outcomes become lasting upgrades and readable debriefs.

Core job: “While several Codex agents work, show me which project is planning, changing, blocked, testing, or done—and what each agent recommends next—without leaking implementation detail or weakening approvals.”

## Goals

1. Keep exactly five projects simultaneously visible with stable spatial identity.
2. Run independent real `gpt-5.6-sol` Codex threads concurrently through one local app-server.
3. Make activity smooth and truthful: no canned phases, canvas replacement, spawn resets, or frantic event thrash.
4. Show a safe completion bubble with what landed and whether follow-up is recommended.
5. Preserve project-scoped sandbox, interrupt, approval, error, and persistence boundaries.
6. Provide a one-click five-repository demo and automated source/packaged proof.

## Non-goals

- Accounts, hosted orchestration, remote control, telemetry, cloud sync, or multiplayer.
- Replacing Codex chat, diff review, logs, approvals, or debugging tools.
- More than five lots, a simulation economy, or user-generated world content.
- Windows/Linux distribution, signing, notarization, auto-update, or App Store release.
- Rendering raw final answers or inferring work from timers.

## Primary experience

1. Codeville detects Codex and restores five persisted lots.
2. The user assigns repositories individually or provisions five disposable demo repositories in one click.
3. All workshops stay visible; selecting a card changes only the Foreman's Desk.
4. A real project can start individually. The disposable demo can start all five builders together.
5. Thread-scoped app-server messages update only their owning project and actor.
6. Approval requests enter a deterministic local queue and retain project identity.
7. Each completion is sanitized into **Landed** plus **Follow-up**, upgrades only that workshop, and persists.
8. Relaunch restores lot positions, levels, completion state, and safe debriefs.

## Functional requirements

| ID | Requirement | Acceptance proof |
| --- | --- | --- |
| F1 | Detect the installed Codex CLI and show version/model readiness. | Resolver tests; source and packaged headers. |
| F2 | Maintain five fixed lot slots with opaque project IDs. | v2 schema tests; relaunch E2E. |
| F3 | Provision five isolated fixture repositories in one click. | E2E validates five directories and Git repositories. |
| F4 | Multiplex five real `gpt-5.6-sol` threads over one app-server. | Five-project source and packaged gates. |
| F5 | Route every event, interrupt, and approval by project. | Thread/project registries and concurrent E2E isolation. |
| F6 | Represent planning, reading, editing, testing, approval, failure, interruption, and completion. | Translator/state tests and visible timelines. |
| F7 | Emit only coarse events and validated debriefs to the renderer. | Closed types plus malicious debrief tests. |
| F8 | Show what landed and follow-up status in a builder bubble and accessible panel. | Five completion bubbles and DOM debrief assertions. |
| F9 | Keep one Pixi canvas alive after mount. | Canvas identity survives all five sessions. |
| F10 | Smooth independent actor movement with phase dedupe/dwell/coalescing. | Pure queue tests and delta-time spring controller. |
| F11 | Increment only the successfully completed project. | Store tests and five isolated level assertions. |
| F12 | Migrate v1 path-keyed progress without loss. | Migration test produces opaque ID and preserves level/count. |
| F13 | Package an Apple-silicon app with the demo fixture. | `package:mac` and five-project packaged E2E. |

## Privacy-safe debrief contract

```ts
interface CompletionDebrief {
  landed: string;                // validated plain language, ≤96 chars
  followUp: string;              // validated plain language, ≤96 chars
  followUpRecommended: boolean;
}

interface ProjectVillageEvent {
  projectId: string;             // opaque local UUID
  event: VillageEvent;
}
```

Codex receives a developer instruction to append a `CODEVILLE_DEBRIEF` JSON marker. The privileged process privately retains the latest completed agent message per active thread, parses only the marker at terminal completion, sanitizes it, emits/persists the safe object, and immediately discards the raw text. Missing, contradictory, malformed, path-like, URL-like, code-shaped, or secret-shaped content is normalized or replaced with a generic fallback.

## Persistence

```ts
interface ProgressionData {
  version: 2;
  lots: [VillageLot, VillageLot, VillageLot, VillageLot, VillageLot];
  projects: Record<string, {
    projectId: string;
    level: number;
    completedSessions: number;
    lastCompletedAt: string | null;
    lastDebrief: CompletionDebrief | null;
  }>;
}
```

The local atomic store uses mode `0600`. It persists repository name/path only for restoring the local village. It does not persist tasks, commands, diffs, outputs, or raw final messages.

## Motion model

- One `Application` and `VillageScene` mount for the renderer lifetime.
- Five `BuilderActor` instances own independent displayed phases, queues, velocity, and targets.
- Duplicate events are ignored; active phases dwell at least 650 ms.
- When queues grow, stale planning/reading phases coalesce while editing, testing, approval, and terminal outcomes remain.
- Movement uses delta-time critically damped springs; actors never reset to spawn on a phase change.
- Completion persists until another task starts or progression is reset.

## Success criteria

- Five real Codex repairs can run concurrently and finish in isolated repositories.
- Every fixture passes all four tests, every project reaches level 1, and every safe debrief is routed correctly.
- Canvas identity remains unchanged across all project events.
- Relaunch restores five lots and their safe outcomes.
- Typecheck, lint, 26 tests, build, two-project source E2E, five-project source E2E, package, and five-project packaged E2E pass.
- Submission includes an installable test build, public sub-three-minute narrated YouTube demo, repository, `/feedback` session ID, English description/testing instructions, and required disclosures.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Judge lacks model access | Detect readiness, document prerequisite, and show real run in video. |
| Five sessions increase model latency | Tiny independent fixture; individual start remains available. |
| Interleaved notifications cross projects | Register thread ownership before turns and envelope every renderer event. |
| Bursty events make actors snap | Persistent scene, per-actor queues, dwell/coalescing, delta-time springs. |
| Final prose leaks private data | Marker-only parser, deny-list sanitizer, bounds, generic fallback, raw-text disposal. |
| Unsigned app triggers Gatekeeper | Document Control-click launch and provide source; sign if credentials become available. |
