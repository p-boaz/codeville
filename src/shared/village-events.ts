export type CommandCategory = 'test' | 'build' | 'lint' | 'other';

export interface CompletionDebrief {
  landed: string;
  followUp: string;
  followUpRecommended: boolean;
}

export interface SafeInputQuestion {
  id: string;
  header: string;
  question: string;
  isSecret: boolean;
  choices: string[];
}

export interface SafePendingInput {
  source: 'native' | 'terminal' | 'resumable';
  title: string;
  questions: SafeInputQuestion[];
}

export type CodevilleResult =
  | { status: 'completed'; debrief: CompletionDebrief }
  | { status: 'waiting_for_input'; pendingInput: SafePendingInput };

export type VillageEvent =
  | { type: 'session_started'; at: string; model: string }
  | { type: 'planning'; at: string }
  | { type: 'reading'; at: string; quantity?: number }
  | { type: 'editing'; at: string; quantity?: number }
  | { type: 'running_command'; at: string; category: CommandCategory }
  | { type: 'approval_required'; at: string; requestId: string; category: 'command' | 'file_change' | 'permissions' }
  | { type: 'input_required'; at: string; input: SafePendingInput }
  | { type: 'input_resolved'; at: string }
  | { type: 'tests_passed'; at: string }
  | { type: 'tests_failed'; at: string }
  | { type: 'session_completed'; at: string; debrief: CompletionDebrief }
  | { type: 'session_needs_review'; at: string }
  | { type: 'session_external'; at: string }
  | { type: 'session_failed'; at: string; recoverable: boolean }
  | { type: 'session_interrupted'; at: string }
  | { type: 'session_redirected'; at: string }
  | { type: 'diff_ready'; at: string; filesChanged: number; insertions: number; deletions: number }
  | { type: 'session_applied'; at: string; commit: string }
  | { type: 'session_kept'; at: string; branch: string }
  | { type: 'session_discarded'; at: string };

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

export interface ConnectionProof {
  connected: boolean;
  appServerPid: number | null;
  codexVersion: string | null;
  model: string;
  repositoryName: string;
  repositoryPath: string;
  threadId: string | null;
  activeTurnId: string | null;
  safeEventCount: number;
  connectedAt: string | null;
  turnStartedAt: string | null;
}

export interface PendingInputView extends SafePendingInput {
  requestId: string | null;
  projectId: string;
}

export interface InputRequestUpdate {
  projectId: string;
  request: PendingInputView | null;
}

export interface InputResponse {
  questionId: string;
  answers: string[];
}

export interface HandoffResult {
  launched: boolean;
  command: string;
  message: string;
}

export interface VillageLot {
  slot: 0 | 1 | 2 | 3 | 4;
  projectId: string | null;
  path: string | null;
  name: string | null;
  isDemo: boolean;
}

/** One ledger row: safe-register facts about a finished session and how it landed. */
export interface SessionRecord {
  sessionId: string;
  startedAt: string | null;
  endedAt: string;
  outcome: 'completed' | 'needs_review';
  filesChanged: number;
  insertions: number;
  deletions: number;
  testsPassed: boolean | null;
  durationMs: number | null;
  landing: 'applied' | 'kept' | 'discarded' | null;
  wallLanded: string | null;
}

export interface WorkOrder {
  id: string;
  task: string;
  createdAt: string;
}

export interface ProjectProgress {
  projectId: string;
  repositoryPath: string;
  repositoryName: string;
  isDemo: boolean;
  level: number;
  completedSessions: number;
  lastCompletedAt: string | null;
  lastDebrief: CompletionDebrief | null;
  lastThreadId: string | null;
  conversationStatus: 'idle' | 'waiting' | 'needs_review' | 'external';
  pendingInput: SafePendingInput | null;
  handoffAt: string | null;
  safeEventCount: number;
  lastTurnStartedAt: string | null;
  history: SessionRecord[];
  queue: WorkOrder[];
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

/** Telemetry facts plus the diffstat-verified desk account for one session. */
export interface SessionOutcome {
  testsPassed: boolean | null;
  durationMs: number | null;
  deskLanded: string | null;
  deskFollowUp: string | null;
  followUpRecommended: boolean;
}

/** Safe scaffold summary: counts and branch only, no paths or code. */
export interface PendingScaffoldView {
  projectId: string;
  branch: string;
  baseSubject: string;
  createdAt: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  outcome: SessionOutcome | null;
}

export interface SessionDiffFile {
  path: string;
  insertions: number;
  deletions: number;
  patch: string;
}

/** Desk register ONLY. Carries real paths and patches; must never cross the village event channel. */
export interface SessionDiffView {
  projectId: string;
  branch: string;
  baseCommit: string;
  baseSubject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: SessionDiffFile[];
}

export interface BatchLaunchProject {
  projectId: string;
  projectPath: string;
  projectName: string;
  task: string;
}

export interface CodevilleBridge {
  getEnvironment(): Promise<EnvironmentStatus>;
  selectProject(slot: VillageLot['slot']): Promise<ProjectSelection | null>;
  prepareDemoVillage(): Promise<ProjectSelection[]>;
  startSession(input: StartSessionInput): Promise<StartSessionResult>;
  interruptSession(projectId: string): Promise<void>;
  steerSession(projectId: string, message: string): Promise<void>;
  openScaffold(projectId: string): Promise<void>;
  respondToApproval(requestId: string, decision: ApprovalDecision): Promise<void>;
  respondToInput(projectId: string, requestId: string | null, answers: InputResponse[]): Promise<void>;
  continueSession(projectId: string, reply: string): Promise<StartSessionResult>;
  getConnectionProof(projectId: string): Promise<ConnectionProof>;
  handoffToGhostty(projectId: string): Promise<HandoffResult>;
  reclaimFromGhostty(projectId: string): Promise<void>;
  addWorkOrder(projectId: string, task: string): Promise<ProgressionData>;
  deleteWorkOrder(projectId: string, orderId: string): Promise<ProgressionData>;
  getPendingScaffold(projectId: string): Promise<PendingScaffoldView | null>;
  getSessionDiff(projectId: string): Promise<SessionDiffView | null>;
  applySession(projectId: string): Promise<{ commit: string }>;
  keepSession(projectId: string): Promise<{ branch: string }>;
  discardSession(projectId: string): Promise<void>;
  getProgression(): Promise<ProgressionData>;
  resetProgression(): Promise<ProgressionData>;
  onVillageEvent(listener: (event: ProjectVillageEvent) => void): () => void;
  onApprovalRequest(listener: (request: ApprovalRequestView | null) => void): () => void;
  onInputRequest(listener: (update: InputRequestUpdate) => void): () => void;
  onFocusProject(listener: (projectId: string) => void): () => void;
  setWallMode(on: boolean): Promise<void>;
}

declare global {
  interface Window {
    codeville: CodevilleBridge;
  }
}
