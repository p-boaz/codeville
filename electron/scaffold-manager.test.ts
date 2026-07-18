import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { ScaffoldError, ScaffoldManager, type ScaffoldRecord } from './scaffold-manager';

const executeFile = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await executeFile('git', args, { cwd });
  return stdout.trim();
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'codeville-repo-'));
  await git(repo, ['-c', 'init.defaultBranch=main', 'init']);
  await git(repo, ['config', 'user.name', 'Test']);
  await git(repo, ['config', 'user.email', 'test@local']);
  await writeFile(join(repo, 'health.js'), 'module.exports = () => 1;\n');
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

async function makeScaffold(): Promise<{ repo: string; manager: ScaffoldManager; record: ScaffoldRecord }> {
  const repo = await makeRepo();
  const manager = new ScaffoldManager(await mkdtemp(join(tmpdir(), 'codeville-scaffolds-')));
  const record = await manager.create(repo, 'project-1', 'session-1');
  return { repo, manager, record };
}

describe('ScaffoldManager', () => {
  it('creates an isolated worktree without touching the user checkout', async () => {
    const { repo, record } = await makeScaffold();
    await access(join(record.scaffoldPath, 'health.js'));
    expect(record.branch).toBe('codeville/session-1');
    expect(record.baseSubject).toBe('initial');
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
    expect(await readFile(join(repo, 'health.js'), 'utf8')).toContain('=> 1');
  });

  it('checkpoints agent work and reports truthful diff stats', async () => {
    const { manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\nmodule.exports.extra = true;\n');
    await writeFile(join(record.scaffoldPath, 'added.js'), 'module.exports = 3;\n');
    await manager.checkpoint(record);
    const stats = await manager.diffStats(record);
    expect(stats.filesChanged).toBe(2);
    expect(stats.changedPaths.sort()).toEqual(['added.js', 'health.js']);
    expect(stats.insertions).toBeGreaterThan(0);
    const files = await manager.diff(record);
    expect(files.find((file) => file.path === 'health.js')?.patch).toContain('=> 2');
  });

  it('applies as one squash commit and only then changes the user checkout', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await manager.checkpoint(record);
    expect(await readFile(join(repo, 'health.js'), 'utf8')).toContain('=> 1');
    const before = await git(repo, ['rev-list', '--count', 'HEAD']);
    await manager.apply(record, 'Improve health check');
    expect(await readFile(join(repo, 'health.js'), 'utf8')).toContain('=> 2');
    expect(await git(repo, ['rev-list', '--count', 'HEAD'])).toBe(String(Number(before) + 1));
    expect(await git(repo, ['log', '-1', '--format=%s'])).toBe('Improve health check');
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('refuses to apply onto a dirty tracked tree and explains what to do', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await manager.checkpoint(record);
    await writeFile(join(repo, 'health.js'), 'module.exports = () => 99;\n');
    await expect(manager.apply(record, 'x')).rejects.toThrow(/uncommitted changes/);
  });

  it('refuses to overwrite an untracked file that collides with the improvement', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'added.js'), 'module.exports = 3;\n');
    await manager.checkpoint(record);
    await writeFile(join(repo, 'added.js'), 'my private local file\n');
    await expect(manager.apply(record, 'x')).rejects.toThrow(/Untracked files are in the way/);
  });

  it('surfaces a conflict as a clean error, keeps the branch, and leaves the repo pristine', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await manager.checkpoint(record);
    await writeFile(join(repo, 'health.js'), 'module.exports = () => 7;\n');
    await git(repo, ['commit', '-am', 'user moved on']);
    await expect(manager.apply(record, 'x')).rejects.toThrow(ScaffoldError);
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
    expect(await git(repo, ['branch', '--list', 'codeville/session-1'])).toContain('codeville/session-1');
  });

  it('rejects applying a session that changed nothing', async () => {
    const { manager, record } = await makeScaffold();
    await manager.checkpoint(record);
    await expect(manager.apply(record, 'x')).rejects.toThrow(/nothing to apply/);
  });

  it('keep preserves the branch while discard removes branch and worktree', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await manager.checkpoint(record);
    await manager.keep(record);
    expect(await git(repo, ['branch', '--list', 'codeville/session-1'])).toContain('codeville/session-1');
    const second = await manager.create(repo, 'project-1', 'session-2');
    await manager.discard(second);
    expect(await git(repo, ['branch', '--list', 'codeville/session-2'])).toBe('');
    await expect(access(second.scaffoldPath)).rejects.toThrow();
  });

  it('lists crash survivors as orphans and never deletes them on its own', async () => {
    const { repo, manager, record } = await makeScaffold();
    await manager.create(repo, 'project-1', 'session-9');
    const orphans = await manager.listOrphans(new Set([record.sessionId]));
    expect(orphans.map((orphan) => orphan.sessionId)).toEqual(['session-9']);
    await access(orphans[0].scaffoldPath);
  });

  it('supports two concurrent workshops on one repository: parallel creates, then both land in turn', async () => {
    const repo = await makeRepo();
    const manager = new ScaffoldManager(await mkdtemp(join(tmpdir(), 'codeville-scaffolds-')));
    const [first, second] = await Promise.all([
      manager.create(repo, 'project-a', 'session-a'),
      manager.create(repo, 'project-b', 'session-b'),
    ]);
    expect(first.scaffoldPath).not.toBe(second.scaffoldPath);
    await writeFile(join(first.scaffoldPath, 'feature-a.js'), 'module.exports = "a";\n');
    await writeFile(join(second.scaffoldPath, 'feature-b.js'), 'module.exports = "b";\n');
    await Promise.all([manager.checkpoint(first), manager.checkpoint(second)]);
    await Promise.all([
      manager.apply(first, 'Land feature A').then(() => manager.discard(first)),
      manager.apply(second, 'Land feature B').then(() => manager.discard(second)),
    ]);
    await access(join(repo, 'feature-a.js'));
    await access(join(repo, 'feature-b.js'));
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
    expect(Number(await git(repo, ['rev-list', '--count', 'HEAD']))).toBe(3);
  });

  it('reports the exact paths two workshops both changed', async () => {
    const repo = await makeRepo();
    const manager = new ScaffoldManager(await mkdtemp(join(tmpdir(), 'codeville-scaffolds-')));
    const first = await manager.create(repo, 'project-a', 'session-a');
    const second = await manager.create(repo, 'project-b', 'session-b');
    await writeFile(join(first.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await writeFile(join(first.scaffoldPath, 'only-a.js'), 'a\n');
    await writeFile(join(second.scaffoldPath, 'health.js'), 'module.exports = () => 3;\n');
    await writeFile(join(second.scaffoldPath, 'only-b.js'), 'b\n');
    await manager.checkpoint(first);
    await manager.checkpoint(second);
    expect(await manager.sharedChangedPaths(first, second)).toEqual(['health.js']);
    expect(await manager.sharedChangedPaths(second, first)).toEqual(['health.js']);
  });

  it('refreshes a stale scaffold onto the moved HEAD and then lands cleanly', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'added.js'), 'module.exports = 3;\n');
    await manager.checkpoint(record);
    expect(await manager.isBaseStale(record)).toBe(false);
    await writeFile(join(repo, 'health.js'), 'module.exports = () => 7;\n');
    await git(repo, ['commit', '-am', 'user moved on']);
    expect(await manager.isBaseStale(record)).toBe(true);
    const { record: refreshed, upToDate } = await manager.refresh(record);
    expect(upToDate).toBe(false);
    expect(refreshed.baseSubject).toBe('user moved on');
    const stats = await manager.diffStats(refreshed);
    expect(stats.changedPaths).toEqual(['added.js']);
    await manager.apply(refreshed, 'Land refreshed work');
    expect(await readFile(join(repo, 'added.js'), 'utf8')).toContain('= 3');
    expect(await readFile(join(repo, 'health.js'), 'utf8')).toContain('=> 7');
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('aborts a conflicting refresh and leaves the scaffold exactly as it was', async () => {
    const { repo, manager, record } = await makeScaffold();
    await writeFile(join(record.scaffoldPath, 'health.js'), 'module.exports = () => 2;\n');
    await manager.checkpoint(record);
    await writeFile(join(repo, 'health.js'), 'module.exports = () => 7;\n');
    await git(repo, ['commit', '-am', 'conflicting change']);
    await expect(manager.refresh(record)).rejects.toThrow(/cannot be refreshed automatically/);
    const stats = await manager.diffStats(record);
    expect(stats.changedPaths).toEqual(['health.js']);
    expect(await readFile(join(record.scaffoldPath, 'health.js'), 'utf8')).toContain('=> 2');
    expect(await git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('refuses a repository with no commits with a plain-language error', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'codeville-empty-'));
    await git(repo, ['-c', 'init.defaultBranch=main', 'init']);
    const manager = new ScaffoldManager(await mkdtemp(join(tmpdir(), 'codeville-scaffolds-')));
    await expect(manager.create(repo, 'p', 's')).rejects.toThrow(/no commits yet/);
  });
});
