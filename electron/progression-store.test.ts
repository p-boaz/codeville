import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ProgressionStore } from './progression-store';

describe('ProgressionStore', () => {
  it('persists five assigned lots and safe completion data atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-progression-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/demo', name: 'Acorn Tasks', slot: 0, isDemo: true });
    await store.recordCompletion(project.projectId, '2026-07-18T00:00:00.000Z', {
      landed: 'Health summary passes every check.',
      followUp: 'No follow-up recommended.',
      followUpRecommended: false,
    });
    const value = await store.read();
    expect(value.lots[0].projectId).toBe(project.projectId);
    expect(value.projects[project.projectId]).toMatchObject({ level: 1, completedSessions: 1 });
    expect(await readFile(join(directory, 'progression.json'), 'utf8')).toContain('"version": 2');
  });

  it('migrates version one path keys to opaque project ids without losing progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-migration-'));
    await writeFile(join(directory, 'progression.json'), JSON.stringify({
      version: 1,
      projects: { '/private/acorn': { level: 3, completedSessions: 3, lastCompletedAt: '2026-07-17T00:00:00.000Z' } },
    }));
    const value = await new ProgressionStore(directory).read();
    const projectId = value.lots[0].projectId!;
    expect(projectId).not.toContain('private');
    expect(value.projects[projectId]).toMatchObject({ level: 3, completedSessions: 3, lastDebrief: null });
  });
});
