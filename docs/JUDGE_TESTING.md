# Judge testing guide

## Fast path: provided macOS test build

Prerequisites:

- Apple-silicon Mac
- authenticated Codex CLI with `gpt-5.6-sol` access
- internet connection for the Codex session

Steps:

1. Download and unzip the attached Codeville macOS test build.
2. Open `Codeville.app`. Because this hackathon build is unsigned, macOS may require **Control-click → Open → Open** on first launch.
3. Confirm the header shows `gpt-5.6-sol` and a Codex CLI version. If it says **Codex unavailable**, install/sign in to Codex and reopen the app.
4. Click **Use the judge-ready demo project**.
5. Click **Start building** and wait for **Improvement complete**. A typical run is under two minutes, but network/model load can vary.
6. Verify Workshop level is 1 and the activity timeline reports that all checks passed.
7. Quit and reopen the app, click **Use the judge-ready demo project**, and verify Workshop level is still 1.

The bundled demo is reset before each run, so it is safe to repeat. Its files live under Codeville's app-data directory, not in one of the judge's repositories.

## Source path

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The automated acceptance proof is:

```sh
pnpm test:e2e
```

It launches Electron, provisions the bundled fixture, runs a real GPT-5.6 Codex task, verifies the source edit and four passing fixture tests, closes and relaunches Electron, and confirms the persisted upgrade.

## Troubleshooting

- **Codex unavailable:** run `codex --version` and `codex login` in Terminal, then reopen Codeville.
- **Model access error:** verify the signed-in Codex account can start a `gpt-5.6-sol` session.
- **Unsigned app warning:** use Control-click → Open; the source path remains available for complete inspection.
- **Task interrupted:** click **New task** and rerun the bundled demo. The fixture is disposable.
