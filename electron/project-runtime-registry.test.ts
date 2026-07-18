import { describe, expect, it } from 'vitest';

import { ProjectRuntimeRegistry, type ProjectRuntime } from './project-runtime-registry';

function runtime(projectId: string, threadId: string): ProjectRuntime {
  return { projectId, threadId, turnId: `turn-${projectId}`, lastAgentMessage: 'private raw output', safeEventCount: 0, turnStartedAt: '2026-07-18T00:00:00.000Z' };
}

describe('ProjectRuntimeRegistry', () => {
  it('routes concurrent real threads by opaque project id in both directions', () => {
    const registry = new ProjectRuntimeRegistry();
    const graph = runtime('project-graph', 'thread-1');
    const kalshi = runtime('project-kalshi', 'thread-2');
    registry.add(graph);
    registry.add(kalshi);
    expect(registry.forThread('thread-2')?.projectId).toBe('project-kalshi');
    expect(registry.forProject('project-graph')?.threadId).toBe('thread-1');
  });

  it('interrupts or fails one project without removing its sibling and discards raw completion text', () => {
    const registry = new ProjectRuntimeRegistry();
    const graph = runtime('project-graph', 'thread-1');
    const kalshi = runtime('project-kalshi', 'thread-2');
    registry.add(graph);
    registry.add(kalshi);
    registry.remove(graph);
    expect(graph.lastAgentMessage).toBeNull();
    expect(registry.forProject('project-graph')).toBeUndefined();
    expect(registry.forProject('project-kalshi')).toBe(kalshi);
  });
});
