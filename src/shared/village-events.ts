export type CommandCategory = 'test' | 'build' | 'lint' | 'other';

export interface CompletionDebrief {
  landed: string;
  followUp: string;
  followUpRecommended: boolean;
}

export type VillageEvent =
  | { type: 'session_started'; at: string; model: string }
  | { type: 'planning'; at: string }
  | { type: 'reading'; at: string; quantity?: number }
  | { type: 'editing'; at: string; quantity?: number }
  | { type: 'running_command'; at: string; category: CommandCategory }
  | { type: 'approval_required'; at: string; requestId: string; category: 'command' | 'file_change' | 'permissions' }
  | { type: 'tests_passed'; at: string }
  | { type: 'tests_failed'; at: string }
  | { type: 'session_completed'; at: string; debrief: CompletionDebrief }
  | { type: 'session_failed'; at: string; recoverable: boolean }
  | { type: 'session_interrupted'; at: string };

export interface ProjectVillageEvent {
  projectId: string;
  event: VillageEvent;
}

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

export interface ApprovalRequestView {
  requestId: string;
  projectId: string;
  category: 'command' | 'file_change' | 'permissions';
  title: string;
  explanation: string;
  command?: string;
  cwd?: string;
}

export interface EnvironmentStatus {
  codexAvailable: boolean;
  codexVersion: string | null;
  model: string;
  platform: NodeJS.Platform;
}

export interface VillageLot {
  slot: 0 | 1 | 2 | 3 | 4;
  projectId: string | null;
  path: string | null;
  name: string | null;
  isDemo: boolean;
}

export interface ProjectProgress {
  projectId: string;
  level: number;
  completedSessions: number;
  lastCompletedAt: string | null;
  lastDebrief: CompletionDebrief | null;
}

export interface ProgressionData {
  version: 2;
  lots: [VillageLot, VillageLot, VillageLot, VillageLot, VillageLot];
  projects: Record<string, ProjectProgress>;
}

export interface ProjectSelection {
  projectId: string;
  path: string;
  name: string;
  slot: VillageLot['slot'];
  isDemo: boolean;
}

export interface StartSessionInput {
  projectId: string;
  projectPath: string;
  projectName: string;
  task: string;
}

export interface StartSessionResult {
  threadId: string;
  turnId: string;
  model: string;
}

export interface CodevilleBridge {
  getEnvironment(): Promise<EnvironmentStatus>;
  selectProject(slot: VillageLot['slot']): Promise<ProjectSelection | null>;
  prepareDemoVillage(): Promise<ProjectSelection[]>;
  startSession(input: StartSessionInput): Promise<StartSessionResult>;
  interruptSession(projectId: string): Promise<void>;
  respondToApproval(requestId: string, decision: ApprovalDecision): Promise<void>;
  getProgression(): Promise<ProgressionData>;
  resetProgression(): Promise<ProgressionData>;
  onVillageEvent(listener: (event: ProjectVillageEvent) => void): () => void;
  onApprovalRequest(listener: (request: ApprovalRequestView | null) => void): () => void;
}

declare global {
  interface Window {
    codeville: CodevilleBridge;
  }
}
