import { useState } from 'react';

import type { ConnectionProof, InputResponse, PendingInputView, PendingScaffoldView, ProjectProgress, EnvironmentStatus, ProjectSelection, SessionDiffView, SkillOption } from '../../shared/village-events';
import type { FeedEntry, SessionState } from '../../state/session-machine';
import { ConnectionProofPanel } from './ConnectionProofPanel';
import { InspectionCard } from './InspectionCard';
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
  pendingScaffold: PendingScaffoldView | null;
  sessionDiff: SessionDiffView | null;
  landingBusy: boolean;
  landingError: string | null;
  onLoadDiff(): void;
  onCloseDiff(): void;
  onApply(): void;
  onKeep(): void;
  onDiscard(): void;
  onAddOrder(task: string): void;
  onDeleteOrder(orderId: string): void;
  onStartNextOrder(): void;
  onSteer(message: string): Promise<void>;
  onOpenScaffold(): void;
  onRefresh(): void;
  skillOptions: SkillOption[];
  equippedSkills: string[];
  onToggleSkill(name: string): void;
  proof: ConnectionProof | null;
  handoffNotice: string | null;
  error: string | null;
  feed: FeedEntry[];
  onTaskChange(task: string): void;
  onChooseProject(): void;
  onEmptyLot(): void;
  hasDemoLots: boolean;
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
  reviewing: 'Improvement ready for inspection',
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
  pendingScaffold,
  sessionDiff,
  landingBusy,
  landingError,
  onLoadDiff,
  onCloseDiff,
  onApply,
  onKeep,
  onDiscard,
  onAddOrder,
  onDeleteOrder,
  onStartNextOrder,
  onSteer,
  onOpenScaffold,
  onRefresh,
  skillOptions,
  equippedSkills,
  onToggleSkill,
  proof,
  handoffNotice,
  error,
  feed,
  onTaskChange,
  onChooseProject,
  onEmptyLot,
  hasDemoLots,
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
        <div className="card-actions">
          <button className="card-action" onClick={onChooseProject} disabled={sessionActive} aria-label={project ? 'Change repository' : 'Choose repository'}>
            {project ? 'Change…' : 'Choose…'}
          </button>
          {project && (
            <button className="card-action" onClick={onEmptyLot} disabled={sessionActive} aria-label="Empty this lot">
              Empty lot
            </button>
          )}
        </div>
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

      {!sessionActive && !pendingScaffold && !['completed', 'waiting', 'needs_review', 'external', 'reviewing'].includes(session.phase) && (
        <>
          <label className="task-field">
            <span>What should the builder improve?</span>
            <textarea
              rows={5}
              value={task}
              onChange={(event) => onTaskChange(event.target.value)}
              placeholder="Describe one concrete coding task"
            />
          </label>
          {project && skillOptions.length > 0 && (
            <SkillsSection options={skillOptions} equipped={equippedSkills} onToggle={onToggleSkill} />
          )}
        </>
      )}

      {sessionActive && session.phase !== 'approval' && session.phase !== 'input' && <SteerSection onSteer={onSteer} />}

      {pendingInput && <InteractionCard key={`${pendingInput.requestId ?? 'terminal'}-${pendingInput.source}`} request={pendingInput} submitting={inputSubmitting} error={inputError} onSubmit={onSubmitInput} />}

      {session.phase === 'needs_review' && <section className="review-card" aria-label="Result needs review"><strong>Completion was not verified</strong><p>The Codex turn ended without a valid completed or waiting result marker. Progression was not changed.</p></section>}

      {pendingScaffold && !sessionActive && !pendingInput && (
        <InspectionCard
          scaffold={pendingScaffold}
          diff={sessionDiff}
          busy={landingBusy}
          error={landingError}
          onLoadDiff={onLoadDiff}
          onCloseDiff={onCloseDiff}
          onApply={onApply}
          onKeep={onKeep}
          onDiscard={onDiscard}
          onOpenScaffold={onOpenScaffold}
          onRefresh={onRefresh}
        />
      )}

      {feed.length > 0 && (
        <section className="activity-section" aria-label="Village feed">
          <div className="section-heading">
            <span>Village feed</span>
            <small>All builders, newest first</small>
          </div>
          <ol className="activity-list">
            {[...feed].reverse().map((entry, index) => (
              <li key={entry.id} className={`${entry.tone}${project && entry.projectId === project.projectId ? ' feed-selected' : ''}`}>
                <span className="timeline-marker">{index === 0 ? '●' : '✓'}</span>
                <span className="feed-body">
                  <span className="feed-source">{entry.name}{entry.taskTag ? ` · ${entry.taskTag}` : ''}</span>
                  <span>{entry.label}</span>
                </span>
                <time>{formatTime(entry.at)}</time>
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
          {(session.debrief ?? progress?.lastDebrief)!.followUpRecommended && (
            <button className="text-button" onClick={() => onAddOrder((session.debrief ?? progress?.lastDebrief)!.followUp)}>Queue as next work order</button>
          )}
        </section>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}
      {handoffNotice && <div className="handoff-notice" role="status">{handoffNotice}</div>}

      {project && progress && (
        <WorkOrdersSection
          queue={progress.queue}
          canStartNext={Boolean(environment?.codexAvailable && !sessionActive && !pendingScaffold && !pendingInput && progress.queue.length > 0 && !['waiting', 'external'].includes(session.phase))}
          onAdd={onAddOrder}
          onDelete={onDeleteOrder}
          onStartNext={onStartNextOrder}
        />
      )}

      {project && progress && progress.history.length > 0 && (
        <details className="proof-panel ledger-panel">
          <summary><span>Workshop ledger</span><strong>{progress.history.length} session{progress.history.length === 1 ? '' : 's'}</strong></summary>
          <ol className="ledger-list" aria-label="Session ledger">
            {[...progress.history].reverse().map((record) => (
              <li key={`${record.sessionId}-${record.endedAt}`}>
                <span className={`ledger-outcome ${record.outcome}`}>{record.outcome === 'completed' ? '✓' : '?'}</span>
                <span className="ledger-copy">
                  <span>{record.wallLanded ?? 'Result needed review'}</span>
                  <small>
                    {formatDay(record.endedAt)} · {record.filesChanged} file{record.filesChanged === 1 ? '' : 's'} +{record.insertions} −{record.deletions}
                    {record.testsPassed !== null && ` · tests ${record.testsPassed ? 'passed' : 'failed'}`}
                    {record.landing && ` · ${record.landing}`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

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
        ) : pendingInput || session.phase === 'external' || pendingScaffold ? null : session.phase === 'completed' || session.phase === 'needs_review' ? (
          <button className="primary-button" onClick={onNewTask}>Plan another improvement</button>
        ) : (
          <button className="primary-button" onClick={onStart} disabled={!canStart}>
            Start building
            <span aria-hidden="true">→</span>
          </button>
        )}
        <button className="text-button" onClick={onResetVillage} disabled={sessionActive || session.phase === 'external'}>{hasDemoLots ? 'Reset demo village' : 'Reset village…'}</button>
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

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const scopeOrder: Record<SkillOption['scope'], number> = { repo: 0, user: 1, system: 2, admin: 3 };

function SkillsSection({ options, equipped, onToggle }: { options: SkillOption[]; equipped: string[]; onToggle(name: string): void }) {
  const ordered = [...options].sort((left, right) =>
    (scopeOrder[left.scope] - scopeOrder[right.scope]) || left.name.localeCompare(right.name));
  return (
    <div className="skills-section" aria-label="Equip skills">
      <div className="section-heading">
        <span>Equip skills</span>
        <small>{equipped.length ? `${equipped.length} equipped` : 'Optional'}</small>
      </div>
      <div className="skill-chips">
        {ordered.map((skill) => {
          const isEquipped = equipped.includes(skill.name);
          return (
            <button
              key={`${skill.scope}-${skill.name}`}
              className={`skill-chip${isEquipped ? ' equipped' : ''}`}
              title={skill.description}
              aria-pressed={isEquipped}
              onClick={() => onToggle(skill.name)}
            >
              {skill.scope === 'repo' && <span className="skill-scope">repo</span>}
              {skill.name}
            </button>
          );
        })}
      </div>
      <small>Repo-specific skills come from this repository; the rest are your overarching set. Equipped skills ride along with the task.</small>
    </div>
  );
}

function SteerSection({ onSteer }: { onSteer(message: string): Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true); setNotice(null);
    try {
      await onSteer(draft.trim());
      setDraft('');
      setNotice('Direction sent — the builder keeps working with it folded in.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The redirect could not be sent.');
    } finally { setSending(false); }
  }

  return (
    <details className="proof-panel steer-panel">
      <summary><span>Redirect builder</span><strong>mid-turn</strong></summary>
      <div className="order-add">
        <input
          aria-label="Redirect direction"
          placeholder="e.g. Prefer the smaller fix; skip refactors"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void send(); }}
        />
        <button className="secondary-button" disabled={!draft.trim() || sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
      {notice && <small role="status">{notice}</small>}
      <small>Steers the active turn without stopping it. The builder is not interrupted.</small>
    </details>
  );
}

function WorkOrdersSection({ queue, canStartNext, onAdd, onDelete, onStartNext }: {
  queue: { id: string; task: string; createdAt: string }[];
  canStartNext: boolean;
  onAdd(task: string): void;
  onDelete(orderId: string): void;
  onStartNext(): void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <details className="proof-panel orders-panel" open={queue.length > 0}>
      <summary><span>Work orders</span><strong>{queue.length ? `${queue.length} queued` : 'None queued'}</strong></summary>
      {queue.length > 0 && (
        <ol className="orders-list" aria-label="Queued work orders">
          {queue.map((order, index) => (
            <li key={order.id}>
              <span className="order-position">{index + 1}</span>
              <span className="order-task">{order.task}</span>
              <button className="text-button" onClick={() => onDelete(order.id)} aria-label={`Remove order ${index + 1}`}>✕</button>
            </li>
          ))}
        </ol>
      )}
      <div className="order-add">
        <input
          aria-label="New work order"
          placeholder="Queue the next improvement"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && draft.trim()) { onAdd(draft); setDraft(''); } }}
        />
        <button className="secondary-button" disabled={!draft.trim()} onClick={() => { onAdd(draft); setDraft(''); }}>Add</button>
      </div>
      {canStartNext && <button className="primary-button" onClick={onStartNext}>Start next order <span aria-hidden="true">→</span></button>}
      <small>Orders are stored on this Mac (see the privacy note). The next order starts automatically when an improvement lands; otherwise start it yourself here.</small>
    </details>
  );
}
