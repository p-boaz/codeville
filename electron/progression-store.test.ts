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
    expect(value.projects[project.projectId]).toMatchObject({ level: 0, completedSessions: 1 });
    await store.recordLanding(project.projectId, 'session-a', 'applied');
    expect((await store.read()).projects[project.projectId]).toMatchObject({ level: 1 });
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
    await store.recordCompletion(graphletter.projectId, '2026-07-18T00:00:00.000Z', { landed: 'Graph view improved.', followUp: 'No follow-up recommended.', followUpRecommended: false }, 3, null, 'session-g');
    await store.recordLanding(graphletter.projectId, 'session-g', 'applied');
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
    await store.recordCompletion(project.projectId, '2026-07-18T03:00:00.000Z', { landed: 'Checks pass.', followUp: 'No follow-up recommended.', followUpRecommended: false }, 5, '2026-07-18T02:58:00.000Z', 'session-r');
    expect((await store.read()).projects[project.projectId]).toMatchObject({ level: 0, completedSessions: 1, conversationStatus: 'idle' });
    const history = (await store.read()).projects[project.projectId].history;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ outcome: 'needs_review', landing: null });
    expect(history[1]).toMatchObject({ sessionId: 'session-r', outcome: 'completed', wallLanded: 'Checks pass.' });
    await store.updateSessionStats(project.projectId, 'session-r', { filesChanged: 2, insertions: 10, deletions: 1, testsPassed: true, durationMs: 90_000 });
    await store.recordLanding(project.projectId, 'session-r', 'kept');
    const landed = (await store.read()).projects[project.projectId];
    expect(landed.level).toBe(1);
    expect(landed.history[1]).toMatchObject({ filesChanged: 2, testsPassed: true, landing: 'kept' });
    await store.recordLanding(project.projectId, 'session-x', 'discarded');
    expect((await store.read()).projects[project.projectId].level).toBe(1);
  });

  it('assigns a second workshop on the same repository as a distinct identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-second-workshop-'));
    const store = new ProgressionStore(directory);
    const first = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 0, isDemo: false });
    const second = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 1, isDemo: false, secondWorkshop: true });
    const data = await store.read();
    expect(second.projectId).not.toBe(first.projectId);
    expect(data.lots[0]).toMatchObject({ projectId: first.projectId, name: 'graphletter' });
    expect(data.lots[1]).toMatchObject({ projectId: second.projectId, name: 'graphletter · 2' });
    expect(data.projects[second.projectId]).toMatchObject({ repositoryPath: '/projects/graphletter', repositoryName: 'graphletter · 2', level: 0 });
    const moved = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 2, isDemo: false });
    expect(moved.projectId).toBe(first.projectId);
  });

  it('persists work orders per project and removes them individually', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-orders-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/safe/orders', name: 'Orders', slot: 0, isDemo: false });
    await store.addWorkOrder(project.projectId, 'Fix the export bug');
    const data = await store.addWorkOrder(project.projectId, 'Refresh the README');
    const queue = data.projects[project.projectId].queue;
    expect(queue.map((order) => order.task)).toEqual(['Fix the export bug', 'Refresh the README']);
    const restored = await new ProgressionStore(directory).read();
    expect(restored.projects[project.projectId].queue).toHaveLength(2);
    const afterDelete = await store.deleteWorkOrder(project.projectId, queue[0].id);
    expect(afterDelete.projects[project.projectId].queue.map((order) => order.task)).toEqual(['Refresh the README']);
    await expect(store.addWorkOrder(project.projectId, '   ')).rejects.toThrow(/Describe the work order/);
  });

  it('moves exactly the named twin when an explicit projectId is provided', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-move-twin-'));
    const store = new ProgressionStore(directory);
    const main = await store.assignProject({ path: '/projects/shared', name: 'shared', slot: 3, isDemo: false });
    const twin = await store.assignProject({ path: '/projects/shared', name: 'shared', slot: 1, isDemo: false, secondWorkshop: true });
    const moved = await store.assignProject({ path: '/projects/shared', name: 'shared', slot: 4, isDemo: false, projectId: twin.projectId });
    const value = await store.read();
    expect(moved.projectId).toBe(twin.projectId);
    expect(value.lots[1].projectId).toBeNull();
    expect(value.lots[3].projectId).toBe(main.projectId);
    expect(value.lots[4].projectId).toBe(twin.projectId);
  });

  it('empties a lot while keeping the detached progression for a later return', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-clear-lot-'));
    const store = new ProgressionStore(directory);
    const graphletter = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 1, isDemo: false });
    await store.recordCompletion(graphletter.projectId, '2026-07-18T00:00:00.000Z', { landed: 'Graph view improved.', followUp: 'No follow-up recommended.', followUpRecommended: false }, 3, null, 'session-g');
    await store.recordLanding(graphletter.projectId, 'session-g', 'applied');
    const value = await store.clearLot(1);
    expect(value.lots[1]).toEqual({ slot: 1, projectId: null, path: null, name: null, isDemo: false });
    expect(value.projects[graphletter.projectId]).toMatchObject({ level: 1, completedSessions: 1 });
    const returned = await store.assignProject({ path: '/projects/graphletter', name: 'graphletter', slot: 4, isDemo: false });
    expect(returned.projectId).toBe(graphletter.projectId);
  });

  it('tombstones an abandoned session so a killed turn leaves ledger evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codeville-abandoned-'));
    const store = new ProgressionStore(directory);
    const project = await store.assignProject({ path: '/projects/spotify', name: 'spotify-history', slot: 0, isDemo: false });
    const value = await store.recordAbandonedSession(project.projectId, 'session-x', '2026-07-19T23:22:30.000Z', '2026-07-19T23:30:00.000Z');
    const record = value.projects[project.projectId].history.at(-1);
    expect(record).toMatchObject({ sessionId: 'session-x', outcome: 'interrupted', filesChanged: 0, landing: null });
    expect(value.projects[project.projectId].completedSessions).toBe(0);
    // A FRESH store must validate and keep the tombstone — a rejected record
    // silently empties the whole village on the next boot.
    const reread = await new ProgressionStore(directory).read();
    expect(reread.lots[0].name).toBe('spotify-history');
    expect(reread.projects[project.projectId].history.at(-1)).toMatchObject({ outcome: 'interrupted' });
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
