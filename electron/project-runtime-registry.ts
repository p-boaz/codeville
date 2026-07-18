export interface ProjectRuntime {
  projectId: string;
  threadId: string;
  turnId: string | null;
  lastAgentMessage: string | null;
  safeEventCount: number;
  turnStartedAt: string | null;
}

export class ProjectRuntimeRegistry {
  private readonly byThreadId = new Map<string, ProjectRuntime>();
  private readonly threadIdByProjectId = new Map<string, string>();

  add(runtime: ProjectRuntime): void {
    if (this.threadIdByProjectId.has(runtime.projectId)) throw new Error('This project already has an active builder');
    this.byThreadId.set(runtime.threadId, runtime);
    this.threadIdByProjectId.set(runtime.projectId, runtime.threadId);
  }

  hasProject(projectId: string): boolean {
    return this.threadIdByProjectId.has(projectId);
  }

  hasActiveTurn(projectId: string): boolean {
    return Boolean(this.forProject(projectId)?.turnId);
  }

  forThread(threadId: string): ProjectRuntime | undefined {
    return this.byThreadId.get(threadId);
  }

  forProject(projectId: string): ProjectRuntime | undefined {
    const threadId = this.threadIdByProjectId.get(projectId);
    return threadId ? this.byThreadId.get(threadId) : undefined;
  }

  remove(runtime: ProjectRuntime): void {
    this.byThreadId.delete(runtime.threadId);
    if (this.threadIdByProjectId.get(runtime.projectId) === runtime.threadId) {
      this.threadIdByProjectId.delete(runtime.projectId);
    }
    runtime.lastAgentMessage = null;
  }
}
