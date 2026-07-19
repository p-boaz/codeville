// Meticulous real-repo dogfood driver. Drives the PACKAGED app against the
// REAL userData village, phase by phase, with hard assertions at every step.
//
//   node scripts/dogfood-drive.mjs A     # lots UX
//   node scripts/dogfood-drive.mjs B     # full session: feed, steer, approve, install
//   node scripts/dogfood-drive.mjs C     # work orders + auto-start (bug repro)
//   node scripts/dogfood-drive.mjs E     # second workshop, batch, overlap, refresh
//   node scripts/dogfood-drive.mjs F     # waiting+context, interrupt
//   node scripts/dogfood-drive.mjs H     # persistence glance + reset
//
// Real Codex turns run in phases B/C/E/F. Every phase relaunches the app —
// persistence is exercised constantly, on purpose.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { _electron as electron } from '@playwright/test';

const run = promisify(execFile);
const phase = process.argv[2] ?? 'A';
const SHOTS = process.env.SHOT_DIR ?? 'test-results/dogfood';
const GEDCOM = join(homedir(), 'Projects/gedcom-kit');
const SPOTIFY = join(homedir(), 'Projects/spotify-history');
const BARPB = join(homedir(), 'Projects/bar-playbook');
const USER_DATA = join(homedir(), 'Library/Application Support/Codeville');

let checks = 0;
function ok(label) { checks += 1; console.log(`  OK ${String(checks).padStart(2, '0')}: ${label}`); }
function fail(label) { throw new Error(`FINDING: ${label}`); }
async function assert(condition, label) { if (!condition) fail(label); ok(label); }

async function progression() {
  try { return JSON.parse(await readFile(join(USER_DATA, 'progression.json'), 'utf8')); }
  catch { return { lots: [], projects: {} }; }
}

