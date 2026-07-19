import { describe, expect, it } from 'vitest';

import { initialSessionState, projectProgress, reduceFeed, reduceSession } from './session-machine';
import type { FeedEntry } from './session-machine';

describe('session state machine', () => {
  it('moves through a successful build without inventing progression', () => {
    const started = reduceSession(initialSessionState, {
      type: 'session_started',
      at: '2026-07-18T00:00:00.000Z',
      model: 'gpt-5.6-sol',
    });
    const editing = reduceSession(started, {
      type: 'editing',
      at: '2026-07-18T00:00:01.000Z',
      quantity: 1,
    });
    const completed = reduceSession(editing, {
      type: 'session_completed',
      at: '2026-07-18T00:00:02.000Z',
      debrief: { landed: 'Work completed.', followUp: 'No follow-up recommended.', followUpRecommended: false },
    });

    expect(started.phase).toBe('planning');
    expect(editing.phase).toBe('editing');
    expect(completed.phase).toBe('completed');
    expect(completed.events.map((event) => event.label)).toEqual([
      'Builder arrived',
      'Editing 1 file',
      'Done — Work completed.',
    ]);
  });

  it('returns a zero-level lot when no project has persisted progress', () => {
    expect(projectProgress({
      version: 2,
      lots: [0, 1, 2, 3, 4].map((slot) => ({ slot, projectId: null, path: null, name: null, isDemo: false })) as never,
      projects: {},
    }, 'project-id')).toBeNull();
  });

  it('keeps a failed project isolated while a sibling continues editing', () => {
    const failed = reduceSession(initialSessionState, { type: 'session_failed', at: '2026-07-18T00:00:00.000Z', recoverable: true });
    const sibling = reduceSession(initialSessionState, { type: 'editing', at: '2026-07-18T00:00:01.000Z' });
    expect(failed.phase).toBe('failed');
    expect(sibling.phase).toBe('editing');
  });

  it('distinguishes native input, stopped-turn waiting, review, and external ownership', () => {
    const native = reduceSession(initialSessionState, { type: 'input_required', at: '2026-07-18T00:00:00.000Z', input: { source: 'native', title: 'Input', questions: [{ id: 'one', header: 'One', question: 'Choose.', isSecret: false, choices: [] }] } });
    const terminal = reduceSession(initialSessionState, { type: 'input_required', at: '2026-07-18T00:00:00.000Z', input: { source: 'terminal', title: 'Input', questions: [{ id: 'one', header: 'One', question: 'Choose.', isSecret: false, choices: [] }] } });
    expect(native.phase).toBe('input');
    expect(terminal.phase).toBe('waiting');
    expect(reduceSession(initialSessionState, { type: 'session_needs_review', at: '2026-07-18T00:00:00.000Z' }).phase).toBe('needs_review');
    expect(reduceSession(initialSessionState, { type: 'session_external', at: '2026-07-18T00:00:00.000Z' }).phase).toBe('external');
  });

  it('labels village feed rows with builder identity and specific event detail', () => {
    const base = { projectId: 'p1', name: 'kalshi-mlb', taskTag: 'strategy review' };
    let feed = reduceFeed([], { ...base, event: { type: 'editing', at: '2026-07-18T00:00:00.000Z', quantity: 2, detail: 'App.tsx · styles.css' } });
    feed = reduceFeed(feed, { ...base, event: { type: 'running_command', at: '2026-07-18T00:00:01.000Z', category: 'test', command: 'pnpm vitest run' } });
    feed = reduceFeed(feed, { ...base, event: { type: 'diff_ready', at: '2026-07-18T00:00:02.000Z', filesChanged: 3, insertions: 42, deletions: 7 } });
    feed = reduceFeed(feed, { ...base, event: { type: 'session_completed', at: '2026-07-18T00:00:03.000Z', debrief: { landed: 'Strategy notes tightened.', followUp: 'None.', followUpRecommended: false } } });
    expect(feed.map((entry) => entry.label)).toEqual([
      'Editing App.tsx · styles.css',
      'Running pnpm vitest run',
      'Ready for inspection — 3 files, +42 −7',
      'Done — Strategy notes tightened.',
    ]);
    expect(feed[0]).toMatchObject({ name: 'kalshi-mlb', taskTag: 'strategy review' });
    const redirected = reduceFeed(feed, { ...base, event: { type: 'session_redirected', at: '2026-07-18T00:00:04.000Z', direction: 'Prefer minimal edits; do not restructure the README.' } });
    expect(redirected.at(-1)?.label).toBe('New direction — Prefer minimal edits; do not restructure the README.');
  });

  it('coalesces consecutive identical rows per builder instead of repeating them', () => {
    const base = { projectId: 'p1', name: 'kalshi-mlb', taskTag: 'strategy review' };
    let feed = reduceFeed([], { ...base, event: { type: 'planning', at: '2026-07-18T00:00:00.000Z' } });
    feed = reduceFeed(feed, { ...base, event: { type: 'planning', at: '2026-07-18T00:00:05.000Z' } });
    expect(feed).toHaveLength(1);
    expect(feed[0].at).toBe('2026-07-18T00:00:05.000Z');
    feed = reduceFeed(feed, { projectId: 'p2', name: 'graphletter', taskTag: 'qa review', event: { type: 'planning', at: '2026-07-18T00:00:06.000Z' } });
    feed = reduceFeed(feed, { ...base, event: { type: 'planning', at: '2026-07-18T00:00:07.000Z' } });
    expect(feed.map((entry) => entry.name)).toEqual(['kalshi-mlb', 'graphletter', 'kalshi-mlb']);
  });

  it('caps the village feed at thirty rows', () => {
    let feed: FeedEntry[] = [];
    for (let index = 0; index < 40; index += 1) {
      feed = reduceFeed(feed, {
        projectId: 'p1', name: 'kalshi-mlb', taskTag: '',
        event: index % 2 === 0 ? { type: 'planning', at: `2026-07-18T00:00:${String(index).padStart(2, '0')}.000Z` } : { type: 'tests_passed', at: `2026-07-18T00:00:${String(index).padStart(2, '0')}.000Z` },
      });
    }
    expect(feed.length).toBeLessThanOrEqual(30);
  });

  it('walks the landing flow: diff ready, then applied or discarded', () => {
    const reviewing = reduceSession(initialSessionState, { type: 'diff_ready', at: '2026-07-18T00:00:00.000Z', filesChanged: 3, insertions: 20, deletions: 4 });
    expect(reviewing.phase).toBe('reviewing');
    const applied = reduceSession(reviewing, { type: 'session_applied', at: '2026-07-18T00:00:01.000Z', commit: 'abc1234def' });
    expect(applied.phase).toBe('completed');
    expect(applied.events.at(-1)).toMatchObject({ tone: 'success', label: 'Installed (commit abc1234)' });
    const kept = reduceSession(reviewing, { type: 'session_kept', at: '2026-07-18T00:00:01.000Z', branch: 'codeville/session-1' });
    expect(kept.phase).toBe('completed');
    const discarded = reduceSession(reviewing, { type: 'session_discarded', at: '2026-07-18T00:00:01.000Z' });
    expect(discarded.phase).toBe('idle');
  });
});
