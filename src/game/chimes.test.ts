import { describe, expect, it } from 'vitest';

import { chimeForEvent } from './chimes';

describe('chime routing', () => {
  it('maps decisions to needs_you, landings to landed, failure to failed, and stays silent otherwise', () => {
    const at = '2026-07-18T00:00:00.000Z';
    expect(chimeForEvent({ type: 'approval_required', at, requestId: '1', category: 'command' })).toBe('needs_you');
    expect(chimeForEvent({ type: 'input_required', at, input: { source: 'native', title: 'Input', questions: [] } })).toBe('needs_you');
    expect(chimeForEvent({ type: 'diff_ready', at, filesChanged: 1, insertions: 1, deletions: 0 })).toBe('needs_you');
    expect(chimeForEvent({ type: 'session_applied', at, commit: 'abc123' })).toBe('landed');
    expect(chimeForEvent({ type: 'session_kept', at, branch: 'codeville/x' })).toBe('landed');
    expect(chimeForEvent({ type: 'session_failed', at, recoverable: true })).toBe('failed');
    expect(chimeForEvent({ type: 'editing', at })).toBeNull();
    expect(chimeForEvent({ type: 'tests_failed', at })).toBeNull();
    expect(chimeForEvent({ type: 'session_completed', at, debrief: { landed: 'x', followUp: 'y', followUpRecommended: false } })).toBeNull();
  });
});
