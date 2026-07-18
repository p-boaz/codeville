// Visual QA: seed a village at ascending workshop levels, launch the packaged
// build, and capture a screenshot for human review of tiers, plaques, and
// landmark drawing. Usage: node scripts/visual-qa.mjs [output.png]
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const output = process.argv[2] ?? 'test-results/visual-qa-tiers.png';
const executablePath = resolve('release/mac-arm64/Codeville.app/Contents/MacOS/Codeville');
const userData = await mkdtemp(join(tmpdir(), 'codeville-visual-qa-'));

const levels = [1, 2, 3, 4, 6];
const names = ['Acorn Tasks', 'Lantern API', 'Mossy Docs', 'Pine Tests', 'Willow UI'];
const projects = {};
const lots = levels.map((level, slot) => {
  const projectId = `qa-${slot}`;
  projects[projectId] = {
    projectId,
    repositoryPath: `/qa/${slot}`,
    repositoryName: names[slot],
    isDemo: true,
    level,
    completedSessions: level,
    lastCompletedAt: '2026-07-18T20:00:00.000Z',
    lastDebrief: slot === 4 ? { landed: 'Landmark workshop: six landed improvements.', followUp: 'No follow-up recommended.', followUpRecommended: false } : null,
    lastThreadId: null,
    conversationStatus: 'idle',
    pendingInput: null,
    handoffAt: null,
    safeEventCount: 0,
    lastTurnStartedAt: null,
    history: [],
    queue: [],
  };
  return { slot, projectId, path: `/qa/${slot}`, name: names[slot], isDemo: true };
});

await mkdir(userData, { recursive: true });
await writeFile(join(userData, 'progression.json'), JSON.stringify({ version: 2, lots, projects }, null, 2));

const app = await electron.launch({ executablePath, env: { ...process.env, CODEVILLE_USER_DATA_DIR: userData } });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(3_000);
await page.screenshot({ path: output, fullPage: true });
console.log(`Screenshot: ${output}`);
await app.close();
