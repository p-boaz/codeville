export type CommandCategory = 'test' | 'build' | 'lint' | 'other';

export type VillageEvent =
  | { type: 'session_started'; at: string; model: string }
  | { type: 'planning'; at: string }
  | { type: 'reading'; at: string; quantity?: number }
  | { type: 'editing'; at: string; quantity?: number }
  | { type: 'running_command'; at: string; category: CommandCategory }
  | { type: 'approval_required'; at: string; requestId: string; category: 'command' | 'file_change' | 'permissions' }
  | { type: 'tests_passed'; at: string }
  | { type: 'tests_failed'; at: string }
  | { type: 'session_completed'; at: string }
  | { type: 'session_failed'; at: string; recoverable: boolean }
  | { type: 'session_interrupted'; at: string };

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

export interface ApprovalRequestView {
  requestId: string;
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

export interface StartSessionInput {
  projectPath: string;
  projectName: string;
  task: string;
}

export interface StartSessionResult {
  threadId: string;
  turnId: string;
  model: string;
}

export interface ProgressionData {
  version: 1;
  projects: Record<string, { level: number; completedSessions: number; lastCompletedAt: string | null }>;
}

export interface CodevilleBridge {
  getEnvironment(): Promise<EnvironmentStatus>;
  selectProject(): Promise<{ path: string; name: string } | null>;
  prepareDemoProject(): Promise<{ path: string; name: string }>;
  startSession(input: StartSessionInput): Promise<StartSessionResult>;
  interruptSession(): Promise<void>;
  respondToApproval(requestId: string, decision: ApprovalDecision): Promise<void>;
  getProgression(): Promise<ProgressionData>;
  resetProgression(): Promise<ProgressionData>;
  onVillageEvent(listener: (event: VillageEvent) => void): () => void;
  onApprovalRequest(listener: (request: ApprovalRequestView | null) => void): () => void;
}

declare global {
  interface Window {
    codeville: CodevilleBridge;
  }
}
