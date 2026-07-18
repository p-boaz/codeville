import type { CompletionDebrief, ProgressionData, VillageEvent } from '../shared/village-events';

export type SessionPhase =
  | 'idle'
  | 'starting'
  | 'planning'
  | 'reading'
  | 'editing'
  | 'testing'
  | 'approval'
  | 'input'
  | 'waiting'
  | 'needs_review'
  | 'external'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface ActivityEntry {
  id: string;
  at: string;
  label: string;
  tone: 'neutral' | 'active' | 'success' | 'danger';
}

export interface SessionState {
  phase: SessionPhase;
  model: string | null;
  events: ActivityEntry[];
  testsPassed: boolean;
  debrief: CompletionDebrief | null;
}

export const initialSessionState: SessionState = {
  phase: 'idle',
  model: null,
  events: [],
  testsPassed: false,
  debrief: null,
};

const labels: Record<VillageEvent['type'], string> = {
  session_started: 'Builder arrived',
  planning: 'Drawing construction plans',
  reading: 'Studying the project',
  editing: 'Building the improvement',
  running_command: 'Running an inspection',
  approval_required: 'Waiting for your decision',
  input_required: 'Waiting for your reply',
  input_resolved: 'Reply sent to the builder',
  tests_passed: 'Inspection passed',
  tests_failed: 'Inspection found a problem',
  session_completed: 'Improvement completed',
  session_needs_review: 'Result needs review',
  session_external: 'Conversation moved to Ghostty',
  session_failed: 'Construction paused',
  session_interrupted: 'Work stopped safely',
};

export function reduceSession(state: SessionState, event: VillageEvent): SessionState {
  const phase = phaseForEvent(event);
  const tone: ActivityEntry['tone'] =
    event.type === 'session_completed' || event.type === 'tests_passed'
      ? 'success'
      : event.type === 'session_failed' || event.type === 'tests_failed'
        ? 'danger'
        : phase === 'idle'
          ? 'neutral'
          : 'active';

  return {
    phase,
    model: event.type === 'session_started' ? event.model : state.model,
    testsPassed:
      event.type === 'tests_passed'
        ? true
        : event.type === 'tests_failed'
          ? false
          : state.testsPassed,
    debrief: event.type === 'session_completed' ? event.debrief : state.debrief,
    events: [
      ...state.events,
      {
        id: `${event.at}-${event.type}-${state.events.length}`,
        at: event.at,
        label:
          event.type === 'running_command'
            ? commandActivityLabel(event.category)
            : labels[event.type],
        tone,
      },
    ].slice(-8),
  };
}

function commandActivityLabel(category: Extract<VillageEvent, { type: 'running_command' }>['category']): string {
  switch (category) {
    case 'test':
      return 'Running a code inspection';
    case 'build':
      return 'Assembling the project';
    case 'lint':
      return 'Checking craftsmanship';
    case 'other':
      return 'Using local workshop tools';
  }
}

export function beginSession(state: SessionState): SessionState {
  return { ...state, phase: 'starting', events: [], testsPassed: false, debrief: null };
}

export function resetSession(): SessionState {
  return initialSessionState;
}

function phaseForEvent(event: VillageEvent): SessionPhase {
  switch (event.type) {
    case 'session_started':
    case 'planning':
      return 'planning';
    case 'reading':
      return 'reading';
    case 'editing':
      return 'editing';
    case 'running_command':
    case 'tests_passed':
    case 'tests_failed':
      return 'testing';
    case 'approval_required':
      return 'approval';
    case 'input_required':
      return event.input.source === 'native' ? 'input' : 'waiting';
    case 'input_resolved':
      return 'planning';
    case 'session_completed':
      return 'completed';
    case 'session_needs_review':
      return 'needs_review';
    case 'session_external':
      return 'external';
    case 'session_failed':
      return 'failed';
    case 'session_interrupted':
      return 'interrupted';
  }
}

export function projectProgress(
  progression: ProgressionData,
  projectId: string | null,
): ProgressionData['projects'][string] | null {
  if (!projectId) return null;
  return progression.projects[projectId] ?? null;
}
