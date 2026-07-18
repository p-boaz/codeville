import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const executeFile = promisify(execFile);
const projectNames = ['Acorn Tasks', 'Lantern API', 'Mossy Docs', 'Pine Tests', 'Willow UI'];
const projectCount = Number(process.env.CODEVILLE_E2E_PROJECT_COUNT ?? '1');

function launchOptions(userData: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const packagedApp = process.env.CODEVILLE_PACKAGED_APP;
  return {
    ...(packagedApp ? { executablePath: resolve(packagedApp) } : { args: ['.'] }),
    env: { ...process.env, CODEVILLE_E2E: '1', CODEVILLE_USER_DATA_DIR: userData, ...extraEnv },
  };
}

/** A renderer crash silently reloads the page and turns into misleading assertion flakes — fail loudly instead. */
function failOnRendererCrash(page: Page): void {
  page.on('crash', () => { throw new Error('The Codeville renderer crashed during the test'); });
}

test('deterministic protocol: native input, stopped-turn continuation, review, relaunch, handoff, and sibling routing', async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), 'codeville-protocol-e2e-'));
  const userData = join(root, 'user-data');
  const protocolLog = join(root, 'protocol.jsonl');
  const ghosttyLog = join(root, 'ghostty.jsonl');
  const fakeCodex = resolve('fixtures/fake-codex.mjs');
  const fakeGhostty = resolve('fixtures/fake-ghostty.mjs');
  const repositories = await Promise.all(['native', 'waiting', 'sibling', 'review'].map((name) => createSafeRepository(root, name)));
  const fixtureEnv = { CODEVILLE_CODEX_BINARY: fakeCodex, CODEVILLE_FAKE_LOG: protocolLog, CODEVILLE_GHOSTTY_BINARY: fakeGhostty, CODEVILLE_FAKE_GHOSTTY_LOG: ghosttyLog };
  let electronApp = await electron.launch(launchOptions(userData, fixtureEnv));

  try {
    let page = await electronApp.firstWindow();
    failOnRendererCrash(page);
    for (const [slot, repository] of repositories.entries()) await chooseRepository(electronApp, page, slot, repository);

    for (const [slot, task, phase] of [[2, 'fixture:complete sibling', 'completed'], [3, 'fixture:review', 'needs_review'], [1, 'fixture:waiting', 'waiting'], [0, 'fixture:native', 'input']] as const) {
      await page.getByRole('button', { name: new RegExp(`0${slot + 1}.*${basename(repositories[slot])}`, 'i') }).click();
      await page.getByPlaceholder('Describe one concrete coding task').fill(task);
      await page.getByRole('button', { name: /start building/i }).click();
      await expect(page.locator(`.project-tab.phase-${phase}`)).toHaveCount(1);
    }

    await expect(page.locator('.project-tab.phase-completed')).toHaveCount(1);
    await expect(page.locator('.project-tab.phase-input')).toHaveCount(1);
    await expect(page.locator('.project-tab.phase-waiting')).toHaveCount(1);
    await expect(page.locator('.project-tab.phase-needs_review')).toHaveCount(1);

    await page.getByRole('button', { name: /native/i }).click();
    await page.getByLabel('Preview').click();
    await page.getByLabel('Credential answer').fill('masked-fixture-value');
    await page.getByRole('button', { name: /send reply/i }).click();
    await expect(page.getByRole('heading', { name: 'Improvement complete' })).toBeVisible();

    await page.getByRole('button', { name: /review/i }).click();
    await expect(page.getByLabel('Result needs review')).toContainText('Progression was not changed');
    await expect(page.getByLabel('0 completed sessions')).toBeVisible();

    await electronApp.close();
    electronApp = await electron.launch(launchOptions(userData, fixtureEnv));
    page = await electronApp.firstWindow();
    failOnRendererCrash(page);
    await page.getByRole('button', { name: /waiting/i }).click();
    await expect(page.getByText('Which fixture channel should continue?')).toBeVisible();
    await page.getByLabel('Stable').click();
    await page.getByRole('button', { name: /send reply/i }).click();
    await expect(page.getByRole('heading', { name: 'Improvement complete' })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /continue in ghostty/i }).click();
    await expect(page.getByRole('button', { name: /return control to codeville/i })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /return control to codeville/i }).click();
    await expect(page.getByRole('button', { name: /continue in ghostty/i })).toBeVisible();

    const protocol = (await readFile(protocolLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const waitingThread = protocol.find((entry) => entry.method === 'turn/start' && entry.params?.input?.[0]?.text === 'fixture:waiting')?.params.threadId;
    expect(waitingThread).toBeTruthy();
    const threadStarts = protocol.filter((entry) => entry.method === 'thread/start');
    expect(threadStarts.length).toBeGreaterThanOrEqual(4);
    for (const entry of threadStarts) {
      expect(entry.params?.cwd).toContain('scaffolds');
      expect(repositories).not.toContain(entry.params?.cwd);
    }
    expect(protocol.some((entry) => entry.method === 'thread/resume' && entry.params?.threadId === waitingThread && entry.params?.sandbox === 'workspace-write' && entry.params?.approvalPolicy === 'on-request')).toBe(true);
    expect(protocol.some((entry) => entry.method === 'turn/start' && entry.params?.threadId === waitingThread && entry.params?.input?.[0]?.text === 'Stable')).toBe(true);
    const persisted = await readFile(join(userData, 'progression.json'), 'utf8');
    expect(persisted).not.toContain('masked-fixture-value');
    await expect.poll(async () => readFile(ghosttyLog, 'utf8').then((value) => value.includes(waitingThread)).catch(() => false)).toBe(true);
  } finally {
    await electronApp.close();
  }
});

