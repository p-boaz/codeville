import { describe, expect, it } from 'vitest';

import { enqueueVisualPhase, phaseDwellMs } from './visual-phase-queue';

describe('visual phase queue', () => {
  it('deduplicates bursty events and keeps meaningful work', () => {
    let queue = enqueueVisualPhase('planning', [], 'reading');
    queue = enqueueVisualPhase('planning', queue, 'reading');
    queue = enqueueVisualPhase('planning', queue, 'editing');
    queue = enqueueVisualPhase('planning', queue, 'testing');
    expect(queue).toEqual(['reading', 'editing', 'testing']);
  });

  it('drops stale low-value phases when terminal state arrives', () => {
    expect(enqueueVisualPhase('editing', ['planning', 'reading', 'testing'], 'completed')).toEqual(['testing', 'completed']);
  });

  it('gives active phases a readable minimum dwell', () => {
    expect(phaseDwellMs('editing')).toBe(650);
    expect(phaseDwellMs('completed')).toBe(Number.POSITIVE_INFINITY);
  });
});
