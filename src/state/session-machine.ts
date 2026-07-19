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
  | 'reviewing'
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

// Specific over cute: every label carries whatever safe detail the event
// brought along (file names, command text, diff stats, the debrief line).
export function describeEvent(event: VillageEvent): string {
  switch (event.type) {
    case 'session_started':
      return 'Builder arrived';
    case 'planning':
      return 'Planning';
    case 'reading':
      return event.detail ? `Reading ${event.detail}` : event.quantity ? `Reading the project · ${event.quantity} steps` : 'Reading the project';
    case 'editing':
      return event.detail ? `Editing ${event.detail}` : event.quantity != null ? `Editing ${event.quantity} ${event.quantity === 1 ? 'file' : 'files'}` : 'Editing files';
    case 'running_command':
      if (event.command) return `Running ${event.command}`;
      return { test: 'Running tests', build: 'Building', lint: 'Linting', other: 'Running a command' }[event.category];
    case 'approval_required':
      return `Needs your approval — ${{ command: 'command', file_change: 'file change', permissions: 'permissions' }[event.category]}`;
    case 'input_required':
      return 'Asked you a question';
    case 'input_resolved':
      return 'Reply sent to the builder';
    case 'tests_passed':
      return 'Tests passed';
    case 'tests_failed':
      return 'Tests failed';
    case 'session_completed':
      return `Done — ${event.debrief.landed}`;
    case 'session_needs_review':
      return 'Result needs review';
    case 'session_external':
      return 'Conversation moved to Ghostty';
    case 'session_failed':
      return 'Builder hit a problem';
    case 'session_interrupted':
      return 'Stopped safely';
    case 'session_redirected':
      return 'New direction sent';
    case 'diff_ready':
      return `Ready for inspection — ${event.filesChanged} ${event.filesChanged === 1 ? 'file' : 'files'}, +${event.insertions} −${event.deletions}`;
    case 'session_applied':
      return `Installed (commit ${event.commit.slice(0, 7)})`;
    case 'session_kept':
      return `Branch kept — ${event.branch}`;
    case 'session_discarded':
      return 'Work discarded';
  }
}

function toneForEvent(event: VillageEvent): ActivityEntry['tone'] {
  return event.type === 'session_completed' || event.type === 'tests_passed' || event.type === 'session_applied' || event.type === 'session_kept'
    ? 'success'
    : event.type === 'session_failed' || event.type === 'tests_failed'
      ? 'danger'
      : phaseForEvent(event) === 'idle'
        ? 'neutral'
        : 'active';
}

export function reduceSession(state: SessionState, event: VillageEvent): SessionState {
  const phase = phaseForEvent(event);
  const tone = toneForEvent(event);

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
        label: describeEvent(event),
        tone,
      },
    ].slice(-8),
  };
}

export interface FeedEntry {
  id: string;
  projectId: string;
  name: string;
  taskTag: string;
  label: string;
  tone: ActivityEntry['tone'];
  at: string;
}

const FEED_LIMIT = 30;

// One village-wide feed across all builders. A row identical to the latest
// one (same builder, same label) refreshes its timestamp instead of stacking.
export function reduceFeed(feed: FeedEntry[], input: { projectId: string; name: string; taskTag: string; event: VillageEvent }): FeedEntry[] {
  const label = describeEvent(input.event);
  const tone = toneForEvent(input.event);
  const last = feed.at(-1);
  if (last && last.projectId === input.projectId && last.label === label) {
    return [...feed.slice(0, -1), { ...last, at: input.event.at }];
  }
  return [
    ...feed,
    { id: `${input.event.at}-${input.projectId}-${input.event.type}-${feed.length}`, projectId: input.projectId, name: input.name, taskTag: input.taskTag, label, tone, at: input.event.at },
  ].slice(-FEED_LIMIT);
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
    case 'session_redirected':
      return 'planning';
    case 'diff_ready':
      return 'reviewing';
    case 'session_applied':
    case 'session_kept':
      return 'completed';
    case 'session_discarded':
      return 'idle';
  }
}

export function projectProgress(
  progression: ProgressionData,
  projectId: string | null,
): ProgressionData['projects'][string] | null {
  if (!projectId) return null;
  return progression.projects[projectId] ?? null;
}