async function createSafeRepository(root: string, name: string): Promise<string> {
  const repository = join(root, name);
  await mkdir(repository);
  await writeFile(join(repository, 'README.md'), `# ${name}\n`);
  await executeFile('git', ['init', '-b', 'main'], { cwd: repository });
  await executeFile('git', ['add', '-A'], { cwd: repository });
  await executeFile('git', ['-c', 'user.name=E2E', '-c', 'user.email=e2e@local', 'commit', '-m', 'initial'], { cwd: repository });
  return repository;
}

async function chooseRepository(electronApp: ElectronApplication, page: Page, slot: number, repository: string): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    const mutableDialog = dialog as unknown as { showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }> };
    mutableDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, repository);
  await page.getByRole('button', { name: new RegExp(`0${slot + 1}.*Empty lot`, 'i') }).click();
  await page.getByRole('button', { name: 'Choose repository', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(basename(repository)) })).toBeVisible();
}

test('assigns, restores, isolates tasks, and confirms a selected real-project subset without launching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeville-safe-real-e2e-'));
  const userData = join(root, 'user-data');
  const graphletter = await createSafeRepository(root, 'graphletter');
  const kalshi = await createSafeRepository(root, 'kalshi-mlb');
  let electronApp = await electron.launch(launchOptions(userData));

  try {
    let page = await electronApp.firstWindow();
    failOnRendererCrash(page);
    await chooseRepository(electronApp, page, 0, graphletter);
    await page.getByPlaceholder('Describe one concrete coding task').fill('Improve graph export');
    await chooseRepository(electronApp, page, 1, kalshi);
    await page.getByPlaceholder('Describe one concrete coding task').fill('Verify market ingestion');
    await page.getByRole('button', { name: /graphletter/i }).click();
    await expect(page.getByPlaceholder('Describe one concrete coding task')).toHaveValue('Improve graph export');
    await page.getByRole('checkbox', { name: /select graphletter/i }).uncheck();
    await page.getByRole('button', { name: /start selected builders/i }).click();
    await expect(page.getByRole('dialog', { name: /start 1 selected builder/i })).toContainText('kalshi-mlb');
    await expect(page.getByRole('dialog')).toContainText('Verify market ingestion');
    await expect(page.getByRole('dialog')).not.toContainText('Improve graph export');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Village ready')).toBeVisible();

    await electronApp.close();
    electronApp = await electron.launch(launchOptions(userData));
    page = await electronApp.firstWindow();
    await expect(page.getByRole('button', { name: /graphletter/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /kalshi-mlb/i })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test(`runs ${projectCount} real Codex builders without replacing the village canvas`, async () => {
  test.setTimeout(360_000);
  const userData = await mkdtemp(join(tmpdir(), 'codeville-e2e-'));
  let electronApp = await electron.launch(launchOptions(userData));

  try {
    const page = await electronApp.firstWindow();
    failOnRendererCrash(page);
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

    await expect(page.locator('.project-tab.phase-reviewing')).toHaveCount(projectCount, { timeout: 240_000 });
    await expect(page.locator('.village-canvas canvas')).toHaveAttribute('data-identity', 'persistent-scene');

    for (const [slot, name] of projectNames.slice(0, projectCount).entries()) {
      const demoProject = join(userData, 'demo-village', `lot-${slot + 1}`);
      // The scaffold contract: the checkout is untouched until the improvement is applied.
      expect(await readFile(join(demoProject, 'src/health.js'), 'utf8')).toContain('Not implemented');
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await expect(page.getByLabel('Builder completion debrief')).toBeVisible();
      await expect(page.getByLabel(`${1} completed sessions`)).toBeVisible();
      await expect(page.getByLabel('Improvement ready for inspection')).toBeVisible();
      await page.getByRole('button', { name: /install in repository/i }).click();
      await expect(page.getByLabel('Improvement ready for inspection')).toBeHidden();
      expect(await readFile(join(demoProject, 'src/health.js'), 'utf8')).not.toContain('Not implemented');
      const { stdout } = await executeFile('npm', ['test'], { cwd: demoProject });
      expect(stdout).toContain('pass 4');
      const { stdout: gitStatus } = await executeFile('git', ['status', '--porcelain'], { cwd: demoProject });
      expect(gitStatus.trim()).toBe('');
    }

    await expect(page.locator('.project-tab.phase-completed')).toHaveCount(projectCount);

    const progression = JSON.parse(await readFile(join(userData, 'progression.json'), 'utf8')) as { version: number; lots: Array<{ projectId: string }>; projects: Record<string, { level: number }> };
    expect(progression.version).toBe(2);
    expect(progression.lots).toHaveLength(5);
    for (const lot of progression.lots.slice(0, projectCount)) expect(progression.projects[lot.projectId]?.level).toBe(1);
    await page.screenshot({ path: `test-results/codeville-${projectCount}-projects.png`, fullPage: true });

    await electronApp.close();
    electronApp = await electron.launch(launchOptions(userData));
    const relaunchedPage = await electronApp.firstWindow();
    failOnRendererCrash(relaunchedPage);
    for (const name of projectNames) await expect(relaunchedPage.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    await relaunchedPage.getByRole('button', { name: /Acorn Tasks/ }).click();
    await expect(relaunchedPage.getByLabel('1 completed sessions')).toBeVisible();
    await expect(relaunchedPage.getByLabel('Builder completion debrief')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

const realE2EConfig = process.env.CODEVILLE_REAL_E2E_CONFIG;
test('opt-in: runs explicitly supplied real repositories concurrently', async () => {
  test.skip(!realE2EConfig, 'Set CODEVILLE_REAL_E2E_CONFIG to explicitly authorize real-repository mutation');
  test.setTimeout(600_000);
  const projects = JSON.parse(realE2EConfig!) as Array<{ path: string; task: string }>;
  if (!Array.isArray(projects) || projects.length < 1 || projects.length > 5 || projects.some((project) => !project.path || !project.task)) {
    throw new Error('CODEVILLE_REAL_E2E_CONFIG must be JSON with 1-5 { path, task } entries');
  }
  const userData = await mkdtemp(join(tmpdir(), 'codeville-opt-in-real-e2e-'));
  const electronApp = await electron.launch(launchOptions(userData));
  try {
    const page = await electronApp.firstWindow();
    failOnRendererCrash(page);
    for (const [slot, project] of projects.entries()) {
      await chooseRepository(electronApp, page, slot, resolve(project.path));
      await page.getByPlaceholder('Describe one concrete coding task').fill(project.task);
    }
    await page.getByRole('button', { name: /start selected builders/i }).click();
    const dialog = page.getByRole('dialog');
    for (const project of projects) {
      await expect(dialog).toContainText(basename(project.path));
      await expect(dialog).toContainText(project.task);
    }
    await page.getByRole('button', { name: /confirm and start builders/i }).click();
    await expect(page.locator('.project-tab.phase-reviewing, .project-tab.phase-completed')).toHaveCount(projects.length, { timeout: 540_000 });
  } finally {
    await electronApp.close();
  }
});
