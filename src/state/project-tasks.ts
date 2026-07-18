import type { BatchLaunchProject, ProgressionData } from '../shared/village-events';
import type { SessionState } from './session-machine';

const unavailablePhases: SessionState['phase'][] = ['starting', 'planning', 'reading', 'editing', 'testing', 'approval', 'input', 'waiting', 'external'];

export function updateProjectTask(tasks: Record<string, string>, projectId: string, task: string): Record<string, string> {
  return { ...tasks, [projectId]: task };
}

export function batchLaunchProjects(
  progression: ProgressionData,
  tasks: Record<string, string>,
  sessions: Record<string, SessionState>,
  selectedProjectIds: ReadonlySet<string>,
  demoTask: string,
): BatchLaunchProject[] {
  return progression.lots.flatMap((lot) => {
    if (!lot.projectId || !lot.path || !lot.name || !selectedProjectIds.has(lot.projectId)) return [];
    if (unavailablePhases.includes(sessions[lot.projectId]?.phase ?? 'idle')) return [];
    const task = (tasks[lot.projectId] ?? (lot.isDemo ? demoTask : '')).trim();
    if (!task) return [];
    return [{ projectId: lot.projectId, projectPath: lot.path, projectName: lot.name, task }];
  });
}
