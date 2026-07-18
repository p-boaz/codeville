import { describe, expect, it } from 'vitest';

import { initialSessionState, projectProgress, reduceSession } from './session-machine';

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
      'Building the improvement',
      'Improvement completed',
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
});
