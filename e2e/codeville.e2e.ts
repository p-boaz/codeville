import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test } from '@playwright/test';

const executeFile = promisify(execFile);
const projectNames = ['Acorn Tasks', 'Lantern API', 'Mossy Docs', 'Pine Tests', 'Willow UI'];
const projectCount = Number(process.env.CODEVILLE_E2E_PROJECT_COUNT ?? '2');

function launchOptions(userData: string) {
  const packagedApp = process.env.CODEVILLE_PACKAGED_APP;
  return {
    ...(packagedApp ? { executablePath: resolve(packagedApp) } : { args: ['.'] }),
    env: { ...process.env, CODEVILLE_E2E: '1', CODEVILLE_USER_DATA_DIR: userData },
  };
}

test(`runs ${projectCount} real Codex builders without replacing the village canvas`, async () => {
  test.setTimeout(360_000);
  const userData = await mkdtemp(join(tmpdir(), 'codeville-e2e-'));
  let electronApp = await electron.launch(launchOptions(userData));

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByText('Build a five-project demo village')).toBeVisible();
    await page.getByRole('button', { name: /create demo village/i }).first().click();
    if (await page.getByRole('alert').isVisible()) throw new Error(`Demo preparation failed: ${await page.getByRole('alert').innerText()}`);
    await expect(page.getByRole('heading', { name: 'The whole village is awake' })).toBeVisible({ timeout: 30_000 });
    for (const name of projectNames) await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();

    await page.locator('.village-canvas canvas').evaluate((canvas) => { canvas.dataset.identity = 'persistent-scene'; });
    for (const name of projectNames.slice(0, projectCount)) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await page.getByRole('button', { name: /start building/i }).click();
      await expect(page.getByRole('button', { name: /stop safely/i })).toBeVisible({ timeout: 30_000 });
    }

    await expect(page.locator('.project-tab.phase-completed')).toHaveCount(projectCount, { timeout: 240_000 });
    await expect(page.locator('.village-canvas canvas')).toHaveAttribute('data-identity', 'persistent-scene');

    for (const [slot, name] of projectNames.slice(0, projectCount).entries()) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await expect(page.getByLabel('Builder completion debrief')).toBeVisible();
      await expect(page.getByLabel(`${1} completed sessions`)).toBeVisible();
      const demoProject = join(userData, 'demo-village', `lot-${slot + 1}`);
      expect(await readFile(join(demoProject, 'src/health.js'), 'utf8')).not.toContain('Not implemented');
      const { stdout } = await executeFile('npm', ['test'], { cwd: demoProject });
      expect(stdout).toContain('pass 4');
    }

    const progression = JSON.parse(await readFile(join(userData, 'progression.json'), 'utf8')) as { version: number; lots: Array<{ projectId: string }>; projects: Record<string, { level: number }> };
    expect(progression.version).toBe(2);
    expect(progression.lots).toHaveLength(5);
    for (const lot of progression.lots.slice(0, projectCount)) expect(progression.projects[lot.projectId]?.level).toBe(1);
    await page.screenshot({ path: `test-results/codeville-${projectCount}-projects.png`, fullPage: true });

    await electronApp.close();
    electronApp = await electron.launch(launchOptions(userData));
    const relaunchedPage = await electronApp.firstWindow();
    for (const name of projectNames) await expect(relaunchedPage.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    await relaunchedPage.getByRole('button', { name: /Acorn Tasks/ }).click();
    await expect(relaunchedPage.getByLabel('1 completed sessions')).toBeVisible();
    await expect(relaunchedPage.getByLabel('Builder completion debrief')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
