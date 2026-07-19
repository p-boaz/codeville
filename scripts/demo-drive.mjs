// Drives the packaged judge build through the demo-script beats with real Codex
// sessions, paced for a human watching the screen (or recording it).
//
//   node scripts/demo-drive.mjs           # default pacing
//   DRIVE_FAST=1 node scripts/demo-drive.mjs
//
// The app stays open when the tour ends — explore freely, Ctrl+C to close.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const fast = process.env.DRIVE_FAST === '1';
const beatPause = fast ? 1_500 : 6_000;
const executablePath = resolve('release/mac-arm64/Codeville.app/Contents/MacOS/Codeville');

function narrate(message) {
  console.log(`\n▶ ${message}`);
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const userData = await mkdtemp(join(tmpdir(), 'codeville-demo-drive-'));
narrate(`Launching the packaged judge build (fresh app data: ${userData})`);
const app = await electron.launch({ executablePath, env: { ...process.env, CODEVILLE_USER_DATA_DIR: userData } });
let page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await sleep(beatPause);

narrate('Beat 1 — Create the five-project demo village');
await page.getByRole('button', { name: /create demo village/i }).first().click();
await page.getByRole('heading', { name: 'The whole village is awake' }).waitFor({ timeout: 30_000 });
await sleep(beatPause);

narrate('Beat 2 — Start all five builders (exact preflight, then confirm)');
await page.getByRole('button', { name: /start all builders/i }).click();
await sleep(fast ? 1_000 : 4_000);
await page.getByRole('button', { name: /confirm and start builders/i }).click();
await sleep(2_000);

narrate('Beat 2b — The Village feed names every builder’s real steps; redirect one mid-turn');
await sleep(fast ? 2_000 : 6_000);
try {
  await page.getByText('Redirect builder').first().click();
  await page.getByLabel('Redirect direction').fill('Prefer the smallest correct fix; skip refactors.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('New direction sent').first().waitFor({ timeout: 10_000 });
  narrate('Direction folded into the live turn — the builder was never stopped');
} catch {
  narrate('(Redirect window missed — the turn finished first; continuing the tour)');
}
await sleep(fast ? 1_000 : 3_000);

narrate('Beat 3 — Wall mode while five real Codex threads work (W toggles; watch chimneys, planks, blueprints)');
await page.locator('.village-stage').click({ position: { x: 20, y: 20 } });
await page.keyboard.press('w');
await sleep(fast ? 8_000 : 25_000);

narrate('Beat 4 — Back to the Foreman’s Desk; waiting for five inspection pennants');
await page.keyboard.press('w');
await page.locator('.project-tab.phase-reviewing').nth(4).waitFor({ timeout: 240_000 });
narrate('All five builders finished — pennants up, dock badge counting, repos still untouched');
await sleep(beatPause);

narrate('Beat 5 — Site Inspection on Acorn Tasks: fact line, builder’s account, full diff');
await page.getByRole('button', { name: /Acorn Tasks/ }).click();
await sleep(beatPause);
await page.getByRole('button', { name: /inspect the diff/i }).click();
await sleep(fast ? 3_000 : 10_000);

narrate('Beat 6 — Install in repository: one squash commit lands, the workshop levels up, a plaque appears');
await page.getByRole('button', { name: /install in repository/i }).click();
await sleep(beatPause);

narrate('Beat 7 — Install Lantern API; leave two pennants flying to show the mixed state');
await page.getByRole('button', { name: new RegExp('Lantern API') }).click();
await sleep(1_500);
await page.getByRole('button', { name: /install in repository/i }).click();
await sleep(fast ? 1_500 : 4_000);

narrate('Beat 8 — Queue a work order on Mossy Docs, then install: the next order starts by itself');
await page.getByRole('button', { name: /Mossy Docs/ }).click();
await page.locator('.orders-panel summary').click();
await page.getByLabel('New work order').fill('Add an edge-case test for empty projects');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await sleep(fast ? 1_500 : 3_000);
await page.getByRole('button', { name: /install in repository/i }).click();
await page.getByRole('button', { name: /stop safely/i }).waitFor({ timeout: 30_000 });
narrate('Mossy Docs installed AND its queued order auto-started — the lane stays saturated');
await sleep(beatPause);
await page.getByRole('button', { name: /stop safely/i }).click();
await sleep(fast ? 1_500 : 3_000);

narrate('Beat 9 — Quit and relaunch: town, levels, plaques, ledger, queue, and pending inspections all restore');
await app.close();
await sleep(2_000);
const relaunched = await electron.launch({ executablePath, env: { ...process.env, CODEVILLE_USER_DATA_DIR: userData } });
page = await relaunched.firstWindow();
await page.waitForLoadState('domcontentloaded');
await sleep(beatPause);
await page.getByRole('button', { name: /Acorn Tasks/ }).click();
await sleep(beatPause);

narrate('Tour complete. The app is yours — explore the ledger, wall mode (W), lots 1–5, chime mute. Ctrl+C here closes it.');
await new Promise(() => {});
