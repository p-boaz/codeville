# Judge testing guide

## Fast path: provided macOS build

Prerequisites: Apple-silicon Mac, authenticated Codex CLI with `gpt-5.6-sol` access, and internet connectivity for Codex.

1. Download and unzip `Codeville-0.1.0-mac-arm64.zip`.
2. Open `Codeville.app`. The hackathon build is unsigned, so first launch may require **Control-click → Open → Open**.
3. Confirm the header shows `gpt-5.6-sol` and a Codex CLI version.
4. Click **Create demo village**. Five named workshops appear: Acorn Tasks, Lantern API, Mossy Docs, Pine Tests, and Willow UI.
5. Click **Start all builders**. Five real Codex threads repair five isolated repositories simultaneously. A typical verified run took 44–46 seconds; model load can vary.
6. Confirm all five project cards say **Complete**. Each workshop shows a dialogue bubble with **Landed** and follow-up status; selecting any project shows the same readable debrief and safe activity timeline.
7. Quit and reopen Codeville. Confirm all five workshops remain and select Acorn Tasks to verify level 1 and its debrief persisted.

To run a smaller proof, select one project and click **Start building** instead. The demo repositories live under Codeville's app-data directory and never touch a judge's own projects.

## Source verification

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:e2e
pnpm package:mac
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:packaged
```

The five-project acceptance gate launches Electron, provisions five repositories, starts five real GPT-5.6 Codex threads through one app-server, verifies every source edit and all four tests per repository, proves the Pixi canvas was never replaced, validates five isolated progression records, closes and relaunches Electron, and verifies persisted debriefs.

## Troubleshooting

- **Codex unavailable:** run `codex --version` and sign in to Codex, then reopen Codeville.
- **Model access error:** verify the account can start a `gpt-5.6-sol` Codex session.
- **Unsigned app warning:** use Control-click → Open. The complete source path remains available.
- **One builder pauses:** select its project card to see the exact error or approval request. Other projects continue independently.
- **Repeat the demo:** **Reset demo village** clears Codeville progression; **Create demo village** provisions fresh fixture copies.
