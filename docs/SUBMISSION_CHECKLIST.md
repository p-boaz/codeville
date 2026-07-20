# OpenAI Build Week submission checklist

Source of truth: [challenge overview](https://openai.devpost.com/), [FAQ](https://openai.devpost.com/details/faqs), and [official rules](https://openai.devpost.com/rules). Deadline: **Tuesday, July 21, 2026 at 5:00 PM PT**. Devpost does not permit changes after the deadline.

## Eligibility and entry

- [ ] Entrant is registered/joined on Devpost.
- [ ] Entrant and every team member meet age, residency, account, employer-policy, and other official-rule eligibility requirements.
- [ ] Team membership and contributor names are final and accurately disclosed.
- [x] Track selected: **Developer Tools**; one track only.
- [ ] Review official rules once more immediately before submission in case Devpost posts a clarification.

## Working project

- [x] Real project uses Codex with GPT-5.6.
- [x] Working desktop product, not a mock or slideware.
- [x] Included sample data/test fixture.
- [x] Judge can exercise the product without rebuilding it.
- [x] Installation instructions and supported platforms documented.
- [x] Privacy, sandbox, and approval behavior documented.
- [x] Automated unit, production-build, and real-session acceptance proof.
- [x] Deterministic native-input, terminal-waiting, same-thread continuation, sibling-routing, relaunch, Ghostty handoff, and reclaim proof.
- [x] Missing/malformed results enter needs-review and never increment progression.
- [x] Metadata-only Codex connection proof excludes raw agent content.
- [x] Persistent progression verified across app relaunch.
- [x] Scaffold-isolation proof: checkouts asserted clean while five real builders work; changes land only through Install (squash commit verified).
- [x] Wall-mode leak proof: with drafts present, the DOM contains no task text, rail, or desk while wall mode is active.
- [x] Session ledger, land-earned levels, and work-order queues persist and restore across relaunch.
- [x] User-owned repositories can fill any lot, recover opaque identity/progression after reopening, and launch only individually or through an exact confirmed subset preflight.
- [x] Normal E2E cannot mutate user repositories; real working-tree proof requires explicit `CODEVILLE_REAL_E2E_CONFIG` authorization.
- [x] Produce final unsigned macOS `.app` archive with recorded SHA-256.
- [ ] Upload the archive to a stable, no-login release URL or Devpost attachment.
- [ ] Test the downloaded archive on a clean Apple-silicon macOS account before submission.
- [ ] Keep the working build available free of charge and unrestricted through the end of the official judging period.

## Repository

- [x] README includes setup, sample, running, test, architecture, supported platform, Codex acceleration, GPT-5.6 usage, and human decisions.
- [x] Relevant MIT license included.
- [x] Pre-existing code, generated bindings, dependencies, and third-party work disclosed.
- [x] Timestamped Build Week evidence included.
- [x] Five-project screenshot included at `docs/screenshots/codeville-five-projects.png`.
- [x] No secrets, local session logs, user data, build products, or private paths committed.
- [ ] Choose publication mode:
  - [ ] **Public repository:** publish with MIT license and verify logged-out access; or
  - [ ] **Private repository:** invite both `testing@devpost.com` and `build-week-event@openai.com`, then verify access.
- [ ] Freeze and tag the exact submitted commit (recommended: `v0.1.0-build-week`).
- [ ] Replace every `[ADD ...]` placeholder in `docs/DEVPOST_SUBMISSION.md`.

## Demo video

- [x] Complete sub-three-minute shot list and narration prepared.
- [ ] Record the real happy path with spoken audio.
- [ ] Explicitly say how both Codex **and** GPT-5.6 were used.
- [ ] Show real project operation, completion, and relaunch persistence.
- [ ] Keep duration under 3:00 and avoid private information/third-party copyrighted media.
- [ ] Upload to YouTube as **Public or Unlisted** (organizer email 2026-07-19: Unlisted is fine; verify playback in an incognito window).
- [ ] Verify 1080p, audio, captions, duration, and logged-out playback.
- [ ] Add public YouTube URL to Devpost and submission draft.

## Devpost form

- [x] Project name, tagline, track, description, build story, testing path, and human decisions drafted.
- [x] All repository submission material is in English.
- [ ] Add repository URL.
- [ ] Add packaged test-build URL/attachment and concise testing instructions.
- [ ] Add public YouTube URL.
- [x] Produce a five-project upgraded-village screenshot with no private data.
- [ ] Upload final screenshots to Devpost and verify their crop/order.
- [ ] Run `/feedback` in primary build thread `019f7398-bb25-74f2-9630-49f64427b392`.
- [ ] Paste the exact `/feedback` Codex Session ID into Devpost.
- [ ] Disclose all team members, open-source dependencies, generated bindings, and any other third-party material.
- [ ] Preview every field and open every URL in a logged-out/private browser.
- [ ] Submit before **July 21, 2026 at 5:00 PM PT**; save confirmation page/email and screenshots.

## Quality against judging criteria

- [x] **Technological implementation:** one real app-server multiplexes five GPT-5.6 threads with scoped events/approvals, sanitized debriefs, migration, persistence, and real packaged proof.
- [x] **Safety:** every session runs in an isolated scaffold worktree so agent work cannot touch the user checkout until an explicit Install; landing verbs are inspection-gated; batch execution is confirmation-gated; wall mode unmounts the desk register and the main process refuses diff IPC while it is up; real E2E is opt-in.
- [x] **Design:** coherent native five-workshop experience, stable spatial memory, smooth persistent scene, accessible outcomes, judge-ready fixture.
- [x] **Potential impact:** makes parallel agent work legible without constant log reading or private implementation exposure.
- [x] **Idea quality:** concurrent agent activity becomes a persistent spatial world with outcomes rather than another terminal/dashboard wrapper.

## Final risk checks

- [x] Judges without `gpt-5.6-sol` entitlement (free-tier Terra) can launch with `CODEVILLE_MODEL=<model>` — documented in the judge guide troubleshooting.
- [ ] Confirm the unsigned macOS distribution flow is acceptable; notarize/sign if credentials are available.
- [ ] Perform a deeper name/legal clearance before commercial use. A preliminary web search found an unrelated software-services business using “Codeville”; the hackathon entry should not imply affiliation.
- [ ] Do not claim OpenAI sponsorship, endorsement, or ownership of Codeville.
- [ ] Compare the final live Devpost form against this checklist—form fields are authoritative.
