import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
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
    expect((await stat(join(directory, 'progression.json'))).mode & 0o777).toBe(0o600);
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

  it('assigns a real repository to an empty lot and restores it after reopening', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-real-assignment-'));
    const assigned = await new ProgressionStore(directory).assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 3, isDemo: false });
    const restored = await new ProgressionStore(directory).read();

    expect(assigned.projectId).not.toContain('graphletter');
    expect(restored.lots[3]).toEqual({ slot: 3, projectId: assigned.projectId, path: '/projects/graphletter', name: 'graphletter', isDemo: false });
  });

  it('keeps detached progression and restores the same opaque identity when a repository is reopened', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-reopen-'));
    const store = new ProgressionStore(directory);
    const graphletter = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 0, isDemo: false });
    await store.recordCompletion(graphletter.projectId, '2026-07-18T00:00:00.000Z', { landed: 'Graph view improved.', followUp: 'No follow-up recommended.', followUpRecommended: false });
    await store.assignProject({ path: '/projects/kalshi-mlb', name: 'kalshi-mlb', slot: 0, isDemo: false });
    const reopened = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 2, isDemo: false });
    const value = await store.read();

    expect(reopened.projectId).toBe(graphletter.projectId);
    expect(value.projects[graphletter.projectId]).toMatchObject({ level: 1, completedSessions: 1, repositoryPath: '/projects/graphletter' });
    expect(value.lots[2].projectId).toBe(graphletter.projectId);
  });

  it('extends an existing version two record without resetting its assignment or debrief', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-v2-extension-'));
    await writeFile(join(directory, 'progression.json'), JSON.stringify({
      version: 2,
      lots: [
        { slot: 0, projectId: 'opaque-id', path: '/projects/graphletter', name: 'graphletter', isDemo: false },
        ...[1, 2, 3, 4].map((slot) => ({ slot, projectId: null, path: null, name: null, isDemo: false })),
      ],
      projects: {
        'opaque-id': { projectId: 'opaque-id', level: 2, completedSessions: 2, lastCompletedAt: '2026-07-18T00:00:00.000Z', lastDebrief: { landed: 'Graph export improved.', followUp: 'No follow-up recommended.', followUpRecommended: false } },
      },
    }));
    const value = await new ProgressionStore(directory).read();
    expect(value.lots[0].projectId).toBe('opaque-id');
    expect(value.projects['opaque-id']).toMatchObject({ repositoryPath: '/projects/graphletter', repositoryName: 'graphletter', level: 2, completedSessions: 2 });
  });

  it('persists terminal waiting state and thread identity without incrementing progression', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-waiting-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/waiting', name: 'Waiting', slot: 0, isDemo: true });
    await store.recordThread(project.projectId, 'thread-same', '2026-07-18T01:00:00.000Z');
    await store.recordWaiting(project.projectId, 'thread-same', {
      source: 'terminal', title: 'Builder needs direction',
      questions: [{ id: 'reply', header: 'Reply', question: 'Which channel should be used?', isSecret: false, choices: ['Stable', 'Preview'] }],
    }, 7, '2026-07-18T01:00:00.000Z');
    const value = await store.read();
    expect(value.projects[project.projectId]).toMatchObject({ level: 0, completedSessions: 0, lastThreadId: 'thread-same', conversationStatus: 'waiting', safeEventCount: 7 });
  });

  it('turns an interrupted native request into a generic resumable question on relaunch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-native-relaunch-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/native', name: 'Native', slot: 0, isDemo: true });
    await store.recordWaiting(project.projectId, 'thread-native', {
      source: 'native', title: 'Codex needs your input',
      questions: [{ id: 'credential', header: 'Credential', question: 'Enter the temporary credential.', isSecret: true, choices: [] }],
    });
    const relaunched = await new ProgressionStore(directory).read();
    const pending = relaunched.projects[project.projectId].pendingInput;
    expect(pending?.source).toBe('resumable');
    expect(JSON.stringify(pending)).not.toContain('credential');
  });

  it('restores external ownership without resuming and keeps the record metadata-only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-external-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/external', name: 'External', slot: 0, isDemo: false });
    await store.recordThread(project.projectId, 'thread-external', '2026-07-18T02:00:00.000Z');
    await store.recordExternal(project.projectId, '2026-07-18T02:05:00.000Z');
    const serialized = await readFile(join(directory, 'progression.json'), 'utf8');
    expect(JSON.parse(serialized).projects[project.projectId]).toMatchObject({ conversationStatus: 'external', lastThreadId: 'thread-external' });
    for (const forbidden of ['raw agent prose', 'private reply', 'command output', 'secret-value']) expect(serialized).not.toContain(forbidden);
  });

  it('records completion exactly once per explicit completion call and never for review state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-review-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/review', name: 'Review', slot: 0, isDemo: true });
    await store.recordNeedsReview(project.projectId, 'thread-review');
    expect((await store.read()).projects[project.projectId]).toMatchObject({ level: 0, completedSessions: 0, conversationStatus: 'needs_review' });
    await store.recordCompletion(project.projectId, '2026-07-18T03:00:00.000Z', { landed: 'Checks pass.', followUp: 'No follow-up recommended.', followUpRecommended: false });
    expect((await store.read()).projects[project.projectId]).toMatchObject({ level: 1, completedSessions: 1, conversationStatus: 'idle' });
  });

  it('serializes concurrent sibling updates without losing either thread or completion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-concurrent-store-'));
    const store = new ProgressionStore(directory);
    const first = await store.assignProject({ path: '/safe/first', name: 'First', slot: 0, isDemo: true });
    const second = await store.assignProject({ path: '/safe/second', name: 'Second', slot: 1, isDemo: true });
    await Promise.all([
      store.recordThread(first.projectId, 'thread-first', '2026-07-18T04:00:00.000Z'),
      store.recordThread(second.projectId, 'thread-second', '2026-07-18T04:00:00.000Z'),
    ]);
    await Promise.all([
      store.recordCompletion(first.projectId, '2026-07-18T04:01:00.000Z', { landed: 'First complete.', followUp: 'No follow-up recommended.', followUpRecommended: false }),
      store.recordWaiting(second.projectId, 'thread-second', { source: 'terminal', title: 'Direction', questions: [{ id: 'reply', header: 'Reply', question: 'Choose a channel.', isSecret: false, choices: [] }] }),
    ]);
    const value = await store.read();
    expect(value.projects[first.projectId]).toMatchObject({ lastThreadId: 'thread-first', completedSessions: 1 });
    expect(value.projects[second.projectId]).toMatchObject({ lastThreadId: 'thread-second', conversationStatus: 'waiting', completedSessions: 0 });
  });
});
