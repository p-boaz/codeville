import { describe, expect, it } from 'vitest';

import { BuilderActor } from './BuilderActor';

describe('BuilderActor lifecycle phases', () => {
  it('keeps the same actor and container across input, waiting, review, and external phases', () => {
    const actor = new BuilderActor(0x123456);
    const container = actor.container;
    for (const phase of ['input', 'waiting', 'needs_review', 'external'] as const) {
      actor.update(phase);
      actor.tick(1_000);
      expect(actor.container).toBe(container);
    }
  });
});
