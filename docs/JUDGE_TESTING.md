# Judge testing guide

## Fast path: provided macOS build

Prerequisites: Apple-silicon Mac, authenticated Codex CLI with `gpt-5.6-sol` access, and internet connectivity for Codex.

1. Download and unzip `Codeville-0.1.0-mac-arm64.zip`.
2. Open `Codeville.app`. The hackathon build is unsigned, so first launch may require **Control-click → Open → Open**.
3. Confirm the header shows `gpt-5.6-sol` and a Codex CLI version.
4. Click **Create demo village**. Five named workshops appear: Acorn Tasks, Lantern API, Mossy Docs, Pine Tests, and Willow UI.
5. Click **Start all builders**, review the exact five-repository/task preflight, then click **Confirm and start builders**. Five real Codex threads repair five isolated repositories simultaneously. A typical verified run took 44–46 seconds; model load can vary. Every builder works in an isolated *scaffold* (a git worktree) — the repositories themselves are untouched while agents work.
6. Each finished workshop flies a golden pennant and its card says **Inspect**. Select one: the **Site inspection** panel shows verified change counts, the builder's account, and the full diff on demand. Click **Install in repository** — one squash commit lands, the card turns **Complete**, and the debrief bubble appears. (Or **Keep branch only** / **Discard…** to prove the other landing verbs.)
7. Quit and reopen Codeville. Confirm all five workshops remain and select Acorn Tasks to verify level 1 and its debrief persisted. An uninstalled improvement also survives relaunch — its inspection panel restores.

To run a smaller proof, select one project and click **Start building** instead. The demo repositories live under Codeville's app-data directory and never touch a judge's own projects.

## Using real repositories

1. Select an **Empty lot**, click **Choose repository**, and select an existing Git repository such as `graphletter`.
2. Enter that repository's task at the Foreman's Desk. Repeat in another lot for `kalshi-mlb` or another repository; switching cards preserves each draft independently for the current app session.
3. For one repository, select its card and click **Start building**.
4. For several, check only the desired real-project cards and click **Start selected builders**.
5. Review the prominent preflight. It lists every exact repository basename, full local path, and task. Click **Cancel** to prove nothing launches, or **Confirm and start builders** to authorize the listed sessions.
6. Approval, failure, interruption, and completion remain project-scoped; selecting another card does not pause siblings.
7. In the deterministic fixture, answer the native multi-question card, verify the secret field is masked, and observe a sibling complete while another project waits.
8. Relaunch during terminal waiting, reply from the restored card, and expand **Codex connection proof** to verify the same thread ID and safe metadata.
9. **Continue in Ghostty** is disabled during active work. After the turn stops, confirm handoff, then confirm the CLI session is closed before **Return control to Codeville**.
10. A missing result marker displays **Result needs review** and leaves the completed-session count unchanged — but any real work the session produced is still inspectable and landable from its scaffold.
11. While builders run, `git status` in your repository stays clean: nothing an agent does can reach your checkout until you click **Install in repository**. The dock badge counts decisions waiting on you, and background notifications name only the repository — never task text or code.
11b. To run **two builders on one repository**, choose the same repository for a second lot and pick **Add a second workshop** in the dialog. Both builders work concurrently in separate scaffolds; each improvement is inspected and landed independently.
12. Quit and reopen to verify assignments, UUID identity, progression, and safe debriefs restore. Task drafts intentionally do not restore.

## Source verification

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:e2e
pnpm package:mac
CODEVILLE_E2E_PROJECT_COUNT=5 pnpm test:packaged
```

The five-project acceptance gate launches Electron, provisions five repositories, starts five real GPT-5.6 Codex threads through one app-server, proves each checkout is untouched while its builder works, installs each improvement through the inspection flow and verifies the squash commit plus all four tests per repository, proves the Pixi canvas was never replaced, validates five isolated progression records, closes and relaunches Electron, and verifies persisted debriefs.

The default gate also creates two temporary Git repositories, assigns them through the real native picker path, verifies per-project task isolation and subset preflight cancellation, and relaunches to prove assignment persistence. It does not run Codex in those repositories.

An actual user-repository E2E is opt-in only. Supplying this variable is explicit authorization for Codex to modify the listed working trees:

```sh
CODEVILLE_REAL_E2E_CONFIG='[{"path":"/absolute/path/graphletter","task":"Approved task"},{"path":"/absolute/path/kalshi-mlb","task":"Approved task"}]' pnpm test:e2e
```

## Troubleshooting

- **Codex unavailable:** run `codex --version` and sign in to Codex, then reopen Codeville.
- **Model access error:** verify the account can start a `gpt-5.6-sol` Codex session.
- **Unsigned app warning:** use Control-click → Open. The complete source path remains available.
- **One builder pauses:** select its project card to see the exact error or approval request. Other projects continue independently.
- **Repeat the demo:** **Reset demo village** clears Codeville progression; **Create demo village** provisions fresh fixture copies.
