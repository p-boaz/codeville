import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test } from '@playwright/test';

const executeFile = promisify(execFile);

function launchOptions(userData: string) {
  const packagedApp = process.env.CODEVILLE_PACKAGED_APP;
  return {
    ...(packagedApp ? { executablePath: resolve(packagedApp) } : { args: ['.'] }),
    env: {
      ...process.env,
      CODEVILLE_E2E: '1',
      CODEVILLE_USER_DATA_DIR: userData,
    },
  };
}

test('completes a real Codex improvement and persists the village upgrade', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'codeville-e2e-'));
  let electronApp = await electron.launch(launchOptions(userData));

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByText('Choose a project to wake the village')).toBeVisible();
    await page.getByRole('button', { name: /judge-ready demo project/i }).click();
    if (await page.getByRole('alert').isVisible()) {
      throw new Error(`Demo preparation failed: ${await page.getByRole('alert').innerText()}`);
    }
    await expect(page.getByRole('heading', { name: 'Acorn Tasks' })).toBeVisible();

    await page.getByRole('button', { name: /start building/i }).click();
    await expect(page.getByText('Improvement complete', { exact: true })).toBeVisible({ timeout: 210_000 });
    await expect(page.getByText('1', { exact: true })).toBeVisible();

    const demoProject = join(userData, 'demo-project');
    const source = await readFile(join(demoProject, 'src/health.js'), 'utf8');
    expect(source).not.toContain('Not implemented');

    const { stdout } = await executeFile('npm', ['test'], { cwd: demoProject });
    expect(stdout).toContain('pass 4');

    const progression = JSON.parse(await readFile(join(userData, 'progression.json'), 'utf8')) as {
      projects: Record<string, { level: number }>;
    };
    expect(progression.projects[demoProject]?.level).toBe(1);

    await page.screenshot({ path: 'test-results/codeville-completed.png', fullPage: true });

    await electronApp.close();
    electronApp = await electron.launch(launchOptions(userData));
    const relaunchedPage = await electronApp.firstWindow();
    await relaunchedPage.getByRole('button', { name: /judge-ready demo project/i }).click();
    await expect(relaunchedPage.getByLabel('1 completed sessions')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
