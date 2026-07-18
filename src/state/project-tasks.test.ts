import { describe, expect, it } from 'vitest';

import type { ProgressionData } from '../shared/village-events';
import { initialSessionState, reduceSession } from './session-machine';
import { batchLaunchProjects, updateProjectTask } from './project-tasks';

const progression: ProgressionData = {
  version: 2,
  lots: [
    { slot: 0, projectId: 'graph', path: '/projects/graphletter', name: 'graphletter', isDemo: false },
    { slot: 1, projectId: 'kalshi', path: '/projects/kalshi-mlb', name: 'kalshi-mlb', isDemo: false },
    { slot: 2, projectId: null, path: null, name: null, isDemo: false },
    { slot: 3, projectId: null, path: null, name: null, isDemo: false },
    { slot: 4, projectId: null, path: null, name: null, isDemo: false },
  ],
  projects: {
    graph: { projectId: 'graph', repositoryPath: '/projects/graphletter', repositoryName: 'graphletter', isDemo: false, level: 0, completedSessions: 0, lastCompletedAt: null, lastDebrief: null, lastThreadId: null, conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 0, lastTurnStartedAt: null },
    kalshi: { projectId: 'kalshi', repositoryPath: '/projects/kalshi-mlb', repositoryName: 'kalshi-mlb', isDemo: false, level: 0, completedSessions: 0, lastCompletedAt: null, lastDebrief: null, lastThreadId: null, conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 0, lastTurnStartedAt: null },
  },
};

describe('project task and batch selection state', () => {
  it('edits one project task without changing another', () => {
    const tasks = updateProjectTask({ graph: 'Improve graph labels', kalshi: 'Verify odds' }, 'graph', 'Fix graph export');
    expect(tasks).toEqual({ graph: 'Fix graph export', kalshi: 'Verify odds' });
  });

  it('launches only the selected ready subset with exact project identity and tasks', () => {
    const projects = batchLaunchProjects(progression, { graph: 'Fix graph export', kalshi: 'Verify odds' }, {}, new Set(['kalshi']), 'demo');
    expect(projects).toEqual([{ projectId: 'kalshi', projectPath: '/projects/kalshi-mlb', projectName: 'kalshi-mlb', task: 'Verify odds' }]);
  });

  it('omits an active sibling without affecting another selected project', () => {
    const active = reduceSession(initialSessionState, { type: 'planning', at: '2026-07-18T00:00:00.000Z' });
    const projects = batchLaunchProjects(progression, { graph: 'Fix graph export', kalshi: 'Verify odds' }, { graph: active }, new Set(['graph', 'kalshi']), 'demo');
    expect(projects.map((project) => project.projectId)).toEqual(['kalshi']);
  });
});
