import type { ConnectionProof, InputResponse, PendingInputView, ProjectProgress, EnvironmentStatus, ProjectSelection } from '../../shared/village-events';
import type { SessionState } from '../../state/session-machine';
import { ConnectionProofPanel } from './ConnectionProofPanel';
import { InteractionCard } from './InteractionCard';

interface TaskPanelProps {
  environment: EnvironmentStatus | null;
  project: ProjectSelection | null;
  task: string;
  session: SessionState;
  sessionActive: boolean;
  progress: ProjectProgress | null;
  pendingInput: PendingInputView | null;
  inputSubmitting: boolean;
  inputError: string | null;
  proof: ConnectionProof | null;
  handoffNotice: string | null;
  error: string | null;
  onTaskChange(task: string): void;
  onChooseProject(): void;
  onUseDemoVillage(): void;
  onStart(): void;
  onInterrupt(): void;
  onSubmitInput(answers: InputResponse[]): void;
  onHandoff(): void;
  onReclaim(): void;
  onNewTask(): void;
  onResetVillage(): void;
}

const phaseLabels: Record<SessionState['phase'], string> = {
  idle: 'Ready for a new improvement',
  starting: 'Opening the workshop…',
  planning: 'Drafting construction plans',
  reading: 'Studying the project',
  editing: 'Building the improvement',
  testing: 'Inspecting the work',
  approval: 'Waiting for your decision',
  input: 'Codex needs your input',
  waiting: 'Builder is waiting for direction',
  needs_review: 'Result needs review',
  external: 'Conversation is in Ghostty',
  completed: 'Improvement complete',
  failed: 'Construction failed',
  interrupted: 'Work interrupted',
};

export function TaskPanel({
  environment,
  project,
  task,
  session,
  sessionActive,
  progress,
  pendingInput,
  inputSubmitting,
  inputError,
  proof,
  handoffNotice,
  error,
  onTaskChange,
  onChooseProject,
  onUseDemoVillage,
  onStart,
  onInterrupt,
  onSubmitInput,
  onHandoff,
  onReclaim,
  onNewTask,
  onResetVillage,
}: TaskPanelProps) {
  const canStart = Boolean(environment?.codexAvailable && project && task.trim() && !sessionActive && !['waiting', 'external'].includes(session.phase));

  return (
    <aside className="task-panel">
      <div className="panel-title">
        <span className="eyebrow">Foreman's desk</span>
        <h2>{phaseLabels[session.phase]}</h2>
      </div>

      <section className="project-card">
        <div className="project-icon" aria-hidden="true">⌂</div>
        <div className="project-copy">
          <strong>{project?.name ?? 'No project selected'}</strong>
          <span>{project ? 'Local repository selected' : 'Choose a local repository'}</span>
        </div>
        <button className="icon-button" onClick={onChooseProject} disabled={sessionActive} aria-label="Choose repository">
          ↗
        </button>
      </section>
      {!project && !sessionActive && (
        <button className="demo-button" onClick={onUseDemoVillage}>
          <span aria-hidden="true">✦</span>
          Create the five-project demo village
        </button>
      )}

      {project && progress && (
        <div className="project-stats" aria-label={`${progress.completedSessions} completed sessions`}>
          <span>Lot {String(project.slot + 1).padStart(2, '0')}</span>
          <span>Workshop level <strong>{progress.level}</strong></span>
        </div>
      )}

      {!sessionActive && !['completed', 'waiting', 'needs_review', 'external'].includes(session.phase) && (
        <label className="task-field">
          <span>What should the builder improve?</span>
          <textarea
            rows={5}
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            placeholder="Describe one concrete coding task"
          />
        </label>
      )}

      {pendingInput && <InteractionCard key={`${pendingInput.requestId ?? 'terminal'}-${pendingInput.source}`} request={pendingInput} submitting={inputSubmitting} error={inputError} onSubmit={onSubmitInput} />}

      {session.phase === 'needs_review' && <section className="review-card" aria-label="Result needs review"><strong>Completion was not verified</strong><p>The Codex turn ended without a valid completed or waiting result marker. Progression was not changed.</p></section>}

      {session.events.length > 0 && (
        <section className="activity-section" aria-label="Safe activity timeline">
          <div className="section-heading">
            <span>Village activity</span>
            <small>Safe events only</small>
          </div>
          <ol className="activity-list">
            {session.events.map((event, index) => (
              <li key={event.id} className={event.tone}>
                <span className="timeline-marker">{index === session.events.length - 1 ? '●' : '✓'}</span>
                <span>{event.label}</span>
                <time>{formatTime(event.at)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(session.debrief ?? progress?.lastDebrief) && (
        <section className="debrief-card" aria-label="Builder completion debrief">
          <span className="eyebrow">Builder debrief</span>
          <div><strong>Landed</strong><p>{(session.debrief ?? progress?.lastDebrief)!.landed}</p></div>
          <div><strong>{(session.debrief ?? progress?.lastDebrief)!.followUpRecommended ? 'Recommended follow-up' : 'Follow-up'}</strong><p>{(session.debrief ?? progress?.lastDebrief)!.followUp}</p></div>
        </section>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}
      {handoffNotice && <div className="handoff-notice" role="status">{handoffNotice}</div>}

      {project && <ConnectionProofPanel proof={proof} />}

      {project && progress?.lastThreadId && (
        <section className="handoff-actions">
          {progress.conversationStatus === 'external'
            ? <button className="secondary-button" onClick={onReclaim}>Return control to Codeville</button>
            : <button className="secondary-button" onClick={onHandoff} disabled={sessionActive}>Continue in Ghostty</button>}
          <small>Conversation ownership is exclusive. Close the current owner before switching back.</small>
        </section>
      )}

      <section className="privacy-note">
        <span className="privacy-icon" aria-hidden="true">◇</span>
        <div>
          <strong>Private by construction</strong>
          <p>Task drafts stay in memory and are cleared when Codeville closes. Prompts, code, diffs, commands, and output are never sent to the village view.</p>
        </div>
      </section>

      <div className="panel-actions">
        {sessionActive ? (
          <button className="secondary-button" onClick={onInterrupt}>Stop safely</button>
        ) : pendingInput || session.phase === 'external' ? null : session.phase === 'completed' || session.phase === 'needs_review' ? (
          <button className="primary-button" onClick={onNewTask}>Plan another improvement</button>
        ) : (
          <button className="primary-button" onClick={onStart} disabled={!canStart}>
            Start building
            <span aria-hidden="true">→</span>
          </button>
        )}
        <button className="text-button" onClick={onResetVillage} disabled={sessionActive || session.phase === 'external'}>Reset demo village</button>
      </div>
    </aside>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
