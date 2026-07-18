import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ProgressionStore } from './progression-store';

describe('ProgressionStore', () => {
  it('persists successful sessions atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-progression-'));
    const store = new ProgressionStore(directory);

    await store.recordCompletion('/safe/demo', '2026-07-18T00:00:00.000Z');
    const value = await store.read();

    expect(value.projects['/safe/demo']).toEqual({
      level: 1,
      completedSessions: 1,
      lastCompletedAt: '2026-07-18T00:00:00.000Z',
    });
    expect(await readFile(join(directory, 'progression.json'), 'utf8')).toContain('"version": 1');
  });
});