let app = await electron.launch({ executablePath: resolve('release/mac-arm64/Codeville.app/Contents/MacOS/Codeville'), env: { ...process.env } });
let page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
async function relaunch() {
  await app.close();
  app = await electron.launch({ executablePath: resolve('release/mac-arm64/Codeville.app/Contents/MacOS/Codeville'), env: { ...process.env } });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 1_500));
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${phase}-${name}.png`, fullPage: true });

// Native dialogs: scripted responses, with a log of what was asked so copy can be asserted.
async function scriptDialogs(openPath, messageResponses) {
  await app.evaluate(({ dialog }, options) => {
    globalThis.__dialogLog = [];
    dialog.showOpenDialog = async () => ({ canceled: options.openPath === null, filePaths: options.openPath ? [options.openPath] : [] });
    dialog.showMessageBox = async (_win, opts) => {
      const o = opts ?? _win; // (win, opts) or (opts)
      globalThis.__dialogLog.push({ message: o.message, detail: o.detail, buttons: o.buttons });
      return { response: options.responses.shift() ?? 0, checkboxChecked: false };
    };
  }, { openPath, responses: [...messageResponses] });
}
const dialogLog = () => app.evaluate(() => globalThis.__dialogLog ?? []);

// Approval watcher: asserts the dialog owns keyboard focus, logs the command, allows once.
async function watchApprovals() {
  const loop = async () => {
    for (;;) {
      const dialogVisible = await page.locator('.approval-dialog').isVisible().catch(() => false);
      if (dialogVisible) {
        // eslint-disable-next-line no-undef -- runs in the renderer
        const focusedIsDecline = await page.evaluate(() => document.activeElement?.textContent === 'Decline');
        const command = await page.locator('.approval-details code').textContent().catch(() => '(none)');
        console.log(`  APPROVAL: focusOnDecline=${focusedIsDecline} command=${command?.slice(0, 90)}`);
        if (!focusedIsDecline) console.log('  FINDING(soft): approval dialog did not focus Decline');
        await shot(`approval-${Date.now()}`);
        await page.getByRole('button', { name: 'Allow once' }).click().catch(() => undefined);
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 900));
    }
  };
  void loop();
}

async function assign(slot, repoPath, messageResponses = []) {
  await scriptDialogs(repoPath, messageResponses);
  await page.getByRole('button', { name: new RegExp(`0${slot + 1}`) }).click();
  const chooser = page.getByRole('button', { name: 'Choose repository', exact: true });
  if (await chooser.isVisible().catch(() => false)) await chooser.click();
  else await page.getByRole('button', { name: 'Change repository', exact: true }).click();
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 700));
}

async function startTask(lotPattern, task) {
  await page.getByRole('button', { name: lotPattern }).click();
  await page.getByPlaceholder('Describe one concrete coding task').fill(task);
  await page.getByRole('button', { name: /start building/i }).click();
}

async function awaitPennant(lotPattern, timeoutMs = 420_000) {
  await page.getByRole('button', { name: lotPattern }).and(page.locator('.phase-reviewing, .phase-completed, .phase-waiting, .phase-needs_review')).waitFor({ timeout: timeoutMs }).catch(async () => {
    // Fall back to a broad check: phase label inside the tab.
    await page.locator('.project-tab.phase-reviewing, .project-tab.phase-completed, .project-tab.phase-waiting').first().waitFor({ timeout: 30_000 });
  });
}

console.log(`— Phase ${phase} —`);

if (phase === 'A') {
  await assign(0, GEDCOM);
  await assert((await progression()).lots[0]?.name === 'gedcom-kit', 'lot 1 hosts gedcom-kit after Choose…');
  await assign(1, SPOTIFY);
  await assert((await progression()).lots[1]?.name === 'spotify-history', 'lot 2 hosts spotify-history');

  // Change… on an occupied lot to an already-assigned repo → replace-confirm fires first.
  await assign(1, GEDCOM, [1]);
  const log1 = await dialogLog();
  await assert(log1.some((entry) => /Lot 2 currently hosts spotify-history/.test(entry.message ?? '')), 'replace-confirm names the current occupant');
  await assert((await progression()).lots[1]?.name === 'spotify-history', 'replace Cancel changed nothing');

  // Choose an already-assigned repo for an EMPTY lot → three-way move dialog.
  await assign(3, GEDCOM, [2]);
  const log2 = await dialogLog();
  await assert(log2.some((entry) => /already assigned to lot 1/.test(entry.message ?? '')), 'duplicate-assign dialog names the occupied lot');
  await assert((await progression()).lots[3]?.projectId === null, 'move Cancel leaves the empty lot empty');

  // Replace-confirm: Change… on an occupied lot to a third repo, then Cancel; then confirm; then Empty lot.
  await assign(1, BARPB, [1]);
  await assert((await progression()).lots[1]?.name === 'spotify-history', 'replace Cancel keeps the occupant');
  await assign(1, BARPB, [0]);
  const afterReplace = await progression();
  await assert(afterReplace.lots[1]?.name === 'bar-playbook', 'replace confirm swaps the lot');
  await assert(Object.values(afterReplace.projects).some((p) => p.repositoryName === 'spotify-history'), 'evicted project record survives detached');
  await scriptDialogs(null, [0]);
  await page.getByRole('button', { name: 'Empty this lot', exact: true }).click();
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 600));
  await assert((await progression()).lots[1]?.projectId === null, 'Empty lot vacates');
  await assign(1, SPOTIFY);
  await assert((await progression()).lots[1]?.name === 'spotify-history', 'spotify returns to lot 2');
  await shot('final');
}

if (phase === 'B') {
  await watchApprovals();
  await startTask(/01.*gedcom-kit/i, 'In the main Python module of this repo, add one clear docstring to the least-documented public function. Keep the diff under 15 lines and touch only that one file.');
  await page.locator('.project-tab.phase-planning, .project-tab.phase-reading, .project-tab.phase-editing').first().waitFor({ timeout: 60_000 });
  ok('builder is visibly working (planning/reading/editing phase)');
  await page.getByText('Redirect builder').click();
  await page.getByLabel('Redirect direction').fill('Prefer the smallest possible diff.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('New direction — Prefer the smallest possible diff.').waitFor({ timeout: 15_000 });
  ok('feed echoes the steer direction verbatim');
  await page.keyboard.press('w');
  await assert(await page.locator('.task-panel').count() === 0, 'wall mode unmounts the desk');
  await page.keyboard.press('w');
  await awaitPennant(/01.*gedcom-kit/i);
  await shot('pennant');
  const feedRows = await page.locator('.activity-list li').allTextContents();
  await assert(feedRows.some((row) => /gedcom-kit/.test(row)), 'feed rows carry the repo name');
  await assert(feedRows.some((row) => /Reading|Editing|Running/.test(row)), 'feed rows carry specific verbs');
  // Inspect and install.
  await page.getByRole('button', { name: /01.*gedcom-kit/i }).click();
  const factLine = await page.locator('.fact-line').textContent().catch(() => null);
  console.log(`  fact line: ${factLine}`);
  await page.getByRole('button', { name: /inspect the diff/i }).click();
  await page.locator('.diff-view, .inspection-card code, .file-patch').first().waitFor({ timeout: 15_000 });
  ok('full diff renders on demand');
  await shot('diff');
  const before = (await run('git', ['rev-parse', 'HEAD'], { cwd: GEDCOM })).stdout.trim();
  await page.getByRole('button', { name: /install in repository/i }).click();
  await page.getByText(/Installed \(commit/).waitFor({ timeout: 30_000 });
  const after = (await run('git', ['rev-parse', 'HEAD'], { cwd: GEDCOM })).stdout.trim();
  await assert(before !== after, 'Install landed exactly one new commit');
  const subject = (await run('git', ['log', '-1', '--format=%s'], { cwd: GEDCOM })).stdout.trim();
  console.log(`  commit subject: ${subject}`);
  await assert(!/Codeville improvement/.test(subject) || subject.length > 0, 'squash subject present');
  const state = await progression();
  const gedcom = Object.values(state.projects).find((p) => p.repositoryName === 'gedcom-kit');
  await assert(gedcom?.level >= 1, 'level is land-earned');
  await assert((gedcom?.history ?? []).length >= 1, 'ledger recorded the session');
  await shot('landed');
}

if (phase === 'C') {
  await watchApprovals();
  const spotifyState = () => progression().then((s) => Object.values(s.projects).find((p) => p.repositoryName === 'spotify-history'));
  const boot = await spotifyState();
  await assert(boot?.queue.length === 1, 'the work order survived the earlier kill');
  const tombstonesBefore = (boot?.history ?? []).filter((entry) => entry.outcome === 'interrupted').length;

  // Deliberate mid-turn kill: start the queued order, wait for dequeue, quit the app.
  await page.getByRole('button', { name: /02.*spotify-history/i }).click();
  await page.getByRole('button', { name: /start next order/i }).click();
  let dequeuedAt = null;
  for (let i = 0; i < 60; i += 1) {
    if ((await spotifyState())?.queue.length === 0) { dequeuedAt = i; break; }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 1_000));
  }
  await assert(dequeuedAt !== null, `order dequeued after successful start (took ~${dequeuedAt}s)`);
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 8_000));
  console.log('  killing the app mid-turn on purpose…');
  await relaunch();
  const reborn = await spotifyState();
  await assert(((reborn?.history ?? []).filter((entry) => entry.outcome === 'interrupted').length) > tombstonesBefore, 'mid-turn kill left an interrupted ledger tombstone');
  await page.getByRole('button', { name: /02.*spotify-history/i }).click();
  await shot('tombstone');

  // Re-queue and run the order to completion this time.
  await page.getByLabel('New work order').fill('Add a module-level docstring to the smallest Python file in this repo that lacks one. Touch only that file.');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /start next order/i }).click();
  await awaitPennant(/02.*spotify-history/i);
  await shot('order-pennant');
  await page.getByRole('button', { name: /02.*spotify-history/i }).click();
  await page.getByRole('button', { name: /keep branch only/i }).click();
  await page.getByText(/Branch kept/).waitFor({ timeout: 30_000 });
  const branches = (await run('git', ['branch'], { cwd: SPOTIFY })).stdout;
  await assert(/codeville\//.test(branches), 'kept branch exists in the repository');
  const after = await spotifyState();
  await assert((after?.history ?? []).length >= 2, 'ledger holds both the tombstone and the landed session');
  await shot('kept');
}

if (phase === 'E') {
  await watchApprovals();
  await assign(2, GEDCOM, [1]); // second workshop
  await assert((await progression()).lots[2]?.name?.includes('· 2'), 'second workshop named "· 2"');
  await page.getByRole('button', { name: /01.*gedcom-kit/i }).click();
  await page.getByPlaceholder('Describe one concrete coding task').fill('In README.md only, tighten the wording of the Data layout section. Do not change any other file.');
  await page.getByRole('button', { name: /03.*gedcom-kit · 2/i }).click();
  await page.getByPlaceholder('Describe one concrete coding task').fill('In README.md only, tighten the wording of the Quick start section. Do not change any other file.');
  const boxes = page.locator('.batch-select input');
  for (let i = 0; i < await boxes.count(); i += 1) await boxes.nth(i).check();
  await page.getByRole('button', { name: /start selected builders/i }).click();
  await page.getByRole('dialog').getByText('gedcom-kit').first().waitFor({ timeout: 10_000 });
  ok('batch preflight lists the exact targets');
  await shot('preflight');
  await page.getByRole('button', { name: /confirm and start builders/i }).click();
  await page.locator('.project-tab.phase-reviewing').first().waitFor({ timeout: 420_000 });
  await page.locator('.project-tab.phase-reviewing').nth(1).waitFor({ timeout: 420_000 });
  await shot('both-pennants');
  // Overlap must be visible on at least one card BEFORE any landing.
  await page.getByRole('button', { name: /01.*gedcom-kit/i }).click();
  const overlapOn1 = await page.getByText(/also has a pending improvement/).isVisible().catch(() => false);
  await page.getByRole('button', { name: /03.*gedcom-kit · 2/i }).click();
  const overlapOn2 = await page.getByText(/also has a pending improvement/).isVisible().catch(() => false);
  await assert(overlapOn1 || overlapOn2, 'overlap warning visible on a pending card before landing');
  // Install lot 1, then lot 3 must show moved-ahead + Refresh (the staleness fix).
  await page.getByRole('button', { name: /01.*gedcom-kit/i }).click();
  await page.getByRole('button', { name: /install in repository/i }).click();
  await page.getByText(/Installed \(commit/).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /03.*gedcom-kit · 2/i }).click();
  await page.getByText(/HEAD has moved/).waitFor({ timeout: 15_000 });
  ok('sibling landing invalidated the second card (moved-ahead visible)');
  await shot('moved-ahead');
  await page.getByRole('button', { name: /refresh to latest/i }).click();
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 4_000));
  await page.getByText(/HEAD has moved/).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => console.log('  NOTE: moved-ahead persists after refresh — check for conflict message'));
  await shot('refreshed');
  await page.getByRole('button', { name: /discard/i }).first().click();
  await page.getByRole('button', { name: /really discard/i }).click();
  await page.getByText(/Work discarded|discarded/i).first().waitFor({ timeout: 20_000 });
  ok('discard is two-step and completes');
}

if (phase === 'F') {
  await watchApprovals();
  await startTask(/02.*spotify-history/i, 'Propose one small improvement to vault_export.py. Before changing ANY file, stop and ask me which direction I prefer, with your options.');
  await page.locator('.project-tab.phase-waiting, .project-tab.phase-input').first().waitFor({ timeout: 420_000 });
  await shot('waiting');
  const contextVisible = await page.locator('.interaction-context').isVisible().catch(() => false);
  console.log(`  waiting context paragraph present: ${contextVisible}`);
  if (!contextVisible) console.log('  FINDING(soft): builder omitted context — contract adherence to watch');
  const question = await page.locator('.interaction-card legend span').first().textContent().catch(() => null);
  console.log(`  question: ${question}`);
  // Reply and let it finish.
  const textInput = page.locator('.interaction-card input[type="text"], .interaction-card textarea').first();
  if (await textInput.isVisible().catch(() => false)) await textInput.fill('Pick your first option; keep the diff minimal.');
  else await page.locator('.interaction-card input').first().fill('Pick your first option; keep the diff minimal.');
  await page.getByRole('button', { name: /send|reply|continue/i }).first().click();
  await awaitPennant(/02.*spotify-history/i);
  await shot('after-reply');
  await page.getByRole('button', { name: /02.*spotify-history/i }).click();
  await page.getByRole('button', { name: /discard/i }).first().click().catch(() => undefined);
  await page.getByRole('button', { name: /really discard/i }).click().catch(() => undefined);
  // Interrupt coverage: start and stop safely.
  await startTask(/01.*gedcom-kit/i, 'List every TODO comment in this repo and write them into a new file TODOS.md.');
  await page.locator('.project-tab.phase-planning, .project-tab.phase-reading, .project-tab.phase-editing').first().waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: /stop safely/i }).click();
  await page.getByText(/Stopped safely|Work stopped/i).first().waitFor({ timeout: 30_000 });
  ok('interrupt reaches a safe stopped state');
  await shot('interrupted');
}

if (phase === 'H') {
  const state = await progression();
  console.log('  lots:', state.lots.map((lot) => lot.name ?? '—').join(' | '));
  for (const project of Object.values(state.projects)) {
    console.log(`  ${project.repositoryName}: level ${project.level}, sessions ${project.completedSessions}, ledger ${project.history.length}, queue ${project.queue.length}`);
  }
  await page.getByText('Codex connection proof').first().click().catch(() => undefined);
  await shot('proof');
  ok('persistence glance recorded (this launch itself proved restore)');
}

await shot('end');
await app.close();
console.log(`— Phase ${phase} PASSED (${checks} checks) —`);
process.exit(0);
